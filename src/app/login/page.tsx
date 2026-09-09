import { login, signup } from "./actions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Opportunity Scanner" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/dashboard";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <div className="w-full max-w-sm space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Email login — your scans and leads are scoped to your account.
        </p>
      </div>

      {params.error === "confirm" && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          That confirmation link is invalid or expired. Please sign in again.
        </p>
      )}

      <LoginForm action={login} nextAction={signup} next={next} />
    </div>
  );
}
