import { CircleCheck, CircleX } from "lucide-react";
import Link from "next/link";
import { verifyEmailToken } from "@/lib/auth/accounts";
import { getDb } from "@/lib/db/client";

export const metadata = { title: "Confirm email · Trend Pool" };

/** Target of the emailed link: /verify?token=… confirms the account (each link works once). */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const result = await verifyEmailToken(getDb(), Array.isArray(token) ? (token[0] ?? "") : (token ?? ""));

  return (
    <div className="mx-auto mt-16 max-w-sm space-y-3 text-sm">
      {result.ok ? (
        <>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CircleCheck className="size-5 text-green-600" /> Email confirmed
          </h1>
          <p>
            <strong>{result.email}</strong> is confirmed. You can sign in now.
          </p>
          <Link
            href="/login"
            className="inline-block rounded-md border px-3 py-1.5 font-medium hover:bg-muted"
          >
            Sign in
          </Link>
        </>
      ) : (
        <>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CircleX className="size-5 text-destructive" /> Link not valid
          </h1>
          <p>
            This confirmation link is invalid, expired (links work for 24 hours) or was already used. Try to{" "}
            <Link href="/login" className="underline">
              sign in
            </Link>
            : if your email still needs confirming, you can ask for a new link there.
          </p>
        </>
      )}
    </div>
  );
}
