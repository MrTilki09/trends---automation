"use client";

import { KeyRound, Loader2, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, resetPasswordAction, type ForgotState, type ResetState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** /forgot: ask for a reset link. Same answer whether or not the email has an account. */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPasswordAction, {});
  if (state.sentTo) {
    return (
      <div className="space-y-2 rounded-lg border px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <MailCheck className="size-4" /> Check your inbox
        </p>
        <p>
          If <strong>{state.sentTo}</strong> has an account, we sent it a link to choose a new password (it
          works for 1 hour). Nothing there? Check your spam folder.
        </p>
        <p>
          <Link href="/login" className="underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>Email</span>
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <Mail />}
        Email me a reset link
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** /reset: choose the new password (the emailed link's token travels as a hidden field). */
export function ResetPasswordForm({
  token,
  email,
  minPassword,
}: {
  token: string;
  email: string;
  minPassword: number;
}) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="username" value={email} autoComplete="username" />
      <label className="block space-y-1 text-sm">
        <span>New password (at least {minPassword} characters)</span>
        <Input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={minPassword}
          required
          autoFocus
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Repeat new password</span>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={minPassword} required />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        Save new password and sign in
      </Button>
    </form>
  );
}
