import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: {
    // From the host, Postgres is reachable on localhost:5432 when the dev stack is running.
    url: process.env.DATABASE_URL ?? "postgres://trendpool:change-me@localhost:5432/trendpool",
  },
});
