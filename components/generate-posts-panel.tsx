"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useActionState } from "react";
import { generatePostsAction, type GenerateState } from "@/app/user-actions";
import { Button } from "@/components/ui/button";

const select =
  "h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The "Generate posts" form. The topic checkboxes live in the list below and join this form through
 * their `form` attribute (forms can't be nested around the per-topic Remove/Delete forms).
 */
export function GeneratePostsPanel({
  formId,
  platforms,
  langs,
  model,
  disabled,
  max,
}: {
  formId: string;
  platforms: { value: string; label: string }[];
  langs: { value: string; label: string }[];
  model: string;
  disabled: boolean;
  max: number;
}) {
  const [state, action, pending] = useActionState<GenerateState, FormData>(generatePostsAction, {
    created: 0,
    errors: [],
  });

  const setAll = (checked: boolean) =>
    document
      .querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="topicId"]`)
      .forEach((el) => (el.checked = checked));

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <form id={formId} action={action} className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Generate posts for the selected topics</span>
        <select name="platform" className={select} aria-label="Platform" defaultValue={platforms[0]?.value}>
          {platforms.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select name="lang" className={select} aria-label="Language" defaultValue={langs[0]?.value}>
          {langs.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={disabled || pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {pending ? "Writing…" : "Generate"}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setAll(true)}>
          Select all
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setAll(false)}>
          None
        </Button>
        <span className="text-xs text-muted-foreground">
          Model: <code>{model}</code> · max {max} per click
        </span>
      </form>
      {state.done && state.created > 0 && (
        <p className="text-sm">
          Wrote {state.created} post{state.created === 1 ? "" : "s"}.
        </p>
      )}
      {state.errors.map((e) => (
        <p key={e} className="text-sm text-destructive">
          {e}
        </p>
      ))}
    </div>
  );
}
