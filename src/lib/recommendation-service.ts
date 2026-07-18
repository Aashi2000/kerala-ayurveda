/**
 * Orchestrates a recommendation request: validate → score → (optionally) re-voice.
 *
 * Kept separate from the API route so the route stays a thin HTTP adapter and
 * this stays testable without spinning up Next.
 */

import { enhanceCopy } from "./recommendation-ai";
import { recommend, type Recommendation, type RecommendationInput } from "./recommendation-engine";
import { validateRecommendationInput, type FieldError } from "./validation";

export type CopySource = "engine" | "claude";

export type RecommendationResponse = {
  recommendation: Recommendation;
  meta: {
    /** Whether the prose was re-voiced by Claude or came from the templates. */
    copySource: CopySource;
    generatedAt: string;
  };
};

export type ServiceResult =
  | { ok: true; data: RecommendationResponse }
  | { ok: false; errors: FieldError[] };

/**
 * `enhanceCopy` already swallows its own failures, so the only thing left to
 * decide here is whether we got copy back and therefore which source to report.
 */
export async function buildRecommendation(body: unknown): Promise<ServiceResult> {
  const validation = validateRecommendationInput(body);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const input: RecommendationInput = validation.value;
  const recommendation = recommend(input);

  const copy = await enhanceCopy(input, recommendation);
  if (copy) {
    recommendation.summary = copy.summary;
    recommendation.guidance = copy.guidance;
  }

  return {
    ok: true,
    data: {
      recommendation,
      meta: {
        copySource: copy ? "claude" : "engine",
        generatedAt: new Date().toISOString(),
      },
    },
  };
}
