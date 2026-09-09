/**
 * Normalized business model — the canonical shape used across the app.
 * Providers (OSM, later Google) map their raw payloads into this shape.
 * See docs/ARCHITECTURE.md §6.
 */
export const BUSINESS_SOURCES = ["osm", "google"] as const;

export type BusinessSource = (typeof BUSINESS_SOURCES)[number];

export interface Business {
  id: string;
  name: string;
  category?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  source: BusinessSource;
  sourceId: string;
}

/** Input accepted by a BusinessProvider.search() call (spec §4). */
export interface SearchParams {
  latitude: number;
  longitude: number;
  /** Meters. */
  radius: number;
  category: string;
}

/**
 * The 10 V1 categories (spec §3) with their OSM tag filters.
 * A single category may map to several OSM tag values (OR-ed together).
 * See docs/ARCHITECTURE.md — categories are config, not hardcoded logic
 * (docs/AGENTS.md §8).
 */
export const CATEGORIES = [
  "restaurants",
  "dental_clinics",
  "beauty_salons",
  "barbershops",
  "gyms",
  "auto_repair",
  "real_estate",
  "hotels",
  "medical_clinics",
  "pet_shops",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  restaurants: "Restaurants",
  dental_clinics: "Dental Clinics",
  beauty_salons: "Beauty Salons",
  barbershops: "Barbershops",
  gyms: "Gyms",
  auto_repair: "Auto Repair",
  real_estate: "Real Estate",
  hotels: "Hotels",
  medical_clinics: "Medical Clinics",
  pet_shops: "Pet Shops",
};

/** OSM tag values that correspond to each category (amenity/shop/office). */
export const CATEGORY_OSM_TAGS: Record<Category, string[]> = {
  restaurants: ["amenity=restaurant", "amenity=fast_food", "amenity=cafe"],
  dental_clinics: ["amenity=dentist"],
  beauty_salons: ["shop=beauty", "shop=hairdresser"],
  barbershops: ["shop=hairdresser"],
  gyms: ["leisure=fitness_centre", "leisure=sports_centre"],
  auto_repair: ["shop=car_repair"],
  real_estate: ["office=estate_agent"],
  hotels: ["tourism=hotel", "tourism=guest_house", "tourism=hostel"],
  medical_clinics: ["amenity=clinic", "amenity=doctors"],
  pet_shops: ["shop=pet"],
};
