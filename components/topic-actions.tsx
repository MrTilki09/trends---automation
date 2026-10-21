import { Bookmark, BookmarkCheck } from "lucide-react";
import { setTopicStatusAction } from "@/app/actions";
import { toggleSavedAction } from "@/app/user-actions";
import { Button } from "@/components/ui/button";
import type { TopicStatus } from "@/lib/db/schema";

/**
 * Shortlist / Ignore / Reset buttons (server action forms, work without JavaScript), plus Save to the
 * signed-in user's own pool. `saved` is undefined when nobody is signed in: no Save button then.
 */
export function TopicActions({
  id,
  status,
  saved,
  canEdit = true,
}: {
  id: number;
  status: TopicStatus;
  saved?: boolean;
  /** Shortlist/Ignore/Reset are owner-only. */
  canEdit?: boolean;
}) {
  const actions: { label: string; status: TopicStatus }[] = [
    { label: "Shortlist", status: "shortlisted" },
    { label: "Ignore", status: "ignored" },
    { label: "Reset", status: "new" },
  ];
  return (
    <div className="flex justify-end gap-1">
      {saved !== undefined && (
        <form action={toggleSavedAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="saved" value={String(!saved)} />
          <Button
            type="submit"
            variant={saved ? "secondary" : "outline"}
            size="xs"
            title={saved ? "In your Saved list (click to remove)" : "Add to your Saved list"}
          >
            {saved ? <BookmarkCheck /> : <Bookmark />}
            {saved ? "Saved" : "Save"}
          </Button>
        </form>
      )}
      {actions
        .filter((a) => canEdit && a.status !== status)
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
