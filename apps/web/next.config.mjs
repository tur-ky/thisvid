/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Static export — no server-side logic permitted in this shell.
   * Generates a fully static /out directory for Tauri WebView loading.
   */
  output: "export",

  /**
   * Needed for Tauri: when loading from file:// the basePath must be relative.
   * Next.js will resolve assets using relative paths in the HTML output.
   */
  trailingSlash: true,

  /**
   * Disable image optimization — unavailable in static export mode and
   * Tauri doesn't run a Next.js server.
   */
  images: {
    unoptimized: true,
  },

  /**
   * Transpile our workspace packages so Next.js compiles their TypeScript.
   */
  transpilePackages: ["@thisvid/core", "@thisvid/ui"],
};

export default nextConfig;
