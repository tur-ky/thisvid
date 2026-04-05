/**
 * @file constants.ts
 * @description All magic values extracted to named constants.
 * RULE: No app or package may use raw strings/numbers for any of these values.
 * Import from here always.
 */

// ─── IPC Command Names (Tauri invoke targets) ─────────────────────────────────
export const IPC_CMD = {
  FETCH_METADATA: "fetch_metadata",
  DOWNLOAD_VIDEO: "download_video",
  CANCEL_DOWNLOAD: "cancel_download",
  GET_DEFAULT_OUTPUT_DIR: "get_default_output_dir",
  SET_DEFAULT_OUTPUT_DIR: "set_default_output_dir",
  GET_QUEUE: "get_queue",
} as const;

// ─── Tauri Event Names ────────────────────────────────────────────────────────
export const TAURI_EVENT = {
  DOWNLOAD_PROGRESS: "download_progress",
  DOWNLOAD_COMPLETE: "download_complete",
  DOWNLOAD_ERROR: "download_error",
  METADATA_READY: "metadata_ready",
  SERVER_READY: "server_ready",
  REMOTE_REQUEST_RECEIVED: "remote_request_received",
} as const;

// ─── Headless HTTP Server ─────────────────────────────────────────────────────
export const HTTP_SERVER = {
  /** Default port for the local headless server */
  PORT: 8080,
  /** Bind address — localhost only; Tailscale routes through the VPN tunnel */
  HOST: "127.0.0.1",
  /** POST endpoint for receiving remote download requests */
  DOWNLOAD_ENDPOINT: "/download",
  /** GET endpoint for health checks from mobile client */
  HEALTH_ENDPOINT: "/health",
  /** GET endpoint listing the current queue */
  QUEUE_ENDPOINT: "/queue",
} as const;

// ─── yt-dlp Sidecar ──────────────────────────────────────────────────────────
export const YTDLP = {
  /** Tauri sidecar binary name (without target-triple suffix) */
  SIDECAR_NAME: "yt-dlp",
  /** Timeout (ms) for metadata fetch operations */
  METADATA_TIMEOUT_MS: 30_000,
  /** Timeout (ms) for a full download — 6 hours max */
  DOWNLOAD_TIMEOUT_MS: 6 * 60 * 60 * 1000,
  /** Regex to parse yt-dlp's progress line output */
  PROGRESS_REGEX: /\[download\]\s+([\d.]+)%\s+of\s+[\d.]+\w+\s+at\s+([\d.]+\s*\w+\/s)\s+ETA\s+(\d+:\d+)/,
} as const;

// ─── ffmpeg Sidecar ───────────────────────────────────────────────────────────
export const FFMPEG = {
  /** Tauri sidecar binary name (without target-triple suffix) */
  SIDECAR_NAME: "ffmpeg",
} as const;

// ─── Task ID Generation ───────────────────────────────────────────────────────
export const TASK_ID = {
  /** Prefix for all download task IDs */
  PREFIX: "dl_",
} as const;

// ─── UI Constants ─────────────────────────────────────────────────────────────
export const UI = {
  /** How often (ms) to poll for progress updates when events are unavailable */
  POLL_INTERVAL_MS: 500,
  /** Max characters to display from error messages before truncation */
  ERROR_TRUNCATE_LENGTH: 200,
  /** Toast display duration (ms) */
  TOAST_DURATION_MS: 4_000,
} as const;

// ─── Filesystem ───────────────────────────────────────────────────────────────
export const FS = {
  /** Key used in Tauri plugin-fs store for the default download directory */
  DEFAULT_DIR_KEY: "defaultOutputDirectory",
  /** Key for persisted download queue state */
  QUEUE_STORE_KEY: "downloadQueue",
  /** yt-dlp output template — saves as: Title [ID].ext */
  OUTPUT_TEMPLATE: "%(title)s [%(id)s].%(ext)s",
} as const;
