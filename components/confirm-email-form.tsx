"use client";

import { CircleCheck, KeyRound, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { confirmEmailAction, type ConfirmState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * /verify: re-enter the password chosen at sign-up to activate the account. If it doesn't match (or
 * the person never signed up themselves), they can choose a new password right here.
 */
export function ConfirmEmailForm({
  token,
  email,
  minPassword,
}: {
  token: string;
  email: string;
  minPassword: number;
}) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmEmailAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="username" value={email} autoComplete="username" />
      {state.wrongPassword ? (
        <>
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
            <Input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={minPassword}
              required
            />
          </label>
        </>
      ) : (
        <label className="block space-y-1 text-sm">
          <span>Your password (the one you chose when signing up)</span>
          <Input name="password" type="password" autoComplete="current-password" required autoFocus />
        </label>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : state.wrongPassword ? (
          <KeyRound />
        ) : (
          <CircleCheck />
        )}
        {state.wrongPassword ? "Set password and activate" : "Activate my account"}
      </Button>
    </form>
  );
}
