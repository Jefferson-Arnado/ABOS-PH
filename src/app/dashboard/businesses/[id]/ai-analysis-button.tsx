"use client";

import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Generate AI Analysis" button (spec §12) — POSTs to the ai-analysis
 * route and refreshes so the server-rendered section picks up the cached
 * text. Errors surface inline (403 not-top-prospect, 502 provider…).
 */
export function AiAnalysisButton({ businessId }: { businessId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/businesses/${encodeURIComponent(businessId)}/ai-analysis`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          detail?: string;
        } | null;
        const detail = body?.detail ? ` — ${body.detail}` : "";
        setError(`${body?.error ?? res.statusText}${detail}`);
        return;
      }
      // Re-render the server component with the cached analysis.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button type="button" size="sm" onClick={generate} disabled={pending}>
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {pending ? "Generating…" : "Generate AI Analysis"}
      </Button>
      {pending && (
        <p className="mt-2 text-xs text-muted-foreground">
          Local model — this can take up to a minute.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
