import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact us · Surfaced",
  description: "How to reach the team behind the Surfaced app and this website.",
};

/** Public contact page for the Surfaced app and this site (Google Play News policy, App Store). */
export default function ContactPage() {
  return (
    <LegalPage title="Contact us">
      <p>
        <strong>Surfaced</strong> is a tech news aggregator: it shows headlines and short excerpts from hundreds of
        sources, always credited to the original publisher and linked to the original article. This website,{" "}
        <strong>trend.developerfox.com.tr</strong>, is its home.
      </p>

      <h2>Email</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We reply within 2 business days.
      </p>

      <h2>Publishers</h2>
      <p>
        If you publish one of our sources and want your content removed, credited differently or corrected, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=Publisher%20request`}>{CONTACT_EMAIL}</a> with the subject
        &ldquo;Publisher request&rdquo;. We act on removal requests within 48 hours.
      </p>

      <h2>Report content or a user</h2>
      <p>
        In the app, use <em>Report</em> on any comment or profile. You can also email us; include a link to the story
        or comment.
      </p>

      <h2>Your account and data</h2>
      <p>
        See the <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms</Link>. To delete your
        account, see <Link href="/delete-account">Delete your account</Link>.
      </p>
    </LegalPage>
  );
}
