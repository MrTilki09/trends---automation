"use client";

import { Loader2, LogIn } from "lucide-react";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1 text-sm">
        <span>Username</span>
        <Input name="user" autoComplete="username" required autoFocus />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Password</span>
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
  );
}
