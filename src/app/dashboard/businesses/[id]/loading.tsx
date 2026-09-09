import { LoaderCircle } from "lucide-react";

/** Business detail reads the latest analysis from the view — quick, but not instant. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
        <LoaderCircle className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">Loading business analysis…</p>
      </div>
    </div>
  );
}
