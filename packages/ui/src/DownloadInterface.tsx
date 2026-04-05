/**
 * @file DownloadInterface.tsx
 * @description Primary download UI component.
 *
 * Defensive Protocol compliance:
 * - Rule 7 (Next.js IPC Safety): ALL Tauri API imports are dynamic and gated
 *   behind `isTauri()`. The component renders in a degraded "web stub" mode
 *   when running outside Tauri (e.g., during Next.js static build).
 * - Rule 2 (Stale Closures): All event listeners are cleaned up in useEffect
 *   return functions.
 * - Rule 1 (Async Blindness): Loading states are tracked; the UI shows a
 *   pending indicator while metadata is being fetched.
 * - Rule 5 (Loud Failures): Errors are surfaced via store.updateTaskError(),
 *   never console.log'd-and-swallowed.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQueueStore } from "./QueueStore";
import type { DownloadTask, DownloadProgressEvent } from "@thisvid/core";
import {
  IPC_CMD,
  TAURI_EVENT,
  UI,
  HTTP_SERVER,
} from "@thisvid/core";

// ─── Tauri Environment Guard ──────────────────────────────────────────────────

/**
 * Rule 7: Check if we are running inside a Tauri WebView context.
 * This must be called at runtime, never at module evaluation time,
 * because Next.js SSR evaluates module code outside the browser.
 */
function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!(window as any).__TAURI_INTERNALS__
  );
}

// ─── Tauri Dynamic Import Wrappers ────────────────────────────────────────────

/**
 * Dynamically import and invoke a Tauri command.
 * Returns null if not in a Tauri context.
 */
async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

/**
 * Dynamically subscribe to a Tauri event.
 * Returns a no-op unsubscribe if not in Tauri context.
 */
async function tauriListen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<T>(event, (e) => handler(e.payload));
  return unlisten;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

interface UrlInputProps {
  onSubmit: (url: string) => void;
  disabled: boolean;
}

function UrlInput({ onSubmit, disabled }: UrlInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="tv-url-form">
      <input
        id="url-input"
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste a video URL…"
        disabled={disabled}
        className="tv-url-input"
        aria-label="Video URL"
        autoFocus
      />
      <button
        id="url-submit-btn"
        type="submit"
        disabled={disabled || !value.trim()}
        className="tv-btn tv-btn--primary"
      >
        Download
      </button>
    </form>
  );
}

interface TaskRowProps {
  task: DownloadTask;
  onCancel: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onFormatChange: (taskId: string, formatId: string) => void;
}

function TaskRow({ task, onCancel, onRemove, onFormatChange }: TaskRowProps) {
  const statusLabel: Record<string, string> = {
    idle: "Queued",
    fetching_metadata: "Fetching info…",
    pending: "Ready",
    downloading: `${task.progressPercent.toFixed(1)}%`,
    postprocessing: "Processing…",
    complete: "Done",
    error: "Error",
    cancelled: "Cancelled",
  };

  const title = task.metadata?.title ?? task.url;
  const truncated = title.length > 60 ? `${title.slice(0, 57)}…` : title;

  return (
    <li
      id={`task-${task.id}`}
      className={`tv-task-row tv-task-row--${task.status}`}
      aria-label={`Download task: ${truncated}`}
    >
      <div className="tv-task-info">
        <span className="tv-task-title" title={title}>
          {truncated}
        </span>
        {task.metadata && task.metadata.formats.length > 0 && (
        <select
            id={`format-select-${task.id}`}
            className="tv-format-select"
            value={task.selectedFormatId ?? ""}
            onChange={(e) => onFormatChange(task.id, e.target.value)}
            disabled={task.status === "downloading" || task.status === "postprocessing"}
            aria-label="Select format"
          >
            <option value="">Best quality (auto)</option>
            {task.metadata.formats.map((f) => (
              <option key={f.formatId} value={f.formatId}>
                {f.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="tv-task-status">
        <span className="tv-status-badge">{statusLabel[task.status] ?? task.status}</span>

        {task.status === "downloading" && (
          <div
            className="tv-progress-bar"
            role="progressbar"
            aria-label={`Download progress: ${task.progressPercent.toFixed(1)}%`}
            aria-valuenow={task.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="tv-progress-fill"
              style={{ ['--progress' as string]: `${task.progressPercent}%` } as React.CSSProperties}
            />
          </div>
        )}

        {task.status === "downloading" && task.downloadSpeed && (
          <span className="tv-speed">{task.downloadSpeed}</span>
        )}

        {task.status === "error" && task.errorMessage && (
          <span className="tv-error-msg" title={task.errorMessage}>
            {task.errorMessage.slice(0, UI.ERROR_TRUNCATE_LENGTH)}
          </span>
        )}
      </div>

      <div className="tv-task-actions">
        {(task.status === "downloading" || task.status === "pending" || task.status === "fetching_metadata") && (
          <button
            id={`cancel-${task.id}`}
            className="tv-btn tv-btn--ghost"
            onClick={() => onCancel(task.id)}
            aria-label="Cancel download"
          >
            Cancel
          </button>
        )}
        {(task.status === "complete" || task.status === "error" || task.status === "cancelled") && (
          <button
            id={`remove-${task.id}`}
            className="tv-btn tv-btn--ghost"
            onClick={() => onRemove(task.id)}
            aria-label="Remove from queue"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DownloadInterface() {
  const {
    tasks,
    addTask,
    removeTask,
    updateTaskStatus,
    updateTaskMetadata,
    updateTaskProgress,
    updateTaskError,
    updateTaskFormat,
    cancelTask,
    clearCompleted,
  } = useQueueStore();

  const [isOnline] = useState(true);
  // Track unsubscribe functions by event name — Rule 2 (Stale Closures)
  const unlistenRefs = useRef<Array<() => void>>([]);

  // ── Tauri Event Subscriptions ──────────────────────────────────────────────

  useEffect(() => {
    // Rule 7: only wire up events inside Tauri
    if (!isTauri()) return;

    let mounted = true;

    (async () => {
      // Progress events
      const unlistenProgress = await tauriListen<DownloadProgressEvent>(
        TAURI_EVENT.DOWNLOAD_PROGRESS,
        (payload) => {
          if (!mounted) return;
          updateTaskProgress(payload);
        }
      );

      // Complete events
      const unlistenComplete = await tauriListen<{ taskId: string }>(
        TAURI_EVENT.DOWNLOAD_COMPLETE,
        ({ taskId }) => {
          if (!mounted) return;
          useQueueStore.getState().completeTask(taskId);
        }
      );

      // Error events — Rule 5: always surface errors
      const unlistenError = await tauriListen<{ taskId: string; message: string }>(
        TAURI_EVENT.DOWNLOAD_ERROR,
        ({ taskId, message }) => {
          if (!mounted) return;
          updateTaskError(taskId, message);
        }
      );

      // Remote request received from headless HTTP server
      const unlistenRemote = await tauriListen<{ url: string }>(
        TAURI_EVENT.REMOTE_REQUEST_RECEIVED,
        ({ url }) => {
          if (!mounted) return;
          handleAddUrl(url);
        }
      );

      if (mounted) {
        unlistenRefs.current = [
          unlistenProgress,
          unlistenComplete,
          unlistenError,
          unlistenRemote,
        ];
      } else {
        // Component unmounted before listeners resolved — clean up immediately
        unlistenProgress();
        unlistenComplete();
        unlistenError();
        unlistenRemote();
      }
    })();

    return () => {
      mounted = false;
      // Rule 2: Clean up all Tauri event listeners on unmount
      for (const unlisten of unlistenRefs.current) {
        unlisten();
      }
      unlistenRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Action Handlers ────────────────────────────────────────────────────────

  const handleAddUrl = useCallback(
    async (url: string) => {
      const taskId = addTask(url);
      if (taskId === null) {
        // Duplicate — already in queue, no-op (Rule 4)
        return;
      }

      // Rule 1: Immediately set status to show pending UI
      updateTaskStatus(taskId, "fetching_metadata");

      try {
        // Rule 7: dynamically invoke Tauri — degrades gracefully outside Tauri
        const metadata = await tauriInvoke<import("@thisvid/core").VideoMetadata>(
          IPC_CMD.FETCH_METADATA,
          { url }
        );

        if (metadata) {
          updateTaskMetadata(taskId, metadata);
        } else {
          // Running outside Tauri — mock state for UI preview
          updateTaskStatus(taskId, "pending");
        }
      } catch (err: unknown) {
        // Rule 5: never swallow — always propagate to UI
        const message =
          err instanceof Error ? err.message : String(err);
        updateTaskError(taskId, `Metadata fetch failed: ${message}`);
      }
    },
    [addTask, updateTaskStatus, updateTaskMetadata, updateTaskError]
  );

  const handleStartDownload = useCallback(
    async (taskId: string) => {
      const task = useQueueStore.getState().tasks.find((t) => t.id === taskId);
      if (!task) return;

      updateTaskStatus(taskId, "downloading");

      try {
        await tauriInvoke<void>(IPC_CMD.DOWNLOAD_VIDEO, {
          taskId,
          url: task.url,
          formatId: task.selectedFormatId,
          outputDirectory: task.outputDirectory,
        });
        // Completion is handled via TAURI_EVENT.DOWNLOAD_COMPLETE listener
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
        updateTaskError(taskId, `Download failed: ${message}`);
      }
    },
    [updateTaskStatus, updateTaskError]
  );

  const handleCancel = useCallback(
    async (taskId: string) => {
      cancelTask(taskId);
      try {
        await tauriInvoke<void>(IPC_CMD.CANCEL_DOWNLOAD, { taskId });
      } catch (err: unknown) {
        // Cancel failure is non-fatal — task is already marked cancelled in store
        const message =
          err instanceof Error ? err.message : String(err);
        console.warn(`[thisvid] cancel IPC error (non-fatal): ${message}`);
      }
    },
    [cancelTask]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeTasks = tasks.filter(
    (t) => t.status !== "complete" && t.status !== "cancelled"
  );
  const completedTasks = tasks.filter(
    (t) => t.status === "complete" || t.status === "cancelled"
  );

  return (
    <div className="tv-download-interface">
      {/* Header */}
      <header className="tv-header">
        <h1 className="tv-brand">thisvid</h1>
        <p className="tv-tagline">Local-first video downloader</p>
        {!isTauri() && (
          <div
            id="web-stub-banner"
            className="tv-banner tv-banner--warning"
            role="alert"
          >
            ⚠️ Running in web preview mode — Tauri IPC unavailable.
            Downloads are disabled.
          </div>
        )}
        {isTauri() && (
          <div className="tv-server-indicator" aria-live="polite">
            <span className="tv-server-dot" />
            Headless server active on port {HTTP_SERVER.PORT}
          </div>
        )}
      </header>

      {/* URL Input */}
      <section id="url-input-section" aria-label="Add download">
        <UrlInput onSubmit={handleAddUrl} disabled={!isOnline} />
      </section>

      {/* Active Queue */}
      {activeTasks.length > 0 && (
        <section id="active-queue" aria-label="Active downloads">
          <h2 className="tv-section-title">Queue ({activeTasks.length})</h2>
          <ul className="tv-task-list" role="list">
            {activeTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onCancel={handleCancel}
                onRemove={removeTask}
                onFormatChange={updateTaskFormat}
              />
            ))}
          </ul>
          {/* Start all pending downloads */}
          {activeTasks.some((t) => t.status === "pending") && (
            <div className="tv-bulk-actions">
              {activeTasks
                .filter((t) => t.status === "pending")
                .map((t) => (
                  <button
                    key={t.id}
                    id={`start-${t.id}`}
                    className="tv-btn tv-btn--primary"
                    onClick={() => handleStartDownload(t.id)}
                  >
                    Start: {t.metadata?.title?.slice(0, 30) ?? t.url.slice(0, 30)}…
                  </button>
                ))}
            </div>
          )}
        </section>
      )}

      {/* Completed / History */}
      {completedTasks.length > 0 && (
        <section id="completed-queue" aria-label="Completed downloads">
          <div className="tv-section-header">
            <h2 className="tv-section-title">
              History ({completedTasks.length})
            </h2>
            <button
              id="clear-completed-btn"
              className="tv-btn tv-btn--ghost"
              onClick={clearCompleted}
            >
              Clear
            </button>
          </div>
          <ul className="tv-task-list tv-task-list--completed" role="list">
            {completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onCancel={handleCancel}
                onRemove={removeTask}
                onFormatChange={updateTaskFormat}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Empty State */}
      {tasks.length === 0 && (
        <div id="empty-state" className="tv-empty" aria-label="No downloads">
          <p>Paste a video URL above to get started.</p>
          <p className="tv-empty-sub">
            Supports YouTube, Vimeo, Twitter, and{" "}
            <a
              href="https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md"
              target="_blank"
              rel="noreferrer noopener"
            >
              1000+ more sites
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
