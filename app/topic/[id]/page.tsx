import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_NAME, APP_SCHEME } from "@/lib/app-links";
import { getConfig } from "@/lib/config";
import { getTopicDetail } from "@/lib/data/feed";
import { getDb } from "@/lib/db/client";
import { relativeTime } from "@/lib/utils";

/*
 * Public page for a shared story: https://<domain>/topic/:id. With the Surfaced app installed,
 * the phone opens the app instead (Universal Links / App Links); everyone else lands here.
 * Shows only what the app shows: headline, the publisher's snippet with credit, the sources.
 */

type Props = { params: Promise<{ id: string }> };

async function load(idParam: string) {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return getTopicDetail(getDb(), id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const detail = await load((await params).id);
  if (!detail) return { title: `Story not found · ${APP_NAME}` };
  const { topic } = detail;
  const description =
    topic.snippet && topic.snippetPublisher
      ? `${topic.snippet} (${topic.snippetPublisher})`
      : `Trending on ${topic.publisherCount} source${topic.publisherCount === 1 ? "" : "s"}.`;
  return {
    title: `${topic.title} · ${APP_NAME}`,
    description,
    openGraph: {
      type: "article",
      siteName: APP_NAME,
      title: topic.title,
      description,
      ...(topic.imageUrl ? { images: [{ url: topic.imageUrl, alt: `Image: ${topic.imagePublisher ?? "publisher"}` }] } : {}),
    },
    twitter: { card: topic.imageUrl ? "summary_large_image" : "summary", title: topic.title, description },
  };
}

export default async function SharedTopicPage({ params }: Props) {
  const { id } = await params;
  const detail = await load(id);
  if (!detail) notFound();
  const { topic, items } = detail;
  const cfg = getConfig();
  const host = (url: string | null) => {
    try {
      return url ? new URL(url).hostname.replace(/^www\./, "") : null;
    } catch {
      return null;
    }
  };

  return (
    <article className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {topic.category ?? "Tech"} · {relativeTime(new Date(topic.publishedAt))}
          {topic.publisherCount >= 2 ? ` · on ${topic.publisherCount} sources` : ""}
        </p>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">{topic.title}</h1>
        {topic.imageUrl && (
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- publisher's own feed image, not optimized by us */}
            <img src={topic.imageUrl} alt="" className="w-full rounded-lg border object-cover" />
            {topic.imagePublisher && (
              <figcaption className="text-xs text-muted-foreground">Image: {topic.imagePublisher}</figcaption>
            )}
          </figure>
        )}
        {topic.snippet && (
          <blockquote className="rounded-lg border bg-muted/40 p-4 text-[15px] leading-relaxed">
            {topic.snippet}
            {topic.snippetPublisher && (
              <footer className="mt-2 text-sm text-muted-foreground">From {topic.snippetPublisher}</footer>
            )}
          </blockquote>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href={`${APP_SCHEME}://topic/${topic.id}`}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open in the {APP_NAME} app
        </a>
        {topic.url && (
          <a href={topic.url} rel="noopener nofollow" className="rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted">
            Read on {topic.snippetPublisher ?? host(topic.url) ?? "the source"} ↗
          </a>
        )}
      </div>
      {(cfg.APP_STORE_URL || cfg.PLAY_STORE_URL) && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="text-muted-foreground">Don&apos;t have the app?</span>
          {cfg.APP_STORE_URL && (
            <a href={cfg.APP_STORE_URL} className="underline">
              App Store
            </a>
          )}
          {cfg.PLAY_STORE_URL && (
            <a href={cfg.PLAY_STORE_URL} className="underline">
              Google Play
            </a>
          )}
        </div>
      )}

      {items.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Coverage</h2>
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="text-sm">
                <span className="text-muted-foreground">{it.publisher} · </span>
                {it.url ? (
                  <a href={it.url} rel="noopener nofollow" className="underline-offset-2 hover:underline">
                    {it.title}
                  </a>
                ) : (
                  it.title
                )}
                {it.url && <span className="text-xs text-muted-foreground"> ({host(it.url)})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted-foreground">
        {APP_NAME} shows the tech stories trending across hundreds of sources. Text and images belong to their
        publishers; links go to the original articles.
      </p>
    </article>
  );
}
