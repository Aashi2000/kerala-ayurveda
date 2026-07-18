/**
 * Product catalog for the Ashwagandha PDP advisor.
 *
 * ILLUSTRATIVE DATA. Pack sizes, prices and per-day maths below are assumptions
 * made for this assignment, not scraped from Kerala Ayurveda's live store. In a
 * production install the merchant's real variants are the source of truth: the
 * Liquid section passes `product.variants` into the advisor and the engine maps
 * its pack recommendation onto a real variant id (see `resolveVariantId`).
 *
 * Nothing here describes a therapeutic outcome. Copy stays at the level of
 * traditional use and routine, never diagnosis or treatment.
 */

export type Goal = "stress" | "sleep" | "energy" | "focus" | "immunity";
export type Experience = "new" | "occasional" | "experienced";
export type Format = "capsule" | "tablet" | "powder";
export type Timing = "morning" | "evening" | "flexible";
export type Caution =
  | "pregnant_or_nursing"
  | "taking_medication"
  | "thyroid_condition";

export const GOALS: readonly Goal[] = [
  "stress",
  "sleep",
  "energy",
  "focus",
  "immunity",
] as const;

export const EXPERIENCE_LEVELS: readonly Experience[] = [
  "new",
  "occasional",
  "experienced",
] as const;

export const FORMATS: readonly Format[] = ["capsule", "tablet", "powder"] as const;

export const TIMINGS: readonly Timing[] = ["morning", "evening", "flexible"] as const;

export const CAUTIONS: readonly Caution[] = [
  "pregnant_or_nursing",
  "taking_medication",
  "thyroid_condition",
] as const;

export const GOAL_LABELS: Record<Goal, string> = {
  stress: "Everyday stress",
  sleep: "Restful sleep",
  energy: "Steady energy",
  focus: "Focus and clarity",
  immunity: "Everyday immunity",
};

/** One unit (capsule/tablet/scoop) per day is the assumed baseline dose. */
export const UNITS_PER_DAY = 1;

export type Pack = {
  id: string;
  label: string;
  /** Units in the pack. With UNITS_PER_DAY = 1 this equals days of supply. */
  count: number;
  /** Illustrative price in INR. */
  price: number;
  /** Maps to a Shopify variant when the merchant wires one up. */
  variantSku: string;
};

export const PACKS: readonly Pack[] = [
  { id: "starter", label: "Starter", count: 30, price: 399, variantSku: "KA-ASH-30" },
  { id: "everyday", label: "Everyday", count: 60, price: 699, variantSku: "KA-ASH-60" },
  { id: "value", label: "Value", count: 90, price: 949, variantSku: "KA-ASH-90" },
] as const;

export const FORMAT_LABELS: Record<Format, string> = {
  capsule: "Veg capsules",
  tablet: "Tablets",
  powder: "Churna (powder)",
};

export function daysOfSupply(pack: Pack): number {
  return Math.round(pack.count / UNITS_PER_DAY);
}

export function pricePerDay(pack: Pack): number {
  return pack.price / daysOfSupply(pack);
}

export function getPack(id: string): Pack | undefined {
  return PACKS.find((pack) => pack.id === id);
}

/**
 * Ayurveda traditionally treats ashwagandha as a rasayana taken as a course
 * rather than a one-off. 8 weeks is the commonly cited minimum for a full
 * course, which is why the engine nudges toward >= 60 units for most goals.
 */
export const FULL_COURSE_DAYS = 56;
