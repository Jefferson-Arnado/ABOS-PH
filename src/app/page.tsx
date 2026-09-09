import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-32 text-center">
      <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
        AI Business Opportunity Scanner
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Find local businesses with weak or missing online presence, score the
        opportunity, and know exactly who to contact first.
      </p>
      <Button asChild size="lg" className="mt-2">
        <Link href="/dashboard">Go to Dashboard</Link>
      </Button>
      <p className="text-sm text-muted-foreground">
        MVP under construction — see{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          docs/PLAN.md
        </code>{" "}
        for the roadmap.
      </p>
    </div>
  );
}
