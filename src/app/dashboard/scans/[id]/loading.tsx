import { LoaderCircle } from "lucide-react";

/**
 * Scan results take a few seconds on first load (paginated DB read of
 * every business in the scan) — show an honest loading state.
 */
export default function Loading() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
      <LoaderCircle className="size-8 animate-spin" aria-hidden />
      <p className="text-sm">Loading scan results…</p>
    </div>
  );
}
