//! `sidecar.rs` — yt-dlp and ffmpeg sidecar execution helpers.
//!
//! Uses `tauri_plugin_shell` to invoke bundled binaries as sidecars.
//! These are the ONLY approved way to run yt-dlp and ffmpeg — never via
//! std::process::Command with a raw path.

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tracing::{debug, instrument};

use crate::thisvid_constants::{FFMPEG_SIDECAR_NAME, METADATA_TIMEOUT_SECS, YTDLP_SIDECAR_NAME};
use crate::types::{VideoFormat, VideoMetadata, YtDlpRaw};

// ─── Metadata Fetch ───────────────────────────────────────────────────────────

/// Fetch video metadata from yt-dlp (--dump-json) and parse into `VideoMetadata`.
///
/// Rule 3 (Null Reference Panics): All `YtDlpRaw` fields are `Option<T>`.
/// `.unwrap_or_default()` / `.unwrap_or_else()` are used exclusively.
#[instrument(skip(app_handle))]
pub async fn fetch_metadata(app_handle: &AppHandle, url: &str) -> Result<VideoMetadata> {
    let shell = app_handle.shell();

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(METADATA_TIMEOUT_SECS),
        async {
            let sidecar = shell
                .sidecar(YTDLP_SIDECAR_NAME)
                .context("yt-dlp sidecar not found — ensure binary is bundled")?
                .args([
                    "--dump-json",
                    "--no-playlist",
                    "--no-warnings",
                    url,
                ]);

            let (mut rx, child) = sidecar
                .spawn()
                .context("Failed to spawn yt-dlp process")?;

            let mut stdout_buf = String::new();
            let mut stderr_buf = String::new();

            while let Some(event) = rx.recv().await {
                use tauri_plugin_shell::process::CommandEvent;
                match event {
                    CommandEvent::Stdout(line) => {
                        stdout_buf.push_str(&String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Stderr(line) => {
                        stderr_buf.push_str(&String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Terminated(payload) => {
                        if payload.code != Some(0) {
                            anyhow::bail!(
                                "yt-dlp exited with code {:?}: {}",
                                payload.code,
                                stderr_buf.trim()
                            );
                        }
                        break;
                    }
                    _ => {}
                }
            }

            // Silence the unused variable warning — child is kept alive via rx
            drop(child);

            Ok::<String, anyhow::Error>(stdout_buf)
        },
    )
    .await
    .context("yt-dlp metadata fetch timed out")?
    .context("yt-dlp metadata fetch failed")?;

    debug!("yt-dlp metadata JSON length: {} bytes", output.len());
    let raw: YtDlpRaw = serde_json::from_str(&output)
        .context("Failed to parse yt-dlp JSON output")?;

    Ok(normalize_metadata(raw))
}

// ─── Normalize ────────────────────────────────────────────────────────────────

/// Convert raw yt-dlp JSON into the normalized `VideoMetadata` struct.
/// All unwraps use safe defaults — never panics.
fn normalize_metadata(raw: YtDlpRaw) -> VideoMetadata {
    let formats = raw
        .formats
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| {
            let format_id = f.format_id.unwrap_or_default();
            if format_id.is_empty() {
                return None;
            }

            let vcodec = f.vcodec.as_deref().unwrap_or("none");
            let acodec = f.acodec.as_deref().unwrap_or("none");
            let is_audio_only = vcodec == "none" && acodec != "none";
            let is_video_only = vcodec != "none" && acodec == "none";

            let height_str = f
                .height
                .map(|h| format!("{}p", h))
                .unwrap_or_else(|| "?".to_string());
            let ext = f.ext.as_deref().unwrap_or("?");
            let codec_str = format!(
                "{} + {}",
                if vcodec == "none" { "audio-only" } else { vcodec },
                if acodec == "none" { "video-only" } else { acodec }
            );
            let label = format!("{} {} ({})", height_str, ext.to_uppercase(), codec_str);

            Some(VideoFormat {
                format_id,
                label,
                ext: ext.to_string(),
                width: f.width,
                height: f.height,
                fps: f.fps,
                total_bitrate_kbps: f.tbr,
                file_size_bytes: f.filesize.or(f.filesize_approx),
                vcodec: vcodec.to_string(),
                acodec: acodec.to_string(),
                is_audio_only,
                is_video_only,
            })
        })
        .collect();

    // Parse upload_date from "YYYYMMDD" → "YYYY-MM-DD"
    let upload_date = raw
        .upload_date
        .as_deref()
        .and_then(|d| {
            if d.len() == 8 {
                Some(format!("{}-{}-{}", &d[0..4], &d[4..6], &d[6..8]))
            } else {
                None
            }
        })
        .unwrap_or_default();

    VideoMetadata {
        id: raw.id.unwrap_or_default(),
        title: raw.title.unwrap_or_else(|| "Unknown title".to_string()),
        description: raw.description.unwrap_or_default(),
        duration_seconds: raw.duration.unwrap_or(0.0),
        duration_formatted: raw.duration_string.unwrap_or_default(),
        uploader: raw.uploader.unwrap_or_default(),
        channel_url: raw.channel_url.unwrap_or_default(),
        upload_date,
        view_count: raw.view_count.unwrap_or(0),
        thumbnail_url: raw.thumbnail.unwrap_or_default(),
        webpage_url: raw.webpage_url.unwrap_or_default(),
        extractor: raw.extractor.unwrap_or_default(),
        is_live: raw.is_live.unwrap_or(false),
        formats,
    }
}

// ─── Download ─────────────────────────────────────────────────────────────────

/// Spawn a yt-dlp download process. Streams progress events back through `on_progress`.
/// The cancel_rx channel allows the caller to abort the process mid-download.
#[instrument(skip(app_handle, on_progress, cancel_rx))]
pub async fn download_video(
    app_handle: &AppHandle,
    url: &str,
    format_id: Option<&str>,
    output_directory: &str,
    task_id: &str,
    mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
    on_progress: impl Fn(f64, Option<String>, Option<String>),
) -> Result<()> {
    let shell = app_handle.shell();

    let output_template = format!(
        "{}/{}",
        output_directory,
        crate::thisvid_constants::OUTPUT_TEMPLATE
    );

    let mut args: Vec<&str> = vec![
        "--no-playlist",
        "--merge-output-format", "mp4",
        "--output", &output_template,
        "--newline",        // one progress line per line — easier to parse
        "--progress",
    ];

    let format_arg;
    if let Some(fid) = format_id {
        format_arg = fid.to_string();
        args.push("-f");
        args.push(&format_arg);
    }

    args.push(url);

    let sidecar = shell
        .sidecar(YTDLP_SIDECAR_NAME)
        .context("yt-dlp sidecar not found")?
        .args(&args);

    let (mut rx, child) = sidecar
        .spawn()
        .context("Failed to spawn yt-dlp download process")?;

    // Progress line regex — matches yt-dlp's "[download]  42.3% of 123.4MiB at 4.2MiB/s ETA 00:30"
    let progress_re = regex::Regex::new(
        r"\[download\]\s+([\d.]+)%.*?at\s+([\d.]+\s*\S+/s).*?ETA\s+(\d+:\d+)"
    )
    .expect("progress regex is valid");

    loop {
        tokio::select! {
            // Cancel signal received
            _ = &mut cancel_rx => {
                child.kill().ok();
                anyhow::bail!("Download cancelled by user");
            }
            event = rx.recv() => {
                use tauri_plugin_shell::process::CommandEvent;
                match event {
                    Some(CommandEvent::Stdout(line)) | Some(CommandEvent::Stderr(line)) => {
                        let text = String::from_utf8_lossy(&line);
                        if let Some(caps) = progress_re.captures(&text) {
                            let pct: f64 = caps[1].parse().unwrap_or(0.0);
                            let speed = Some(caps[2].to_string());
                            let eta   = Some(caps[3].to_string());
                            on_progress(pct, speed, eta);
                        }
                    }
                    Some(CommandEvent::Terminated(payload)) => {
                        if payload.code != Some(0) {
                            anyhow::bail!(
                                "yt-dlp download exited with code {:?}",
                                payload.code
                            );
                        }
                        break;
                    }
                    None => break,
                    _ => {}
                }
            }
        }
    }

    Ok(())
}

/// Verify ffmpeg sidecar is available. Called during setup.
pub async fn verify_ffmpeg(app_handle: &AppHandle) -> Result<()> {
    let shell = app_handle.shell();
    let _ = shell
        .sidecar(FFMPEG_SIDECAR_NAME)
        .context("ffmpeg sidecar not found — ensure binary is bundled")?
        .args(["-version"]);
    Ok(())
}
