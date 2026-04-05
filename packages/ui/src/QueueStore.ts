/**
 * @file QueueStore.ts
 * @description Zustand store for the global download queue.
 *
 * Defensive Protocol compliance:
 * - Rule 4 (Idempotency): addTask checks for duplicate URLs before inserting.
 * - Rule 5 (Loud Failures): updateTaskError sets status="error" and errorMessage.
 * - Rule 2 (Stale Closures): Store subscribers must call the returned unsubscribe fn.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  DownloadTask,
  DownloadStatus,
  VideoMetadata,
  DownloadProgressEvent,
} from "@thisvid/core";
import { TASK_ID } from "@thisvid/core";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTaskId(url: string): string {
  // Simple deterministic hash to prevent duplicates across re-submits
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit int
  }
  return `${TASK_ID.PREFIX}${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

// ─── Store Interface ──────────────────────────────────────────────────────────

export interface QueueState {
  tasks: DownloadTask[];
  defaultOutputDirectory: string;

  // ── Actions ──
  addTask: (url: string, outputDirectory?: string) => string | null;
  removeTask: (taskId: string) => void;
  updateTaskStatus: (taskId: string, status: DownloadStatus) => void;
  updateTaskMetadata: (taskId: string, metadata: VideoMetadata) => void;
  updateTaskProgress: (event: DownloadProgressEvent) => void;
  updateTaskError: (taskId: string, errorMessage: string) => void;
  updateTaskFormat: (taskId: string, formatId: string) => void;
  completeTask: (taskId: string) => void;
  cancelTask: (taskId: string) => void;
  clearCompleted: () => void;
  setDefaultOutputDirectory: (dir: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useQueueStore = create<QueueState>()(
  subscribeWithSelector((set, get) => ({
    tasks: [],
    defaultOutputDirectory: "",

    /**
     * Add a new download task. Returns the new task ID, or null if the URL
     * already exists in the queue (idempotency guard).
     */
    addTask: (url: string, outputDirectory?: string): string | null => {
      const { tasks, defaultOutputDirectory } = get();

      // Rule 4: Reject duplicate URLs that are still active
      const isDuplicate = tasks.some(
        (t) =>
          t.url === url &&
          t.status !== "complete" &&
          t.status !== "error" &&
          t.status !== "cancelled"
      );
      if (isDuplicate) return null;

      const id = generateTaskId(url);
      const newTask: DownloadTask = {
        id,
        url,
        metadata: null,
        selectedFormatId: null,
        outputDirectory: outputDirectory ?? defaultOutputDirectory,
        status: "idle",
        progressPercent: 0,
        downloadSpeed: null,
        eta: null,
        addedAt: new Date().toISOString(),
        completedAt: null,
        errorMessage: null,
      };

      set((state) => ({ tasks: [...state.tasks, newTask] }));
      return id;
    },

    removeTask: (taskId: string) => {
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) }));
    },

    updateTaskStatus: (taskId: string, status: DownloadStatus) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, status } : t
        ),
      }));
    },

    updateTaskMetadata: (taskId: string, metadata: VideoMetadata) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, metadata, status: "pending" } : t
        ),
      }));
    },

    /**
     * Rule 1 (Async Blindness): Called by Tauri event listener — merges
     * progress data atomically without overwriting unrelated fields.
     */
    updateTaskProgress: (event: DownloadProgressEvent) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === event.taskId
            ? {
                ...t,
                progressPercent: event.progressPercent,
                downloadSpeed: event.downloadSpeed,
                eta: event.eta,
                status: event.status,
              }
            : t
        ),
      }));
    },

    /**
     * Rule 5 (Loud Failures): Always forces status to "error" and stores the
     * full error message. Never swallows silently.
     */
    updateTaskError: (taskId: string, errorMessage: string) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? { ...t, status: "error", errorMessage }
            : t
        ),
      }));
    },

    updateTaskFormat: (taskId: string, formatId: string) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, selectedFormatId: formatId } : t
        ),
      }));
    },

    completeTask: (taskId: string) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "complete",
                progressPercent: 100,
                completedAt: new Date().toISOString(),
              }
            : t
        ),
      }));
    },

    cancelTask: (taskId: string) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, status: "cancelled" } : t
        ),
      }));
    },

    clearCompleted: () => {
      set((state) => ({
        tasks: state.tasks.filter(
          (t) => t.status !== "complete" && t.status !== "cancelled"
        ),
      }));
    },

    setDefaultOutputDirectory: (dir: string) => {
      set({ defaultOutputDirectory: dir });
    },
  }))
);
