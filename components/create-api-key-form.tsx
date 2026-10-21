"use client";

import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { createApiKeyAction, type CreateKeyState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Creates an API key and shows it once (only its hash is stored). */
export function CreateApiKeyForm() {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKeyAction, {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2">
      <form action={action} className="flex max-w-md gap-2">
        <Input name="name" placeholder="Key name, e.g. my-blog" maxLength={80} required />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Create key
        </Button>
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.key && (
        <div className="space-y-1 rounded-lg border border-primary/40 bg-muted/40 px-3 py-2 text-sm">
          <p>
            New key <strong>{state.name}</strong>. Copy it now: it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={state.key}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 font-mono text-xs"
              aria-label="New API key"
            />
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(state.key!).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
