"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

// The page origin never changes while the page is open, so there is nothing to subscribe to.
const noopSubscribe = () => () => {};

/**
 * Shows the public API URL for the current Pool filters, on the domain the page is being viewed on
 * (whatever is in the browser's address bar), with a copy button.
 */
export function ApiUrlBox({ query, serverOrigin }: { query: string; serverOrigin: string }) {
  // Server render uses the request's Host header; the browser then corrects it to its own origin
  // (matters behind proxies/tunnels where the server sees a different host).
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => serverOrigin,
  );
  const [copied, setCopied] = useState(false);

  const url = `${origin}/api/topics${query ? `?${query}` : ""}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API needs https or localhost; fall back to selecting the text.
      const el = document.getElementById("api-url") as HTMLInputElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <span className="font-medium">API</span>
      <span className="text-xs text-muted-foreground">JSON of these results, always up to date:</span>
      <input
        id="api-url"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 font-mono text-xs"
        aria-label="API URL for the current filters"
      />
      <Button type="button" size="xs" variant="outline" onClick={copy}>
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Open <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
