/**
 * @file types.ts
 * @description Canonical type definitions for the thisvid monorepo.
 * These interfaces are derived directly from yt-dlp's JSON output schema
 * (https://github.com/yt-dlp/yt-dlp#output-template) to prevent schema desync.
 * ALL apps and packages MUST import from here — never redefine locally.
 */

// ─── yt-dlp Raw Output Schema ────────────────────────────────────────────────

/**
 * Represents the raw JSON object returned by `yt-dlp --dump-json <url>`.
 * Field names match yt-dlp's internal field names exactly.
 * All fields are optional because yt-dlp may not populate every field for every extractor.
 */
export interface YtDlpRawMetadata {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;            // seconds (float)
  duration_string?: string;     // e.g. "12:34"
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  channel?: string;
  channel_id?: string;
  channel_url?: string;
  upload_date?: string;         // YYYYMMDD string
  timestamp?: number;           // Unix epoch
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  thumbnail?: string;           // URL
  thumbnails?: YtDlpThumbnail[];
  categories?: string[];
  tags?: string[];
  webpage_url?: string;
  original_url?: string;
  extractor?: string;           // e.g. "youtube"
  extractor_key?: string;       // e.g. "Youtube"
  playlist?: string | null;
  playlist_index?: number | null;
  formats?: YtDlpFormat[];
  requested_formats?: YtDlpFormat[];
  format?: string;
  format_id?: string;
  format_note?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  width?: number;
  height?: number;
  fps?: number;
  tbr?: number;                 // total bitrate (kbps)
  vbr?: number;                 // video bitrate (kbps)
  abr?: number;                 // audio bitrate (kbps)
  asr?: number;                 // audio sample rate (Hz)
  filesize?: number;            // bytes
  filesize_approx?: number;     // bytes
  protocol?: string;
  is_live?: boolean;
  was_live?: boolean;
  live_status?: "is_live" | "is_upcoming" | "was_live" | "not_live" | null;
}

export interface YtDlpThumbnail {
  id?: string;
  url?: string;
  width?: number;
  height?: number;
  preference?: number;
}

export interface YtDlpFormat {
  format_id?: string;
  format_note?: string;
  ext?: string;
  protocol?: string;
  acodec?: string;
  vcodec?: string;
  url?: string;
  width?: number;
  height?: number;
  fps?: number;
  tbr?: number;
  abr?: number;
  asr?: number;
  filesize?: number;
  filesize_approx?: number;
  quality?: number;
  preference?: number;
  dynamic_range?: string;
  audio_ext?: string;
  video_ext?: string;
  resolution?: string;
  aspect_ratio?: number;
  http_headers?: Record<string, string>;
}

// ─── App-Level Interfaces ─────────────────────────────────────────────────────

/**
 * Normalized metadata object used across the UI. Derived from YtDlpRawMetadata
 * but with guaranteed non-null fields (filled with sensible defaults).
 */
export interface VideoMetadata {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  durationFormatted: string;
  uploader: string;
  channelUrl: string;
  uploadDate: string;           // ISO 8601: YYYY-MM-DD
  viewCount: number;
  thumbnailUrl: string;
  webpageUrl: string;
  extractor: string;
  isLive: boolean;
  formats: VideoFormat[];
}

/**
 * Normalized format entry used in the UI format selector.
 */
export interface VideoFormat {
  formatId: string;
  label: string;                // e.g. "1080p MP4 (H.264 + AAC)"
  ext: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  totalBitrateKbps: number | null;
  fileSizeBytes: number | null;
  vcodec: string;
  acodec: string;
  isAudioOnly: boolean;
  isVideoOnly: boolean;
}

// ─── Download Queue ───────────────────────────────────────────────────────────

export type DownloadStatus =
  | "idle"
  | "fetching_metadata"
  | "pending"
  | "downloading"
  | "postprocessing"
  | "complete"
  | "error"
  | "cancelled";

/**
 * A single entry in the download queue. This is the primary state atom
 * managed by QueueStore.
 */
export interface DownloadTask {
  /** Stable unique ID derived from URL + timestamp. Format: `dl_<hash>` */
  id: string;
  /** The raw URL submitted by the user or received from the headless server */
  url: string;
  /** Resolved metadata (null until fetching_metadata completes) */
  metadata: VideoMetadata | null;
  /** Selected format ID (null = best quality auto-selection) */
  selectedFormatId: string | null;
  /** Target output directory on the local filesystem */
  outputDirectory: string;
  /** Current status of this download task */
  status: DownloadStatus;
  /** 0–100. Only valid when status === "downloading" */
  progressPercent: number;
  /** Human-readable download speed, e.g. "4.2 MiB/s" */
  downloadSpeed: string | null;
  /** Human-readable ETA, e.g. "00:42" */
  eta: string | null;
  /** ISO 8601 timestamp of when the task was added */
  addedAt: string;
  /** ISO 8601 timestamp of when the download completed */
  completedAt: string | null;
  /** Error message string. Only populated when status === "error" */
  errorMessage: string | null;
}

// ─── IPC Payloads ─────────────────────────────────────────────────────────────

/**
 * Payload sent TO the Tauri `fetch_metadata` command.
 */
export interface FetchMetadataPayload {
  url: string;
}

/**
 * Payload sent TO the Tauri `download_video` command.
 */
export interface DownloadVideoPayload {
  taskId: string;
  url: string;
  formatId: string | null;
  outputDirectory: string;
}

/**
 * Payload emitted BY the Tauri `download_progress` event.
 */
export interface DownloadProgressEvent {
  taskId: string;
  progressPercent: number;
  downloadSpeed: string | null;
  eta: string | null;
  status: DownloadStatus;
}

/**
 * Payload received on the headless HTTP server from a remote mobile client.
 * POST /download
 */
export interface RemoteDownloadRequest {
  url: string;
  /** Optional format override from the mobile client */
  formatId?: string;
  /** Optional output directory override; defaults to server-configured default */
  outputDirectory?: string;
}
