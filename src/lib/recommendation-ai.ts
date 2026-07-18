/**
 * Optional Claude copy layer.
 *
 * The engine already produces a complete, shippable recommendation. This module
 * only rewrites two prose fields (`summary`, `guidance`) to sound less like a
 * template. It never touches the pack, format, routine or cautions — those stay
 * owned by `recommendation-engine.ts` so the advice itself can't drift.
 *
 * It is designed to be skippable: no API key, a timeout, a bad response, or copy
 * that fails the claims check all fall back to the deterministic text. The PDP
 * must never fail because the LLM did.
 *
 * The key is read from the server environment and never reaches the storefront —
 * the browser only ever talks to our own API route.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GOAL_LABELS } from "./catalog";
import type { Recommendation, RecommendationInput } from "./recommendation-engine";

/** Shopper is waiting on this, so give up quickly rather than hang the panel. */
const TIMEOUT_MS = 8_000;

const MODEL = "claude-opus-4-8";

export type AiCopy = { summary: string; guidance: string };

/**
 * Phrases that would turn wellness copy into a medical claim. The assignment
 * explicitly forbids invented disease-treatment claims, guaranteed outcomes and
 * fake evidence, so we check the model's output rather than trusting the prompt.
 */
const BANNED_PATTERNS: RegExp[] = [
  /\b(cure|cures|curing)\b/i,
  /\b(treat|treats|treating|treatment for)\b/i,
  /\b(prevent|prevents|preventing)\b/i,
  /\b(diagnos\w*)\b/i,
  /\b(heal|heals|healing)\b/i,
  /\b(clinically|scientifically)\s+proven\b/i,
  /\bguarantee\w*\b/i,
  /\bproven to\b/i,
  /\b(disease|illness|disorder|condition)\b/i,
  /\b(doctor|medically)\s+recommended\b/i,
];

const SYSTEM_PROMPT = `You write short product copy for Kerala Ayurveda, an Ayurvedic wellness brand, on an Ashwagandha product page.

You will be given a recommendation that has already been decided by a rules engine. Your only job is to re-voice two fields so they read naturally. Do not change the advice.

Rules, in order of importance:
1. Never make a health claim. Do not say the product treats, cures, prevents, heals or is proven to do anything. Do not mention diseases, conditions, or clinical evidence. Do not promise an outcome or a timeframe for results.
2. Stay at the level of traditional use and daily routine. "Traditionally taken as", "a routine built around", "many people take it for" are fine. "Reduces your stress" is not.
3. Never contradict the recommendation you are given. Keep the same pack, format, timing and reasoning.
4. This is not medical advice and must not read like it. No diagnosis, no dosing beyond what you are given.
5. Warm, plain, specific. No hype, no exclamation marks, no emoji. British-neutral English.

summary: 2 sentences, max 45 words. Tell the shopper what you'd start them on and why, in their own terms.
guidance: 2 sentences, max 45 words. One practical note about fitting it into their day, and one honest expectation-setting note about consistency.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    guidance: { type: "string" },
  },
  required: ["summary", "guidance"],
  additionalProperties: false,
} as const;

/** True when the copy is clean; false when it drifted into claim territory. */
export function passesClaimsCheck(text: string): boolean {
  return !BANNED_PATTERNS.some((pattern) => pattern.test(text));
}

function buildUserPrompt(input: RecommendationInput, rec: Recommendation): string {
  const goals = input.goals.map((g) => GOAL_LABELS[g]).join(", ");
  const routine = rec.routine.map((step) => `- ${step.label}: ${step.detail}`).join("\n");

  return `The shopper told us:
- Goals: ${goals}
- Experience with ashwagandha: ${input.experience}
- Format preference: ${input.format ?? "no preference"}
- Preferred time of day: ${input.timing ?? "no preference"}

The engine decided:
- Pack: ${rec.pack.label} — ${rec.pack.count} units, ${rec.pack.days} days of supply, ₹${rec.pack.price}
- Why that pack: ${rec.pack.reason}
- Format: ${rec.format.label} — ${rec.format.reason}
- Routine:
${routine}
${rec.consultRequired ? "- NOTE: this shopper flagged a caution and is being told to speak to a practitioner. Do not undercut that. Do not reassure them." : ""}

Rewrite the summary and guidance for this shopper.`;
}

/**
 * Returns re-voiced copy, or `null` to mean "use the deterministic text".
 * Never throws — every failure path is a fallback, not an error.
 */
export async function enhanceCopy(
  input: RecommendationInput,
  rec: Recommendation,
): Promise<AiCopy | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      // A short, well-specified rewrite: thinking would only add latency while a
      // shopper watches a spinner. The JSON schema keeps the output clean.
      thinking: { type: "disabled" },
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input, rec) }],
    });

    const text = response.content.find((block) => block.type === "text")?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as Partial<AiCopy>;
    if (typeof parsed.summary !== "string" || typeof parsed.guidance !== "string") return null;

    const summary = parsed.summary.trim();
    const guidance = parsed.guidance.trim();
    if (!summary || !guidance) return null;

    // Verify rather than trust: if the model drifted into a health claim, throw
    // the whole response away and ship the deterministic copy instead.
    if (!passesClaimsCheck(summary) || !passesClaimsCheck(guidance)) {
      console.warn("[recommendation-ai] copy failed claims check, using fallback");
      return null;
    }

    return { summary, guidance };
  } catch (error) {
    // Timeout, rate limit, malformed JSON, network — all mean the same thing here.
    console.warn("[recommendation-ai] falling back to deterministic copy:", error);
    return null;
  }
}
