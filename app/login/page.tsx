import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { authSettings, getViewer } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/session";

export const metadata = { title: "Sign in · Trend Pool" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(Array.isArray(next) ? next[0] : next);
  // Localhost may browse without a login, but can still sign in (for Saved and Settings).
  if ((await getViewer())?.via === "session") redirect(target);
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Sign in with the email you signed up with.</p>
      </div>
      {!authSettings() && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          Login is not configured: set <code>DASHBOARD_USER</code>, <code>DASHBOARD_PASSWORD_HASH</code> and{" "}
          <code>SESSION_SECRET</code> in <code>.env</code> (README §6).
        </p>
      )}
      <LoginForm next={target} />
    </div>
  );
}
