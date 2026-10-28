import { CircleX } from "lucide-react";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/password-help-forms";
import { MIN_PASSWORD_LENGTH, peekEmailToken } from "@/lib/auth/accounts";
import { getDb } from "@/lib/db/client";

export const metadata = { title: "Reset password · Trend Pool" };

/** Target of the emailed reset link: /reset?token=… (opening it changes nothing; the form does). */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: raw } = await searchParams;
  const token = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  const link = await peekEmailToken(getDb(), token, "reset_password");

  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4 text-sm">
      {link ? (
        <>
          <div>
            <h1 className="text-xl font-semibold">Choose a new password</h1>
            <p className="text-muted-foreground">
              For <strong className="text-foreground">{link.email}</strong>.
            </p>
          </div>
          <ResetPasswordForm token={token} email={link.email} minPassword={MIN_PASSWORD_LENGTH} />
        </>
      ) : (
        <>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CircleX className="size-5 text-destructive" /> Link not valid
          </h1>
          <p>
            This reset link is invalid, expired (links work for 1 hour) or was already used.{" "}
            <Link href="/forgot" className="underline">
              Ask for a new one
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
