"use client";

import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { changePasswordAction, deleteAccountAction, type ProfileState } from "@/app/user-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm({ email, minPassword }: { email: string; minPassword: number }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="max-w-sm space-y-3" key={state.message}>
      <input type="hidden" name="username" value={email} autoComplete="username" />
      <label className="block space-y-1 text-sm">
        <span>Current password</span>
        <Input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label className="block space-y-1 text-sm">
        <span>New password (at least {minPassword} characters)</span>
        <Input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={minPassword}
          required
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Repeat new password</span>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={minPassword} required />
      </label>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p className="text-sm text-green-600 dark:text-green-400">{state.message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        Change password
      </Button>
    </form>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(deleteAccountAction, {});
  return (
    <form action={action} className="max-w-sm space-y-3">
      <input type="hidden" name="username" value={email} autoComplete="username" />
      <label className="block space-y-1 text-sm">
        <span>Your password</span>
        <Input name="password" type="password" autoComplete="current-password" required />
      </label>
      <label className="block space-y-1 text-sm">
        <span>
          Type <strong>DELETE</strong> to confirm
        </span>
        <Input name="confirmText" autoComplete="off" required />
      </label>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Delete my account
      </Button>
    </form>
  );
}
