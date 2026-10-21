import Link from "next/link";
import { deletePostAction, toggleSavedAction } from "@/app/user-actions";
import { CopyButton } from "@/components/copy-button";
import { GeneratePostsPanel } from "@/components/generate-posts-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireSignedInUser } from "@/lib/auth/server";
import { getConfig } from "@/lib/config";
import { listSaved } from "@/lib/data/saved";
import { nvidiaKeyOf, userModel } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { MAX_POSTS_PER_REQUEST } from "@/lib/posts/generate";
import { PLATFORMS, POST_LANGS } from "@/lib/posts/prompt";
import { hostOf, relativeTime } from "@/lib/utils";

const FORM_ID = "generate-posts";

export const metadata = { title: "Saved · Trend Pool" };

/** The signed-in user's own pool: topics saved from the Pool, and the posts generated for them. */
export default async function SavedPage() {
  const user = await requireSignedInUser("/saved");
  const saved = await listSaved(getDb(), user.id);
  const hasKey = nvidiaKeyOf(user, getConfig().SECRETS_KEY) !== null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Saved</h1>
        <p className="text-sm text-muted-foreground">
          Your own pool, {user.username}: topics you saved from the{" "}
          <Link href="/pool" className="underline">
            Pool
          </Link>
          . Select some and generate posts with your NVIDIA model.
        </p>
      </div>

      {!hasKey && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          To generate posts, add your NVIDIA API key in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      )}

      {saved.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing saved yet. Use the Save button next to a topic in the Pool.
        </p>
      ) : (
        <>
          <GeneratePostsPanel
            formId={FORM_ID}
            platforms={Object.entries(PLATFORMS).map(([value, p]) => ({ value, label: p.label }))}
            langs={Object.entries(POST_LANGS).map(([value, label]) => ({ value, label }))}
            model={userModel(user)}
            disabled={!hasKey}
            max={MAX_POSTS_PER_REQUEST}
          />
          <ul className="space-y-3">
            {saved.map(({ topic, savedAt, posts }) => (
              <li key={topic.id} className="rounded-lg border">
                <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    name="topicId"
                    value={topic.id}
                    form={FORM_ID}
                    className="mt-1 size-4 accent-primary"
                    aria-label={`Select ${topic.title}`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link href={`/pool/${topic.id}`} className="font-medium hover:underline">
                      {topic.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {topic.canonicalUrl && (
                        <a
                          href={topic.canonicalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {hostOf(topic.canonicalUrl)}
                        </a>
                      )}
                      {topic.category && <Badge variant="outline">{topic.category}</Badge>}
                      <span>saved {relativeTime(savedAt)}</span>
                      <span>
                        · {posts.length} post{posts.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <form action={toggleSavedAction}>
                    <input type="hidden" name="id" value={topic.id} />
                    <input type="hidden" name="saved" value="false" />
                    <Button type="submit" size="xs" variant="ghost">
                      Remove
                    </Button>
                  </form>
                </div>
                {posts.length > 0 && (
                  <div className="space-y-2 border-t bg-muted/20 px-4 py-3">
                    {posts.map((p) => (
                      <div key={p.id} className="space-y-1 rounded-md border bg-background px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary">{PLATFORMS[p.platform]?.label ?? p.platform}</Badge>
                          <span>{p.lang}</span>
                          <span className="font-mono">{p.model}</span>
                          <span>{relativeTime(p.createdAt)}</span>
                          <span className="ml-auto flex gap-1">
                            <CopyButton text={p.content} />
                            <form action={deletePostAction}>
                              <input type="hidden" name="id" value={p.id} />
                              <Button type="submit" size="xs" variant="ghost">
                                Delete
                              </Button>
                            </form>
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{p.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
