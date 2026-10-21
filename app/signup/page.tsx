import { redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/accounts";
import { getViewer } from "@/lib/auth/server";

export const metadata = { title: "Sign up · Trend Pool" };

export default async function SignupPage() {
  if ((await getViewer())?.via === "session") redirect("/pool");
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you a link to confirm your address before you can use Trend Pool.
        </p>
      </div>
      <SignupForm minPassword={MIN_PASSWORD_LENGTH} />
    </div>
  );
}
