Product Specification: Universal Video Downloader GUI
1. System Architecture

Framework: Tauri. Chosen over Electron to drastically reduce memory footprint and bundle size.

Frontend: React with TypeScript, styled via Tailwind CSS.

Backend: Rust. Handles OS-level file writing, process execution, and subprocess threading.

Core Engines: * yt-dlp: The extraction engine. Supports 1,000+ domains natively.

FFmpeg: The muxer. Required for combining separate audio and video streams (standard for high-res YouTube and Twitter deliveries).

2. Core Modules & Data Flow

Module A: Initialization & Updater

On boot, Rust backend checks local yt-dlp version against the GitHub releases API.

If outdated, quietly pulls the latest binary. UI shows a brief "Initializing Engine" spinner.

Module B: URL Intake & Validation

User pastes URL into the main input field.

Frontend performs basic regex to ensure valid URI format.

Frontend fires IPC (Inter-Process Communication) call to Rust backend.

Module C: Metadata Resolution (The "Instant" Button)

Rust spawns yt-dlp --dump-json [URL].

Backend parses JSON to extract: Video Title, Thumbnail URL, Available Formats, and File Size.

Backend returns data to Frontend.

Frontend renders the UI: Thumbnail, Title, and a primary "Download" button.

Module D: Download Execution

User clicks Download.

Rust spawns yt-dlp -f "bestvideo+bestaudio/best" --merge-output-format mp4 [URL].

Rust listens to the stdout stream of the subprocess, parsing percentage strings.

Rust emits real-time progress events to the Frontend via Tauri's event system.

3. User Interface (UI) Requirements

State 1: Idle. A minimal, centered search bar. "Paste any video URL."

State 2: Resolving. Skeleton loader or pulsing state while fetching metadata.

State 3: Ready. Displays fetched thumbnail, video title, file size estimate, and a prominent download button.

State 4: Downloading. Replaces download button with a progress bar, download speed (MB/s), and ETA.

State 5: Complete. "Open Folder" button appears.

4. Edge Cases & Error Handling

DRM/Geo-blocking: If yt-dlp returns an HTTP 403 or DRM error, catch the stderr output. Display a clean UI toast: "Video is private, geo-restricted, or DRM-protected."

Missing Dependencies: If FFmpeg is not found in the system PATH, the Rust backend must prompt the user to install it or automatically pull a portable binary into the app's local AppData directory.

Age-Restricted Content: Twitter and YouTube frequently block NSFW/age-restricted content from anonymous scrapers. The app requires a settings panel allowing users to inject a Netscape cookies.txt file to bypass these walls using their own authenticated session.

Network Interruptions: If the connection drops, yt-dlp supports resuming. The UI must swap the "Downloading" state to "Paused/Retry" and append the --continue flag on the subsequent execution.