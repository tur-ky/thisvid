//! Shared type definitions for the Tauri backend.
//!
//! These mirror the TypeScript interfaces in `/packages/core/types.ts`.
//! Kept in sync manually — the TS file is canonical.

use serde::{Deserialize, Serialize};

// ─── Download Status ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Idle,
    FetchingMetadata,
    Pending,
    Downloading,
    Postprocessing,
    Complete,
    Error,
    Cancelled,
}

// ─── Video Metadata ───────────────────────────────────────────────────────────

/// Normalized video metadata. Fields mirror `VideoMetadata` in types.ts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub id: String,
    pub title: String,
    pub description: String,
    pub duration_seconds: f64,
    pub duration_formatted: String,
    pub uploader: String,
    pub channel_url: String,
    pub upload_date: String,
    pub view_count: u64,
    pub thumbnail_url: String,
    pub webpage_url: String,
    pub extractor: String,
    pub is_live: bool,
    pub formats: Vec<VideoFormat>,
}

/// Normalized format entry. Mirrors `VideoFormat` in types.ts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoFormat {
    pub format_id: String,
    pub label: String,
    pub ext: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub total_bitrate_kbps: Option<f64>,
    pub file_size_bytes: Option<u64>,
    pub vcodec: String,
    pub acodec: String,
    pub is_audio_only: bool,
    pub is_video_only: bool,
}

// ─── Raw yt-dlp JSON ──────────────────────────────────────────────────────────

/// Raw yt-dlp --dump-json output. All fields are `Option<T>` because yt-dlp
/// does not guarantee every field for every extractor.
/// Rule 3 (Null Reference Panics): aggressive use of Option prevents panics.
#[derive(Debug, Deserialize)]
pub struct YtDlpRaw {
    pub id: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub duration: Option<f64>,
    pub duration_string: Option<String>,
    pub uploader: Option<String>,
    pub channel_url: Option<String>,
    pub upload_date: Option<String>,
    pub view_count: Option<u64>,
    pub thumbnail: Option<String>,
    pub webpage_url: Option<String>,
    pub extractor: Option<String>,
    pub is_live: Option<bool>,
    pub formats: Option<Vec<YtDlpFormat>>,
}

#[derive(Debug, Deserialize)]
pub struct YtDlpFormat {
    pub format_id: Option<String>,
    pub format_note: Option<String>,
    pub ext: Option<String>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub tbr: Option<f64>,
    pub filesize: Option<u64>,
    pub filesize_approx: Option<u64>,
}

// ─── Download Task ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub id: String,
    pub url: String,
    pub metadata: Option<VideoMetadata>,
    pub selected_format_id: Option<String>,
    pub output_directory: String,
    pub status: DownloadStatus,
    pub progress_percent: f64,
    pub download_speed: Option<String>,
    pub eta: Option<String>,
    pub added_at: String,
    pub completed_at: Option<String>,
    pub error_message: Option<String>,
}

// ─── IPC Payloads ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchMetadataPayload {
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadVideoPayload {
    pub task_id: String,
    pub url: String,
    pub format_id: Option<String>,
    pub output_directory: String,
}

/// Emitted as a Tauri event to the frontend during an active download.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub task_id: String,
    pub progress_percent: f64,
    pub download_speed: Option<String>,
    pub eta: Option<String>,
    pub status: DownloadStatus,
}

/// Payload received on the headless HTTP server from a remote mobile client.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDownloadRequest {
    pub url: String,
    pub format_id: Option<String>,
    pub output_directory: Option<String>,
}
