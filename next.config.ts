import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone with a minimal server.js for the Docker image.
  output: "standalone",
  // Keep these as real node_modules instead of bundling them into the server build.
  serverExternalPackages: ["pg", "pino"],
};

export default nextConfig;
