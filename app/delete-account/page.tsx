import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Delete your account · Surfaced",
  description: "How to delete your Surfaced / Trend Pool account and its data.",
};

/** Google Play requires a public page explaining account deletion for apps with accounts. */
export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your Surfaced account">
      <p>Surfaced (the app) and Trend Pool (this website) share one account. Deleting it deletes it everywhere.</p>

      <h2>In the app</h2>
      <ol className="ml-5 list-decimal space-y-1">
        <li>Open Surfaced and go to the <strong>Profile</strong> tab.</li>
        <li>Tap <strong>Delete my account</strong>.</li>
        <li>Enter your password and tap <strong>Delete account permanently</strong>.</li>
      </ol>

      <h2>On the website</h2>
      <p>Sign in at trend.developerfox.com.tr, open <strong>Profile</strong>, and use <strong>Delete account</strong>.</p>

      <h2>By email</h2>
      <p>
        Can&apos;t sign in? Email <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20account`}>{CONTACT_EMAIL}</a>{" "}
        from the address on your account, with the subject &quot;Delete my account&quot;. We delete it within 30 days,
        usually much sooner, and confirm by email.
      </p>

      <h2>What gets deleted</h2>
      <p>
        Right away and permanently: your account (email, password hash, display name, handle), comments, comment likes,
        reactions, saved stories, follows, notification settings and push tokens, sign-in sessions, reports you made, and
        blocks. Nothing is kept except server logs, which are rotated, and backups, which are overwritten within 14 days.
      </p>
      <p>Stories themselves aren&apos;t personal data and stay in the app.</p>
    </LegalPage>
  );
}
