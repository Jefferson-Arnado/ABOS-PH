/**
 * HTML feature extraction (spec §8) — what does the homepage actually have?
 * All functions are pure string processing: no network, trivially testable
 * with fixtures (docs/PLAN.md Phase 10 strategy).
 */

/** Case-insensitive contains on the raw HTML. */
function contains(html: string, needle: string): boolean {
  return html.toLowerCase().includes(needle.toLowerCase());
}

/** Matches Philippine/international phone patterns in visible text or hrefs. */
const PHONE_PATTERNS = [
  /tel:\+?[\d\-().\s]{7,}/i,
  /\+63[\s\-()]?\d{2}[\s\-()]?\d{3}[\s\-()]?\d{4}/, // +63 XX XXX XXXX
  /\b09\d{2}[\s\-]?\d{3}[\s\-]?\d{4}\b/, // 09XX XXX XXXX
  /\b\(?\d{2,3}\)?[\s\-]\d{3}[\s\-]\d{4}\b/, // (082) 123-4567 style
];

export function detectPhone(html: string): boolean {
  return PHONE_PATTERNS.some((p) => p.test(html));
}

export function detectEmail(html: string): boolean {
  return /mailto:[^\s'"<>]+@[^\s'"<>]+\.[a-z]{2,}/i.test(html) ||
    /[^\s<>@"']+@[^\s<>@"']+\.(com|net|org|ph|io|co)\b/i.test(html);
}

/** Look for the business's own address (street/city hints), not a URL path. */
export function detectAddress(html: string): boolean {
  const addressHints = [
    /addr(?:ess)?\s*[:\-]/i,
    /\d{1,5}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive| Hwy|Highway)/i,
    /\b(?:City|Municipality)\b/i,
    /Barangay|Brgy\.?/i,
  ];
  return addressHints.some((p) => p.test(html));
}

export function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  return match[1].replace(/\s+/g, " ").trim() || undefined;
}

export function extractMetaDescription(html: string): string | undefined {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i,
  ];
  for (const p of patterns) {
    const match = html.match(p);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, " ").trim() || undefined;
    }
  }
  return undefined;
}

export function detectMobileViewport(html: string): boolean {
  return /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html) &&
    /width\s*=\s*["']?device-width/i.test(html);
}

/** Functionality keyword groups (spec §8 "Business functionality"). */
const BOOKING_KEYWORDS = [
  "book now", "book online", "make a reservation", "reservation",
  "appointment", "schedule an appointment", "book appointment", "calendar",
  "booking-form", "bookings", "reserve now",
];

const ORDERING_KEYWORDS = [
  "order online", "online ordering", "add to cart", "shopping cart",
  "checkout", "buy now", "order now", "foodpanda", "grabfood",
  "shopee", "lazada", "add-to-cart",
];

const CONTACT_FORM_KEYWORDS = [
  "contact form", "contact-form", "wpforms", "gravityforms",
  "typeform", "jotform", "google.com/forms", "formspree", "<form",
  "get in touch", "send us a message",
];

function matchesAny(html: string, keywords: string[]): boolean {
  return keywords.some((k) => contains(html, k));
}

export const detectBooking = (html: string) => matchesAny(html, BOOKING_KEYWORDS);
export const detectOrdering = (html: string) => matchesAny(html, ORDERING_KEYWORDS);
export const detectContactForm = (html: string) => matchesAny(html, CONTACT_FORM_KEYWORDS);
