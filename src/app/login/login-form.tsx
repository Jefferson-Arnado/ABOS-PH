"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "./actions";

interface LoginFormProps {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  nextAction: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  next: string;
}

export function LoginForm({ action, nextAction, next }: LoginFormProps) {
  const [loginState, loginAction, loginPending] = useActionState(action, {});
  const [signupState, signupAction, signupPending] = useActionState(nextAction, {});

  return (
    <div className="w-full max-w-sm space-y-6">
      <form action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
          />
        </div>
        {loginState.error && (
          <p className="text-sm text-destructive">{loginState.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={loginPending}>
          {loginPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <form action={signupAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
        {signupState.error && (
          <p className="text-sm text-destructive">{signupState.error}</p>
        )}
        <Button
          type="submit"
          variant="outline"
          className="w-full"
          disabled={signupPending}
        >
          {signupPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
