"use client";

import { Loader2, Save } from "lucide-react";
import { useActionState } from "react";
import { saveNvidiaSettingsAction, type SettingsState } from "@/app/user-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const select =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function NvidiaSettingsForm({
  models,
  model,
  hasKey,
  brand,
  defaultBrand,
}: {
  models: { value: string; label: string }[];
  model: string;
  hasKey: boolean;
  brand: string | null;
  defaultBrand: string;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveNvidiaSettingsAction, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>{hasKey ? "Replace key (leave empty to keep the current one)" : "API key"}</span>
        <Input name="apiKey" type="password" autoComplete="off" placeholder="nvapi-…" spellCheck={false} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Model</span>
        <select name="model" defaultValue={model} className={select}>
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span>Brand watermark on carousel slides (your handle or site name)</span>
        <Input name="brand" defaultValue={brand ?? ""} placeholder={defaultBrand} maxLength={40} />
      </label>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p className="text-sm">{state.message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        Save
      </Button>
    </form>
  );
}
