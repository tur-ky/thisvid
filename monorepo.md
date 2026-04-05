Phase 1: The Monorepo Blueprint
Instruct your coding agents (whether Antigravity or standard dev flow) to initialize the project using a monorepo manager like Turborepo.

1. The Folder Structure

Plaintext
/universal-downloader
├── /apps
│   ├── /desktop      (Tauri wrapper + Rust backend)
│   └── /web          (Next.js PWA + dummy API routes for testing)
├── /packages
│   ├── /ui           (Shared React components + Tailwind config)
│   └── /core         (Types, schemas, and the Downloader interface)
2. The Execution Switch (Crucial)
Because the UI is shared in the /packages/ui folder, the download button's onClick function needs to know where it's running. Your agents must implement an adapter pattern:

If running in Tauri: The frontend fires an IPC event invoke('download_video', { url }). Rust catches it and runs the local yt-dlp binary.

If running in PWA (Mobile/Browser): The frontend fires a standard HTTP POST request to /api/download.

For Phase 1, just have the PWA's /api/download route return a dummy JSON response like { status: "success", mock_url: "..." } so you can test the UI states without needing a real server yet.

3. The Initial Agent Task
To start the build, focus entirely on the local Desktop environment first. The desktop app is your proof-of-concept. It validates your yt-dlp and FFmpeg extraction logic without worrying about network latency or CORS bullshit.