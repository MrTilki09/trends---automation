import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { ChangePasswordForm, DeleteAccountForm } from "@/components/profile-forms";
import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/accounts";
import { getViewer, requireSignedInUser } from "@/lib/auth/server";
import { getConfig } from "@/lib/config";
import { accountStats, nvidiaKeyStatus, userBrand, userModel } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { formatDateTime, relativeTime } from "@/lib/utils";

export const metadata = { title: "Profile · Trend Pool" };

const card = "space-y-3 rounded-lg border px-4 py-4";

/** The signed-in person's account: who they are, their usage, password and account deletion. */
export default async function ProfilePage() {
  const user = await requireSignedInUser("/profile");
  const viewer = await getViewer();
  const isOwner = viewer?.role === "owner";
  const [stats, key] = await Promise.all([
    accountStats(getDb(), user.id),
    Promise.resolve(nvidiaKeyStatus(user, getConfig().SECRETS_KEY)),
  ]);
  const initial = user.username.slice(0, 1).toUpperCase();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className="flex size-14 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground"
          aria-hidden
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{user.username}</h1>
          <p className="text-sm text-muted-foreground">
            {isOwner ? "Owner" : "Member"} · joined {formatDateTime(user.createdAt)}
            {user.emailVerifiedAt && " · email confirmed"}
          </p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            Log out
          </Button>
        </form>
      </div>

      <section className={card}>
        <h2 className="font-medium">Your activity</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Saved topics</dt>
            <dd className="text-lg font-semibold">
              <Link href="/saved" className="hover:underline">
                {stats.saved}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Posts generated</dt>
            <dd className="text-lg font-semibold">{stats.posts}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last post</dt>
            <dd className="text-lg font-semibold">
              {stats.lastPostAt ? relativeTime(stats.lastPostAt) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">NVIDIA key</dt>
            <dd className="text-lg font-semibold">{key.state === "saved" ? "Added" : "Not added"}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          Posts are written with <code>{userModel(user)}</code> and carry the watermark “{userBrand(user)}”.{" "}
          <Link href="/settings" className="underline">
            Change these in Settings
          </Link>
          .
        </p>
      </section>

      <section className={card}>
        <h2 className="font-medium">Password</h2>
        {user.passwordHash ? (
          <ChangePasswordForm email={user.username} minPassword={MIN_PASSWORD_LENGTH} />
        ) : (
          <p className="text-sm text-muted-foreground">
            The owner&apos;s password is set on the server (<code>DASHBOARD_PASSWORD_HASH</code> in{" "}
            <code>.env</code>, see the README).
          </p>
        )}
      </section>

      {user.passwordHash && (
        <section className={`${card} border-destructive/40`}>
          <h2 className="font-medium text-destructive">Delete account</h2>
          <p className="text-sm text-muted-foreground">
            Removes your account, your saved topics, generated posts and your NVIDIA key. This can&apos;t be
            undone.
          </p>
          <DeleteAccountForm email={user.username} />
        </section>
      )}
    </div>
  );
}
