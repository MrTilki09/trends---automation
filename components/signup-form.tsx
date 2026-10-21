"use client";

import { Loader2, MailCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type SignupState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignupForm({ minPassword }: { minPassword: number }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signupAction, {});

  if (state.sentTo) {
    return (
      <div className="space-y-2 rounded-lg border px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <MailCheck className="size-4" /> Check your inbox
        </p>
        <p>
          We sent a confirmation link to <strong>{state.sentTo}</strong>. Open it to activate your account (it
          works for 24 hours), then{" "}
          <Link href="/login" className="underline">
            sign in
          </Link>
          .
        </p>
        <p className="text-muted-foreground">Nothing there? Check your spam folder.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>Email</span>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          defaultValue={state.values?.email}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Password (at least {minPassword} characters)</span>
        <Input name="password" type="password" autoComplete="new-password" minLength={minPassword} required />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Repeat password</span>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={minPassword} required />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
        Create account
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
