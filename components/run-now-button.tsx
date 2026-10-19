"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { runNowAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

/** "Run now": queues a collect job. Disabled while one is pending/running; auto-refreshes until done. */
export function RunNowButton({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // While a run is queued or running, refresh the page every 5 s to show progress.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);

  const busy = active || pending;
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={() =>
        startTransition(async () => {
          await runNowAction();
          router.refresh();
        })
      }
    >
      {busy ? <Loader2 className="animate-spin" /> : <Play />}
      {active ? "Run in progress…" : "Run now"}
    </Button>
  );
}
