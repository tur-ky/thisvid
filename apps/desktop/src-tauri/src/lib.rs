// ─── thisvid — Tauri v2 Desktop Backend ──────────────────────────────────────
//
// Architecture:
//  - `lib.rs` exposes the public Tauri entry point: `run()`
//  - Commands: `fetch_metadata`, `download_video`, `cancel_download`,
//              `get_default_output_dir`, `set_default_output_dir`, `get_queue`
//  - Headless HTTP server: spawned on tokio::async_runtime, listens on 127.0.0.1:8080.
//    Forwards POST /download payloads to the Tauri event bus for the frontend.
//
// Defensive Protocol compliance:
//  - Rule 1 (Async Blindness): All commands are `async`. The HTTP server runs
//    in a separate `tokio::task::spawn` and never blocks main().
//  - Rule 2 (Stale Closures): AppHandle is cloned into async tasks;
//    the HTTP server holds an `Arc<AppHandle>` that keeps it live.
//  - Rule 3 (Null Reference Panics): `yt-dlp` JSON output is parsed with
//    `serde_json::from_str` and all optional fields use `Option<T>`.
//  - Rule 5 (Loud Failures): Every error is logged via `tracing::error!` AND
//    emitted as a Tauri event so the frontend store can surface it.

mod commands;
mod http_server;
mod sidecar;
mod state;
mod types;

pub use state::AppState;


use tracing::info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "thisvid=debug,info".parse().unwrap()),
        )
        .init();

    tauri::Builder::default()
        // ── Register plugins ─────────────────────────────────────────────────
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        // ── Manage shared state ──────────────────────────────────────────────
        .manage(state::AppState::default())
        // ── Register commands ────────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            commands::fetch_metadata,
            commands::download_video,
            commands::cancel_download,
            commands::get_default_output_dir,
            commands::set_default_output_dir,
            commands::get_queue,
        ])
        // ── Setup: spawn headless HTTP server after app is ready ─────────────
        .setup(|app| {
            let handle = app.handle().clone();

            // Rule 1: Spawn the HTTP server on a separate tokio task — never blocks.
            tauri::async_runtime::spawn(async move {
                info!(
                    "Starting headless HTTP server on {}:{}",
                    thisvid_constants::HTTP_HOST,
                    thisvid_constants::HTTP_PORT
                );
                if let Err(e) = http_server::start(handle).await {
                    tracing::error!("HTTP server error: {e:#}");
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Compile-time constants mirroring `/packages/core/constants.ts`.
/// Kept in sync manually — the canonical source of truth is the TS file.
pub mod thisvid_constants {
    pub const HTTP_PORT: u16 = 8080;
    pub const HTTP_HOST: &str = "127.0.0.1";
    pub const DOWNLOAD_ENDPOINT: &str = "/download";
    pub const HEALTH_ENDPOINT: &str = "/health";
    pub const QUEUE_ENDPOINT: &str = "/queue";
    pub const YTDLP_SIDECAR_NAME: &str = "yt-dlp";
    pub const FFMPEG_SIDECAR_NAME: &str = "ffmpeg";
    pub const OUTPUT_TEMPLATE: &str = "%(title)s [%(id)s].%(ext)s";
    pub const METADATA_TIMEOUT_SECS: u64 = 30;
    pub const TASK_ID_PREFIX: &str = "dl_";
}
