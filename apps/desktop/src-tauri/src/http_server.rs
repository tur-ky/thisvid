//! `http_server.rs` — Headless HTTP listener (axum).
//!
//! This server runs on `127.0.0.1:8080` inside a `tokio::async_runtime::spawn`
//! call initiated from `lib.rs`. It stays alive for the lifetime of the app.
//!
//! Rule 1 (Async Blindness): The server is entirely non-blocking — every handler
//! is `async`. It cannot block the Tauri main thread.
//! Rule 2 (Stale Closures): `AppHandle` is stored in `Arc` and cloned per-request.
//! Rule 5 (Loud Failures): All handler errors are logged and returned as HTTP 500.

use anyhow::Result;
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use std::{net::SocketAddr, sync::Arc};
use tauri::{AppHandle, Emitter};
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};

use crate::thisvid_constants::{
    DOWNLOAD_ENDPOINT, HEALTH_ENDPOINT, HTTP_HOST, HTTP_PORT, QUEUE_ENDPOINT,
};
use crate::types::RemoteDownloadRequest;

// ─── Server State ─────────────────────────────────────────────────────────────

#[derive(Clone)]
struct ServerState {
    app_handle: Arc<AppHandle>,
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

/// Start the axum HTTP server. This function never returns (runs indefinitely).
/// Must be called from within a tokio runtime (i.e., `tauri::async_runtime::spawn`).
pub async fn start(app_handle: AppHandle) -> Result<()> {
    let state = ServerState {
        app_handle: Arc::new(app_handle),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route(HEALTH_ENDPOINT, get(health_handler))
        .route(DOWNLOAD_ENDPOINT, post(download_handler))
        .route(QUEUE_ENDPOINT, get(queue_handler))
        .layer(cors)
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", HTTP_HOST, HTTP_PORT).parse()?;
    info!("Headless HTTP server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/// GET /health — mobile client polls this to verify the desktop is reachable.
async fn health_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "thisvid",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

/// POST /download — receives a URL from the mobile thin client and forwards it
/// to the frontend via a Tauri event. The frontend's event listener adds it
/// to the download queue just like a manual URL submission.
async fn download_handler(
    State(state): State<ServerState>,
    Json(payload): Json<RemoteDownloadRequest>,
) -> impl IntoResponse {
    info!("Remote download request: {}", payload.url);

    match state.app_handle.emit(
        "remote_request_received",
        serde_json::json!({ "url": payload.url }),
    ) {
        Ok(_) => (
            StatusCode::ACCEPTED,
            Json(serde_json::json!({ "status": "queued", "url": payload.url })),
        ),
        Err(e) => {
            error!("Failed to emit remote_request_received: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("{e}") })),
            )
        }
    }
}

/// GET /queue — returns current queue state for the mobile client to display.
async fn queue_handler(State(_state): State<ServerState>) -> impl IntoResponse {
    // Forward to the Tauri command to read from AppState
    // For now return empty JSON — mobile app integration is Phase 2
    Json(serde_json::json!({ "queue": [] }))
}
