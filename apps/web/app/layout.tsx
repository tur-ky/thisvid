import type { Metadata } from "next";
import "@thisvid/ui/styles.css";

export const metadata: Metadata = {
  title: "thisvid — Local-first video downloader",
  description:
    "Download videos from YouTube, Vimeo, Twitter, and 1000+ sites directly to your local machine. Powered by yt-dlp and Tauri.",
  keywords: ["video downloader", "yt-dlp", "youtube downloader", "local"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
