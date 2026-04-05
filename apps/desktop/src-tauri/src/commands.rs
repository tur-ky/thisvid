//! Tauri command handlers.
//!
//! All commands are `async` — Rule 1 (Async Blindness).
//! All errors are propagated as `tauri::Error`-compatible strings so the
//! frontend `catch` block receives a meaningful message — Rule 5 (Loud Failures).

use chrono::Utc;
use tauri::{AppHandle, State, Emitter};
use tokio::sync::oneshot;
use tracing::{error, info, instrument};
use uuid::Uuid;

use crate::state::AppState;
use crate::types::{DownloadProgressEvent, DownloadStatus, DownloadTask, VideoMetadata};
use crate::{sidecar, thisvid_constants::TASK_ID_PREFIX};

// ─── fetch_metadata ───────────────────────────────────────────────────────────

/// Fetch metadata for a URL using yt-dlp. Returns normalized `VideoMetadata`.
#[tauri::command]
#[instrument(skip(app_handle, _state))]
pub async fn fetch_metadata(
    url: String,
    app_handle: AppHandle,
    _state: State<'_, AppState>,
) -> Result<VideoMetadata, String> {
    info!("fetch_metadata: {}", url);
    sidecar::fetch_metadata(&app_handle, &url)
        .await
        .map_err(|e| {
            error!("fetch_metadata error: {e:#}");
            format!("{e:#}")
        })
}

// ─── download_video ───────────────────────────────────────────────────────────

/// Start a download for the given task. Streams progress via Tauri events.
#[tauri::command]
#[instrument(skip(app_handle, state))]
pub async fn download_video(
    task_id: String,
    url: String,
    format_id: Option<String>,
    output_directory: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    info!("download_video: task={task_id} url={url}");

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    // Store the cancel sender so cancel_download can reach it
    {
        let mut handles = state.cancel_handles.lock().await;
        handles.insert(task_id.clone(), cancel_tx);
    }

    let task_id_clone = task_id.clone();
    let app_handle_clone = app_handle.clone();

    let result = sidecar::download_video(
        &app_handle,
        &url,
        format_id.as_deref(),
        &output_directory,
        &task_id,
        cancel_rx,
        move |pct, speed, eta| {
            // Emit progress event to frontend
            let event = DownloadProgressEvent {
                task_id: task_id_clone.clone(),
                progress_percent: pct,
                download_speed: speed,
                eta,
                status: DownloadStatus::Downloading,
            };
            app_handle_clone
                .emit("download_progress", &event)
                .unwrap_or_else(|e| error!("emit progress error: {e}"));
        },
    )
    .await;

    // Clean up cancel handle regardless of outcome
    {
        let mut handles = state.cancel_handles.lock().await;
        handles.remove(&task_id);
    }

    match result {
        Ok(_) => {
            app_handle
                .emit("download_complete", serde_json::json!({ "taskId": task_id }))
                .unwrap_or_else(|e| error!("emit complete error: {e}"));
            Ok(())
        }
        Err(e) => {
            let msg = format!("{e:#}");
            error!("download_video error: {msg}");
            // Rule 5: emit error event so frontend store always hears about failures
            app_handle
                .emit(
                    "download_error",
                    serde_json::json!({ "taskId": task_id, "message": msg }),
                )
                .unwrap_or_else(|e| error!("emit error event error: {e}"));
            Err(msg)
        }
    }
}

// ─── cancel_download ──────────────────────────────────────────────────────────

/// Cancel an in-progress download by sending to its abort channel.
#[tauri::command]
#[instrument(skip(state))]
pub async fn cancel_download(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut handles = state.cancel_handles.lock().await;
    if let Some(tx) = handles.remove(&task_id) {
        tx.send(()).ok(); // Receiver may already be dropped if download finished
        info!("cancel_download: sent cancel for task={task_id}");
    }
    Ok(())
}

// ─── get_default_output_dir ───────────────────────────────────────────────────

#[tauri::command]
pub async fn get_default_output_dir(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let dir = state.default_output_dir.lock().await;
    Ok(dir.clone())
}

// ─── set_default_output_dir ───────────────────────────────────────────────────

#[tauri::command]
pub async fn set_default_output_dir(
    directory: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut dir = state.default_output_dir.lock().await;
    *dir = directory;
    Ok(())
}

// ─── get_queue ────────────────────────────────────────────────────────────────

/// Return the current download queue as a JSON array.
#[tauri::command]
pub async fn get_queue(
    state: State<'_, AppState>,
) -> Result<Vec<DownloadTask>, String> {
    let queue = state.queue.lock().await;
    Ok(queue.values().cloned().collect())
}
