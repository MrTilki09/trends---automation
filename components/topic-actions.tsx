import { setTopicStatusAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { TopicStatus } from "@/lib/db/schema";

/** Shortlist / Ignore / Reset buttons (server action forms, work without JavaScript). */
export function TopicActions({ id, status }: { id: number; status: TopicStatus }) {
  const actions: { label: string; status: TopicStatus }[] = [
    { label: "Shortlist", status: "shortlisted" },
    { label: "Ignore", status: "ignored" },
    { label: "Reset", status: "new" },
  ];
  return (
    <div className="flex justify-end gap-1">
      {actions
        .filter((a) => a.status !== status)
        .map((a) => (
          <form key={a.status} action={setTopicStatusAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={a.status} />
            <Button type="submit" variant={a.status === "shortlisted" ? "default" : "ghost"} size="xs">
              {a.label}
            </Button>
          </form>
        ))}
    </div>
  );
}
