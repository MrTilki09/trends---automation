import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use · Surfaced",
  description: "The rules for using Surfaced and Trend Pool.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated={LEGAL_UPDATED}>
      <p>
        These terms apply to the <strong>Surfaced</strong> app and the website <strong>trend.developerfox.com.tr</strong>{" "}
        (Trend Pool). By using them you agree to these terms and to the <Link href="/privacy">Privacy Policy</Link>.
        Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>The service</h2>
      <p>
        Surfaced shows tech stories that are trending across many public news sources. Headlines, snippets and images
        belong to their publishers; we show short excerpts with credit and a link to the original article. We don&apos;t
        guarantee that any story is accurate, complete or still current.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 13 years old to create an account.</li>
        <li>Keep your password to yourself. You are responsible for what happens under your account.</li>
        <li>You can delete your account at any time (<Link href="/delete-account">how</Link>).</li>
      </ul>

      <h2>Comments and conduct</h2>
      <p>You keep the rights to what you write, and you allow us to show it in the app and on the website. Don&apos;t post:</p>
      <ul>
        <li>harassment, hate, threats or slurs;</li>
        <li>sexual content, or anything involving minors;</li>
        <li>spam, scams or advertising;</li>
        <li>other people&apos;s private information;</li>
        <li>anything illegal, or content you don&apos;t have the right to share.</li>
      </ul>
      <p>
        Anyone can report a comment or a user, and block users they don&apos;t want to see. Comments with several reports
        are hidden until we review them. We may remove content and suspend accounts that break these rules, and we act on
        reports of objectionable content within 24 hours.
      </p>

      <h2>Links to other sites</h2>
      <p>Articles open on the publisher&apos;s website. Those sites aren&apos;t ours, and their own terms and privacy policies apply.</p>

      <h2>Availability and liability</h2>
      <p>
        The service is provided &quot;as is&quot;, without warranties. We may change or stop features. To the extent the
        law allows, we aren&apos;t liable for indirect losses from using the service.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. We change the date above, and tell you in the app about significant changes.</p>
    </LegalPage>
  );
}
