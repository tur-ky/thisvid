"use client";

/**
 * @file page.tsx
 * @description Root page — simply mounts the shared DownloadInterface component.
 *
 * "use client" is required because DownloadInterface uses hooks (useState, useEffect)
 * and the Zustand store. No server-side data fetching is used — this is a pure
 * static client-side shell.
 */

import { DownloadInterface } from "@thisvid/ui";

export default function HomePage() {
  return <DownloadInterface />;
}
