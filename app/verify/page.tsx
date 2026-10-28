import { CircleX } from "lucide-react";
import Link from "next/link";
import { ConfirmEmailForm } from "@/components/confirm-email-form";
import { MIN_PASSWORD_LENGTH, peekEmailToken } from "@/lib/auth/accounts";
import { getDb } from "@/lib/db/client";

export const metadata = { title: "Confirm email · Trend Pool" };

/**
 * Target of the emailed confirmation link: /verify?token=…. Opening it changes nothing (mail scanners
 * pre-open links); the account is activated when the form below is sent with the password.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: raw } = await searchParams;
  const token = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  const link = await peekEmailToken(getDb(), token, "verify_email");

  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4 text-sm">
      {link ? (
        <>
          <div>
            <h1 className="text-xl font-semibold">Activate your account</h1>
            <p className="text-muted-foreground">
              Enter your password to confirm <strong className="text-foreground">{link.email}</strong>.
            </p>
          </div>
          <ConfirmEmailForm token={token} email={link.email} minPassword={MIN_PASSWORD_LENGTH} />
        </>
      ) : (
        <>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CircleX className="size-5 text-destructive" /> Link not valid
          </h1>
          <p>
            This confirmation link is invalid, expired (links work for 24 hours) or was already used. If your
            account is active, just{" "}
            <Link href="/login" className="underline">
              sign in
            </Link>
            . Otherwise{" "}
            <Link href="/signup" className="underline">
              sign up again
            </Link>{" "}
            or use{" "}
            <Link href="/forgot" className="underline">
              forgot password
            </Link>{" "}
            to get a new link.
          </p>
        </>
      )}
    </div>
  );
}
