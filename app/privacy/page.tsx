import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · Surfaced",
  description: "What the Surfaced app and Trend Pool collect, why, and how to delete it.",
};

/** Privacy policy for the Surfaced app and this website (same accounts). Keep in sync with the code. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL_UPDATED}>
      <p>
        This policy covers the <strong>Surfaced</strong> mobile app and the website{" "}
        <strong>trend.developerfox.com.tr</strong> (Trend Pool). Both use the same accounts and the same server.
        Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Short version</h2>
      <ul>
        <li>You can read everything without an account. We collect personal data only if you create one.</li>
        <li>We don&apos;t sell data, show ads, or use analytics or advertising trackers.</li>
        <li>You can delete your account and its data at any time, in the app or by email.</li>
      </ul>

      <h2>What we collect, and why</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>When</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Email address</td>
            <td>When you create an account</td>
            <td>Signing in, confirming the account, password resets. We don&apos;t send marketing email.</td>
          </tr>
          <tr>
            <td>Password</td>
            <td>When you create an account</td>
            <td>Signing in. We store only a salted scrypt hash, never the password itself.</td>
          </tr>
          <tr>
            <td>Display name and handle (optional)</td>
            <td>If you set them in your profile</td>
            <td>Shown next to your comments.</td>
          </tr>
          <tr>
            <td>Follows (topics, companies, languages)</td>
            <td>If you pick interests</td>
            <td>Ranking your &quot;For you&quot; feed and choosing which breaking stories may notify you.</td>
          </tr>
          <tr>
            <td>Reactions, saved stories, comments, comment likes</td>
            <td>When you use them</td>
            <td>Providing those features. Comments, with your display name or handle, are visible to other users.</td>
          </tr>
          <tr>
            <td>Reports and blocks</td>
            <td>If you report content or block someone</td>
            <td>Moderation and hiding blocked users&apos; comments from you.</td>
          </tr>
          <tr>
            <td>Push notification token and settings (including time zone)</td>
            <td>If you turn on notifications</td>
            <td>Sending the notifications you asked for, and not at night in your time zone.</td>
          </tr>
          <tr>
            <td>Sign-in sessions (device type, when last used)</td>
            <td>When you sign in</td>
            <td>Keeping you signed in and letting sign-out end a session.</td>
          </tr>
          <tr>
            <td>IP address</td>
            <td>Every request</td>
            <td>
              Security: rate limits and spotting abuse. IP addresses are held in memory for rate limiting and appear in
              server logs for failed sign-ins; we don&apos;t link them to a profile.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        On your phone, the app stores your sign-in token in the system keychain or keystore, and your &quot;ask before
        opening articles&quot; setting. Website accounts that use post generation also store an NVIDIA API key you
        provide, encrypted.
      </p>
      <p>
        We don&apos;t collect your location, contacts, photos, or precise device identifiers, and we don&apos;t use
        analytics, crash-reporting, or advertising SDKs.
      </p>

      <h2>News content</h2>
      <p>
        Stories in Surfaced come from publishers&apos; public feeds: headline, a short snippet, and an image where the
        publisher provides one, always credited and linked to the original article. Opening an article takes you to the
        publisher&apos;s site, which has its own privacy policy; the app tells you before it leaves.
      </p>

      <h2>Who processes data for us</h2>
      <ul>
        <li>Our server and database (hosted on a server we rent), behind Cloudflare, which carries all traffic over HTTPS.</li>
        <li>Hostinger, for sending account emails.</li>
        <li>Expo (and through it Apple and Google push services), for delivering push notifications you turned on.</li>
      </ul>
      <p>They process data only to provide these services to us. We don&apos;t share personal data with anyone else, except when the law requires it.</p>

      <h2>How long we keep it</h2>
      <p>
        Account data is kept until you delete your account. Deleting it removes your account, comments, reactions, saved
        stories, follows, sessions, push tokens, reports and blocks right away. Server logs are rotated and kept for a
        limited time. Backups are overwritten within 14 days.
      </p>

      <h2>Your rights</h2>
      <p>
        You can see and change your data in the app (Profile), delete your account (
        <Link href="/delete-account">how to delete your account</Link>), and ask us for a copy or a correction by email.
        If you are in the EU/EEA (GDPR) or Türkiye (KVKK), you also have the right to object, to restrict processing, and
        to complain to your data protection authority.
      </p>

      <h2>Children</h2>
      <p>Surfaced is meant for people 13 and older. We don&apos;t knowingly collect data from children under 13; if you believe a child has an account, email us and we will delete it.</p>

      <h2>Security</h2>
      <p>All connections use HTTPS. Passwords are hashed, sign-in tokens are short-lived and stored only as hashes on the server, and access to the server is restricted.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we update the date above, and for significant changes we tell you in the app.</p>
    </LegalPage>
  );
}
