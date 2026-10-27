import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PAGE_SIZES, pageWindow } from "@/lib/data/topic-filters";

const btn =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm hover:bg-accent hover:text-foreground";

/**
 * Page links under the Pool table: ‹ 1 … 4 5 [6] 7 8 … 20 › plus "per page". Plain links, so it works
 * without JavaScript and every page has its own shareable URL.
 */
export function PoolPagination({
  page,
  per,
  total,
  href,
}: {
  page: number;
  per: number;
  total: number;
  /** URL for a page number and page size (keeps the current filters). */
  href: (page: number, per: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / per));
  const from = total === 0 ? 0 : (page - 1) * per + 1;
  const to = Math.min(total, page * per);
  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
      aria-label="Pages"
    >
      <span>
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </span>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {page > 1 ? (
            <Link href={href(page - 1, per)} className={btn} aria-label="Previous page" rel="prev">
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className={`${btn} pointer-events-none opacity-40`} aria-hidden>
              <ChevronLeft className="size-4" />
            </span>
          )}
          {pageWindow(page, pages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : p === page ? (
              <span
                key={p}
                className={`${btn} border-primary bg-primary text-primary-foreground`}
                aria-current="page"
              >
                {p}
              </span>
            ) : (
              <Link key={p} href={href(p, per)} className={btn}>
                {p}
              </Link>
            ),
          )}
          {page < pages ? (
            <Link href={href(page + 1, per)} className={btn} aria-label="Next page" rel="next">
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className={`${btn} pointer-events-none opacity-40`} aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      )}
      <span className="flex items-center gap-1">
        Per page:
        {[...PAGE_SIZES]
          .sort((a, b) => a - b)
          .map((n) =>
            n === per ? (
              <span key={n} className="px-1 font-medium text-foreground">
                {n}
              </span>
            ) : (
              <Link key={n} href={href(1, n)} className="px-1 underline-offset-2 hover:underline">
                {n}
              </Link>
            ),
          )}
      </span>
    </nav>
  );
}
