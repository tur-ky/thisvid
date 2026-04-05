//! Shared application state managed by Tauri.
//!
//! `AppState` is registered via `.manage()` in `lib.rs` and injected into
//! commands via `tauri::State<AppState>`.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::types::DownloadTask;

/// Tracks active download abort handles keyed by task ID.
/// Allows `cancel_download` to signal the correct yt-dlp process.
pub type CancelHandles = Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>;

/// Global application state, shared between Tauri commands and the HTTP server.
#[derive(Default)]
pub struct AppState {
    /// Active download queue — mirrors the frontend store for server-side access.
    pub queue: Arc<Mutex<HashMap<String, DownloadTask>>>,
    /// Abort senders for in-flight downloads.
    pub cancel_handles: CancelHandles,
    /// User-configured default output directory.
    pub default_output_dir: Arc<Mutex<String>>,
}
