"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  type OpportunityType,
} from "@/types/scan";

interface ScanFormProps {
  categories: { value: string; label: string }[];
  locations: { label: string; latitude: number; longitude: number }[];
  radii: { value: number; label: string }[];
}

type Status = "idle" | "scanning" | "error";

export function ScanForm({ categories, locations, radii }: ScanFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState(locations[0]?.label ?? "");
  const [category, setCategory] = useState(categories[0]?.value ?? "");
  const [radius, setRadius] = useState(String(radii[3]?.value ?? 10000));
  // Spec §3: first three opportunity types checked by default.
  const [types, setTypes] = useState<OpportunityType[]>([
    "no_website",
    "weak_website",
    "no_online_booking",
  ]);

  function toggleType(type: OpportunityType) {
    setTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = locations.find((l) => l.label === location);
    if (!selected) {
      setStatus("error");
      setError("Choose a location");
      return;
    }

    setStatus("scanning");
    setError(null);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: selected.label,
          latitude: selected.latitude,
          longitude: selected.longitude,
          radius: Number(radius),
          category,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `Scan failed (${res.status})`);
      }
      // Opportunity-type filters apply to the results view (Phase 7);
      // carried in the URL so they survive the redirect.
      const typesQuery =
        types.length > 0 && types.length < OPPORTUNITY_TYPES.length
          ? `?types=${types.join(",")}`
          : "";
      router.push(`/dashboard/scans/${body.scanId}${typesQuery}`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Scan failed");
    }
  }

  const scanning = status === "scanning";

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg border p-6">
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Select
          name="location"
          value={location}
          onValueChange={setLocation}
          disabled={scanning}
        >
          <SelectTrigger id="location" className="w-full">
            <SelectValue placeholder="Choose a city" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.label} value={l.label}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Business category</Label>
          <Select
            name="category"
            value={category}
            onValueChange={setCategory}
            disabled={scanning}
          >
            <SelectTrigger id="category" className="w-full">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="radius">Radius</Label>
          <Select
            name="radius"
            value={radius}
            onValueChange={setRadius}
            disabled={scanning}
          >
            <SelectTrigger id="radius" className="w-full">
              <SelectValue placeholder="Choose a radius" />
            </SelectTrigger>
            <SelectContent>
              {radii.map((r) => (
                <SelectItem key={r.value} value={String(r.value)}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Opportunity type</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPPORTUNITY_TYPES.map((type) => (
            <label
              key={type}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                checked={types.includes(type)}
                onCheckedChange={() => toggleType(type)}
                disabled={scanning}
              />
              {OPPORTUNITY_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </fieldset>

      {status === "error" && error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={scanning || !location || !category}
      >
        {scanning ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Search className="size-4" aria-hidden />
        )}
        {scanning
          ? "Scanning businesses… (this takes ~30s)"
          : "Scan Businesses"}
      </Button>
      {scanning && (
        <p className="text-center text-xs text-muted-foreground">
          Searching OpenStreetMap, checking each website, and scoring the
          opportunities. Keep this tab open.
        </p>
      )}
    </form>
  );
}
