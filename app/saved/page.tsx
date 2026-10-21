import { ChevronRight, ImageIcon } from "lucide-react";
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
import { countSlides, onImageTexts, PLATFORMS, POST_LANGS } from "@/lib/posts/prompt";
import { formatDateTime, hostOf, relativeTime } from "@/lib/utils";

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
          <ul className="space-y-2">
            {saved.map(({ topic, savedAt, posts }) => (
              <li key={topic.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
                <input
                  type="checkbox"
                  name="topicId"
                  value={topic.id}
                  form={FORM_ID}
                  className="mt-1.5 size-4 shrink-0 accent-primary"
                  aria-label={`Select ${topic.title}`}
                />
                {/* Collapsed: title + one summary line. Expanded: the topic's generated posts. */}
                <details data-topic-id={topic.id} className="group min-w-0 flex-1">
                  <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block font-medium">{topic.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {topic.publishedAt && <span>published {formatDateTime(topic.publishedAt)}</span>}
                        <span>· saved {relativeTime(savedAt)}</span>
                        <span>
                          · {posts.length} post{posts.length === 1 ? "" : "s"}
                        </span>
                        {posts[0] && <span>· last generated {relativeTime(posts[0].createdAt)}</span>}
                        {posts.length > 0 && (
                          <span>
                            ·{" "}
                            {[...new Set(posts.map((p) => PLATFORMS[p.platform]?.label ?? p.platform))].join(
                              ", ",
                            )}
                          </span>
                        )}
                      </span>
                    </span>
                  </summary>
                  <div className="mt-2 space-y-2 pb-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Link href={`/pool/${topic.id}`} className="underline hover:text-foreground">
                        Topic details
                      </Link>
                      {topic.canonicalUrl && (
                        <a
                          href={topic.canonicalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-foreground"
                        >
                          {hostOf(topic.canonicalUrl)}
                        </a>
                      )}
                      {topic.category && <Badge variant="outline">{topic.category}</Badge>}
                    </div>
                    {posts.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No posts yet: tick the box and press Generate.
                      </p>
                    )}
                    {posts.map((p) => (
                      <div key={p.id} className="space-y-2 rounded-md border bg-muted/20 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary">{PLATFORMS[p.platform]?.label ?? p.platform}</Badge>
                          <span>{p.lang}</span>
                          <span className="font-mono">{p.model}</span>
                          <span>{relativeTime(p.createdAt)}</span>
                          <span className="ml-auto flex gap-1">
                            <CopyButton text={p.content} label="Copy post" />
                            <form action={deletePostAction}>
                              <input type="hidden" name="id" value={p.id} />
                              <Button type="submit" size="xs" variant="ghost">
                                Delete
                              </Button>
                            </form>
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{p.content}</p>
                        {p.imagePrompts && (
                          <details className="group/img rounded-md border bg-background">
                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
                              <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open/img:rotate-90" />
                              <ImageIcon className="size-3.5" />
                              <span className="font-medium">
                                Image prompts · {countSlides(p.imagePrompts)}{" "}
                                {countSlides(p.imagePrompts) === 1 ? "image" : "images"}
                                {PLATFORMS[p.platform] && ` · ${PLATFORMS[p.platform].image.aspectLabel}`}
                              </span>
                              <span className="text-muted-foreground">
                                paste into any image model (Midjourney, DALL-E, Flux…)
                              </span>
                            </summary>
                            <div className="space-y-2 border-t px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                <CopyButton text={p.imagePrompts} label="Copy image prompts" />
                                {onImageTexts(p.imagePrompts) && (
                                  <CopyButton
                                    text={onImageTexts(p.imagePrompts)}
                                    label="Copy slide texts only"
                                  />
                                )}
                              </div>
                              <pre className="max-h-96 overflow-auto text-xs whitespace-pre-wrap">
                                {p.imagePrompts}
                              </pre>
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
                <form action={toggleSavedAction}>
                  <input type="hidden" name="id" value={topic.id} />
                  <input type="hidden" name="saved" value="false" />
                  <Button type="submit" size="xs" variant="ghost">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
