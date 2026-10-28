"use client";

import { Loader2, LogIn, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, resendVerificationAction, type LoginState, type ResendState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <Input name="user" autoComplete="username" required autoFocus />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex items-baseline justify-between">
            Password
            <Link
              href="/forgot"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </span>
          <Input name="password" type="password" autoComplete="current-password" required />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
          Sign in
        </Button>
      </form>
      {state.unverifiedEmail && <ResendForm email={state.unverifiedEmail} />}
      <p className="text-center text-sm text-muted-foreground">
        No account yet?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

function ResendForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ResendState, FormData>(resendVerificationAction, {});
  return (
    <form action={action} className="space-y-2 rounded-lg border px-3 py-2 text-sm">
      <input type="hidden" name="email" value={email} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Mail />}
        Send the confirmation link again
      </Button>
      {state.message && <p>{state.message}</p>}
      {state.error && <p className="text-destructive">{state.error}</p>}
    </form>
  );
}
