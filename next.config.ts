import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone with a minimal server.js for the Docker image.
  output: "standalone",
  // Keep these as real node_modules instead of bundling them into the server build.
  serverExternalPackages: ["pg", "pino"],
  // Production builds use Turbopack with defaults. Declaring it explicitly tells Next.js that the
  // webpack() hook below is intentional (it only applies to `next dev --webpack`).
  turbopack: {},
  webpack(config, { dev }) {
    if (dev && process.env.WATCHPACK_POLLING === "true") {
      // Dev in Docker on Windows/macOS has to poll for file changes (compose.dev.yaml). Polling every
      // file, node_modules included, kept the CPU busy and made every page slow: poll once a second
      // and skip folders whose files we never edit.
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.next/**", "**/.git/**", "**/dist/**", "**/backups/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
