import type { ReactNode } from "react";

/** Simple readable layout for the public legal pages (/privacy, /terms, /delete-account). */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article
      className="mx-auto max-w-3xl space-y-4 py-4 text-[15px] leading-relaxed
        [&_a]:underline [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc
        [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:p-2 [&_td]:align-top
        [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {updated && <p className="text-sm text-muted-foreground">Last updated: {updated}</p>}
      </header>
      {children}
    </article>
  );
}
