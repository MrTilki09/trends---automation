"use client";

// Shown when even the layout fails (e.g. the database is unreachable).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
        <h1>Trend Pool can’t load</h1>
        <p>{error.message || "Unexpected error."}</p>
        <p style={{ color: "#666" }}>Is the database running? Check `npm run logs`.</p>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
