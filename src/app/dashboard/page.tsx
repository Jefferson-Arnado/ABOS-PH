import { redirect } from "next/navigation";
import { ScanForm } from "./scan-form";
import {
  CATEGORIES,
  CATEGORY_LABELS,
} from "@/types/business";
import { getSessionUser } from "@/lib/supabase/clients";

export const metadata = { title: "New scan — Opportunity Scanner" };

/** Radius options in meters (spec §3: simple dropdown, no map yet). */
const RADII = [
  { value: 1000, label: "1 km" },
  { value: 2000, label: "2 km" },
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
  { value: 25000, label: "25 km" },
] as const;

/** Preset search locations (spec §4: city + coords, no autocomplete in V1). */
const LOCATIONS = [
  { label: "Davao City", latitude: 7.0731, longitude: 125.6128 },
  { label: "Cebu City", latitude: 10.3157, longitude: 123.8854 },
  { label: "Manila", latitude: 14.5995, longitude: 120.9842 },
  { label: "Quezon City", latitude: 14.676, longitude: 121.0437 },
  { label: "Iloilo City", latitude: 10.7202, longitude: 122.5621 },
] as const;

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Find businesses that need your services
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a location and category. We scan business listings, check their
          online presence, and score the opportunity 0–100.
        </p>
      </div>

      <ScanForm
        categories={CATEGORIES.map((value) => ({
          value,
          label: CATEGORY_LABELS[value],
        }))}
        locations={LOCATIONS.map((l) => ({
          label: l.label,
          latitude: l.latitude,
          longitude: l.longitude,
        }))}
        radii={RADII.map((r) => ({ value: r.value, label: r.label }))}
      />
    </div>
  );
}
