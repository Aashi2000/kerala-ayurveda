/**
 * Request validation for the advisor API.
 *
 * Hand-rolled rather than pulled from a schema library: the payload is five
 * fields, and the assignment asks us to keep the dependency footprint honest.
 * The shapes are narrow enough that the type predicates below are the whole job.
 */

import {
  CAUTIONS,
  EXPERIENCE_LEVELS,
  FORMATS,
  GOALS,
  TIMINGS,
  type Caution,
  type Experience,
  type Format,
  type Goal,
  type Timing,
} from "./catalog";
import type { RecommendationInput } from "./recommendation-engine";

export type FieldError = { field: string; message: string };

export type ValidationResult =
  | { ok: true; value: RecommendationInput }
  | { ok: false; errors: FieldError[] };

/** Guard against a caller posting a 10k-item goals array. */
const MAX_GOALS = GOALS.length;
const MAX_CAUTIONS = CAUTIONS.length;

function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function uniqueSubset<T extends string>(
  allowed: readonly T[],
  raw: unknown,
  field: string,
  max: number,
  errors: FieldError[],
): T[] | null {
  if (!Array.isArray(raw)) {
    errors.push({ field, message: `${field} must be an array.` });
    return null;
  }
  if (raw.length > max) {
    errors.push({ field, message: `${field} accepts at most ${max} values.` });
    return null;
  }

  const invalid = raw.filter((item) => !isOneOf(allowed, item));
  if (invalid.length) {
    errors.push({
      field,
      message: `${field} contains unsupported values. Allowed: ${allowed.join(", ")}.`,
    });
    return null;
  }

  return Array.from(new Set(raw as T[]));
}

/**
 * Parse an unknown request body into a `RecommendationInput`, collecting every
 * problem rather than throwing on the first so the client can highlight all the
 * offending fields at once.
 */
export function validateRecommendationInput(body: unknown): ValidationResult {
  const errors: FieldError[] = [];

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ field: "body", message: "Request body must be a JSON object." }] };
  }

  const raw = body as Record<string, unknown>;

  const goals = uniqueSubset<Goal>(GOALS, raw.goals, "goals", MAX_GOALS, errors);
  if (goals && goals.length === 0) {
    errors.push({ field: "goals", message: "Choose at least one goal so we have something to work with." });
  }

  if (!isOneOf(EXPERIENCE_LEVELS, raw.experience)) {
    errors.push({
      field: "experience",
      message: `experience is required. Allowed: ${EXPERIENCE_LEVELS.join(", ")}.`,
    });
  }

  // format and timing are genuinely optional — the engine infers them from goals.
  if (raw.format !== undefined && raw.format !== null && !isOneOf(FORMATS, raw.format)) {
    errors.push({ field: "format", message: `format must be one of: ${FORMATS.join(", ")}.` });
  }

  if (raw.timing !== undefined && raw.timing !== null && !isOneOf(TIMINGS, raw.timing)) {
    errors.push({ field: "timing", message: `timing must be one of: ${TIMINGS.join(", ")}.` });
  }

  let cautions: Caution[] = [];
  if (raw.cautions !== undefined && raw.cautions !== null) {
    const parsed = uniqueSubset<Caution>(CAUTIONS, raw.cautions, "cautions", MAX_CAUTIONS, errors);
    if (parsed) cautions = parsed;
  }

  if (errors.length || !goals) return { ok: false, errors };

  return {
    ok: true,
    value: {
      goals,
      experience: raw.experience as Experience,
      format: (raw.format as Format | undefined) ?? undefined,
      timing: (raw.timing as Timing | undefined) ?? undefined,
      cautions,
    },
  };
}
