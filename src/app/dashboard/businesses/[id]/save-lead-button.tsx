"use client";

import { useActionState } from "react";
import { BookmarkPlus, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveLead, type SaveLeadState } from "./save-lead-action";

/**
 * Save Lead button (spec §13/§14) — idempotent: a duplicate save turns
 * the button into a "Saved" state (dedup, PLAN.md Phase 8).
 */
export function SaveLeadButton({
  businessId,
  size = "sm",
  variant = "outline",
  className,
}: {
  businessId: string;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "default";
  className?: string;
}) {
  const [state, action, pending] = useActionState<SaveLeadState, FormData>(
    saveLead,
    {}
  );

  return (
    <form action={action} className={className}>
      <input type="hidden" name="businessId" value={businessId} />
      <Button
        type="submit"
        size={size}
        variant={state.ok ? "secondary" : variant}
        disabled={pending || state.ok}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : state.ok ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <BookmarkPlus className="size-4" aria-hidden />
        )}
        {pending ? "Saving…" : state.ok ? "Saved" : "Save Lead"}
      </Button>
      {state.error && (
        <p className="mt-1 text-xs text-destructive">{state.error}</p>
      )}
    </form>
  );
}
