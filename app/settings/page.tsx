import { clearNvidiaKeyAction } from "@/app/user-actions";
import { NvidiaSettingsForm } from "@/components/nvidia-settings-form";
import { Button } from "@/components/ui/button";
import { requireSignedInUser } from "@/lib/auth/server";
import { getConfig } from "@/lib/config";
import { nvidiaKeyStatus, userModel } from "@/lib/data/users";
import { NVIDIA_MODELS } from "@/lib/llm/nvidia";

export const metadata = { title: "Settings · Trend Pool" };

export default async function SettingsPage() {
  const user = await requireSignedInUser("/settings");
  const secretsKey = getConfig().SECRETS_KEY;
  const status = nvidiaKeyStatus(user, secretsKey);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.username}.</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">NVIDIA API (post generation)</h2>
        <p className="text-sm text-muted-foreground">
          Create a free key at{" "}
          <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" className="underline">
            build.nvidia.com
          </a>{" "}
          (profile menu → API Keys; it starts with <code>nvapi-</code>). It is stored encrypted for your
          account only and never shown again.
        </p>
        {!secretsKey && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            The server has no <code>SECRETS_KEY</code> set, so API keys can&apos;t be stored (README §5c).
          </p>
        )}
        <div className="flex items-center gap-3 text-sm">
          <span>Current key:</span>
          {status.state === "saved" && <code>{status.masked}</code>}
          {status.state === "none" && <span className="text-muted-foreground">none</span>}
          {status.state === "unreadable" && (
            <span className="text-destructive">
              can&apos;t be decrypted (SECRETS_KEY changed): enter it again
            </span>
          )}
          {status.state !== "none" && (
            <form action={clearNvidiaKeyAction}>
              <Button type="submit" size="xs" variant="outline">
                Remove key
              </Button>
            </form>
          )}
        </div>
        <NvidiaSettingsForm
          models={NVIDIA_MODELS.map((m) => ({ value: m.id, label: m.label }))}
          model={userModel(user)}
          hasKey={status.state === "saved"}
        />
      </section>
    </div>
  );
}
