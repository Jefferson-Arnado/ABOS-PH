"use client";

import { useActionState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reanalyze } from "./actions";

export function ReanalyzeButton({
  businessId,
  className,
}: {
  businessId: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState(reanalyze, {});

  return (
    <form action={action} className={className}>
      <input type="hidden" name="businessId" value={businessId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-4" aria-hidden />
        )}
        {pending ? "Re-checking…" : "Re-analyze"}
      </Button>
      {state.error && (
        <p className="mt-1 text-xs text-destructive">{state.error}</p>
      )}
    </form>
  );
}
