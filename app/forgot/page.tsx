import { ForgotPasswordForm } from "@/components/password-help-forms";

export const metadata = { title: "Forgot password · Trend Pool" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter the email you signed up with and we&apos;ll send you a link to choose a new one.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
