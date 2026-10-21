import { defineConfig } from "tsup";

// Bundles the worker entry points into self-contained CommonJS files in dist/,
// so the runtime image does not need the full node_modules for the worker.
export default defineConfig({
  entry: {
    worker: "worker/index.ts",
    migrate: "worker/migrate.ts",
    seed: "worker/seed.ts",
    reindex: "worker/reindex.ts",
  },
  format: ["cjs"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // node-cron v4 is ESM and uses import.meta.url; shims make that work in the CJS bundle.
  shims: true,
  noExternal: [/.*/],
  external: ["pg-native"],
});
