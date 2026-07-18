/**
 * Pure recommendation logic for the Ashwagandha PDP advisor.
 *
 * No I/O, no framework imports, no randomness — same input always yields the
 * same output, which is what makes it testable and what makes the API cacheable.
 * The API route and the optional Claude copy layer both sit on top of this.
 *
 * Scoring is deliberately transparent and additive rather than a lookup table:
 * every pack is scored on four weighted signals and the winning reason is
 * derived from whichever signal contributed most. A merchant or reviewer can
 * read the weights and predict the output.
 */

import {
  FULL_COURSE_DAYS,
  FORMAT_LABELS,
  GOAL_LABELS,
  PACKS,
  type Caution,
  type Experience,
  type Format,
  type Goal,
  type Pack,
  type Timing,
  daysOfSupply,
  pricePerDay,
} from "./catalog";

export type RecommendationInput = {
  goals: Goal[];
  experience: Experience;
  format?: Format;
  timing?: Timing;
  cautions?: Caution[];
};

export type PackPick = {
  id: string;
  label: string;
  count: number;
  price: number;
  days: number;
  pricePerDay: number;
  variantSku: string;
  reason: string;
  score: number;
};

export type FormatPick = {
  id: Format;
  label: string;
  reason: string;
  /** True when the shopper chose this themselves rather than the engine inferring it. */
  chosenByShopper: boolean;
};

export type RoutineStep = {
  label: string;
  detail: string;
};

export type Confidence = {
  score: number;
  label: "Exploratory" | "Balanced" | "Strong";
};

export type Recommendation = {
  focusGoals: Goal[];
  pack: PackPick;
  alternatePack: PackPick | null;
  format: FormatPick;
  routine: RoutineStep[];
  headline: string;
  summary: string;
  guidance: string;
  cautionNotes: string[];
  /** True when an answer means we should tell them to talk to a practitioner first. */
  consultRequired: boolean;
  confidence: Confidence;
};

/**
 * Which goal most shapes the routine, used to break ties when a shopper picks
 * several. Sleep and stress drive timing hardest, so they rank first.
 */
const GOAL_PRIORITY: readonly Goal[] = ["sleep", "stress", "energy", "focus", "immunity"] as const;

/** Goals that pull the dose toward a particular time of day. */
const GOAL_TIMING: Record<Goal, Timing> = {
  sleep: "evening",
  stress: "evening",
  energy: "morning",
  focus: "morning",
  immunity: "morning",
};

/**
 * Weights sum to 1, so a pack score is always 0..1 and comparable across
 * shoppers. Commitment leads because "how much am I ready to buy" separates
 * shoppers more than price does at this price point.
 */
const WEIGHTS = {
  commitment: 0.4,
  course: 0.2,
  value: 0.2,
  caution: 0.2,
} as const;

/** How well a pack size matches how far along the shopper already is. */
const COMMITMENT_FIT: Record<Experience, Record<string, number>> = {
  new: { starter: 1.0, everyday: 0.7, value: 0.35 },
  occasional: { starter: 0.6, everyday: 1.0, value: 0.75 },
  experienced: { starter: 0.3, everyday: 0.8, value: 1.0 },
};

/** With a caution flagged, a smaller first commitment is the kinder default. */
const CAUTION_FIT: Record<string, number> = { starter: 1.0, everyday: 0.6, value: 0.3 };
const CAUTION_NEUTRAL = 0.5;

const CAUTION_NOTES: Record<Caution, string> = {
  pregnant_or_nursing:
    "Ayurvedic tradition and most manufacturers advise against ashwagandha during pregnancy or while nursing. Please speak with a qualified practitioner before starting.",
  taking_medication:
    "Ashwagandha can interact with some medicines, including thyroid, sedative and immunosuppressant medication. Check with your doctor before adding it to your routine.",
  thyroid_condition:
    "Ashwagandha may affect thyroid hormone levels. If you manage a thyroid condition, please review this with your doctor first.",
};

/** Cautions serious enough that we lead with "talk to someone" rather than a pack. */
const CONSULT_CAUTIONS: readonly Caution[] = ["pregnant_or_nursing", "thyroid_condition"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Days of supply relative to a full 8-week course, capped at 1. */
function courseFit(pack: Pack): number {
  return clamp(daysOfSupply(pack) / FULL_COURSE_DAYS, 0, 1);
}

/**
 * Cheapest-per-day pack scores 1, priciest scores 0. Computed from the catalog
 * rather than hardcoded so re-pricing a pack can't silently invert the ranking.
 */
function valueFit(pack: Pack): number {
  const rates = PACKS.map(pricePerDay);
  const best = Math.min(...rates);
  const worst = Math.max(...rates);
  if (worst === best) return 1;
  return (worst - pricePerDay(pack)) / (worst - best);
}

type ScoredPack = { pack: Pack; score: number; reason: string };

/**
 * Score every pack and explain the winner. Exported so tests (and a curious
 * reviewer) can inspect the full ranking, not just the top pick.
 */
export function scorePacks(input: RecommendationInput): ScoredPack[] {
  const hasCaution = (input.cautions ?? []).length > 0;

  return PACKS.map((pack) => {
    const parts = {
      commitment: WEIGHTS.commitment * COMMITMENT_FIT[input.experience][pack.id],
      course: WEIGHTS.course * courseFit(pack),
      value: WEIGHTS.value * valueFit(pack),
      caution: WEIGHTS.caution * (hasCaution ? CAUTION_FIT[pack.id] : CAUTION_NEUTRAL),
    };

    const score = parts.commitment + parts.course + parts.value + parts.caution;

    return { pack, score, reason: explainPack(pack, parts, input) };
  }).sort((a, b) => b.score - a.score);
}

/** Turn the dominant scoring signal into a sentence a shopper would accept. */
function explainPack(
  pack: Pack,
  parts: Record<keyof typeof WEIGHTS, number>,
  input: RecommendationInput,
): string {
  const days = daysOfSupply(pack);
  const dominant = (Object.keys(parts) as (keyof typeof WEIGHTS)[]).reduce((a, b) =>
    parts[a] >= parts[b] ? a : b,
  );

  switch (dominant) {
    case "commitment":
      if (input.experience === "new") {
        return `${days} days is enough to see how ashwagandha settles into your routine without committing to a large pack.`;
      }
      if (input.experience === "experienced") {
        return `You already know how you respond, so the ${days}-day pack keeps you going at the lowest cost per day.`;
      }
      return `${days} days suits someone who has used ashwagandha before and wants to be more consistent this time.`;
    case "course":
      return `${days} days covers a full ${FULL_COURSE_DAYS}-day course, which is how ashwagandha is traditionally taken.`;
    case "value":
      return `At about ₹${pricePerDay(pack).toFixed(0)} a day this is the best value in the range.`;
    case "caution":
      return `A ${days}-day pack is a smaller first step while you check in with a practitioner.`;
  }
}

/** Goals ordered by how much they shape the routine; at most two are "focus" goals. */
export function focusGoals(goals: Goal[]): Goal[] {
  return [...goals]
    .sort((a, b) => GOAL_PRIORITY.indexOf(a) - GOAL_PRIORITY.indexOf(b))
    .slice(0, 2);
}

export function pickFormat(input: RecommendationInput): FormatPick {
  if (input.format) {
    return {
      id: input.format,
      label: FORMAT_LABELS[input.format],
      reason: FORMAT_REASONS[input.format],
      chosenByShopper: true,
    };
  }

  const primary = focusGoals(input.goals)[0];
  const wantsEvening = input.timing === "evening" || (input.timing !== "morning" && primary === "sleep");

  // Churna with warm milk at night is the classic preparation, so infer it only
  // when the shopper is actually oriented toward an evening ritual.
  if (primary === "sleep" && wantsEvening) {
    return { id: "powder", label: FORMAT_LABELS.powder, reason: FORMAT_REASONS.powder, chosenByShopper: false };
  }
  if (primary === "energy" || primary === "focus") {
    return { id: "capsule", label: FORMAT_LABELS.capsule, reason: FORMAT_REASONS.capsule, chosenByShopper: false };
  }
  return { id: "tablet", label: FORMAT_LABELS.tablet, reason: FORMAT_REASONS.tablet, chosenByShopper: false };
}

const FORMAT_REASONS: Record<Format, string> = {
  capsule: "Capsules are the easiest to keep up with — no taste, no measuring, and they travel well.",
  tablet: "Tablets are a straightforward daily option with a fixed dose and no preparation.",
  powder: "Churna is the traditional preparation, stirred into warm milk — slower, but it makes the dose feel like a ritual.",
};

/** The time of day the dose should anchor to, derived from goals when not stated. */
export function resolveTiming(input: RecommendationInput): Exclude<Timing, "flexible"> {
  if (input.timing === "morning" || input.timing === "evening") return input.timing;
  const primary = focusGoals(input.goals)[0];
  return GOAL_TIMING[primary] === "evening" ? "evening" : "morning";
}

export function buildRoutine(input: RecommendationInput, format: FormatPick): RoutineStep[] {
  const time = resolveTiming(input);
  const goals = focusGoals(input.goals);
  const steps: RoutineStep[] = [];

  const carrier =
    format.id === "powder"
      ? time === "evening"
        ? "stirred into warm milk"
        : "stirred into warm water or milk"
      : "with a glass of water";

  steps.push({
    label: time === "evening" ? "Evening" : "Morning",
    detail:
      format.id === "powder"
        ? `Take roughly half a teaspoon ${carrier}, ${time === "evening" ? "about an hour before bed" : "after breakfast"}.`
        : `Take one ${format.id} ${carrier}, ${time === "evening" ? "about an hour before bed" : "after breakfast"}.`,
  });

  steps.push({
    label: "With food",
    detail:
      "Ashwagandha sits better on a full stomach than an empty one, so keep it close to a meal rather than first thing.",
  });

  const ritual = goals.map((goal) => GOAL_RITUAL[goal]).find(Boolean);
  if (ritual) steps.push(ritual);

  steps.push({
    label: "Give it time",
    detail: `Ashwagandha is traditionally taken as a rasayana over a full ${FULL_COURSE_DAYS}-day course rather than as a quick fix. Daily consistency matters more than the size of the dose.`,
  });

  return steps;
}

/** One goal-specific habit to pair the dose with, so the routine feels like a ritual. */
const GOAL_RITUAL: Record<Goal, RoutineStep> = {
  sleep: {
    label: "Pair it with a wind-down",
    detail: "Take it as you start winding down — screens away, lights lower — so the dose marks the end of the day.",
  },
  stress: {
    label: "Pair it with a pause",
    detail: "Anchor it to a few slow breaths or a short walk, so the habit is tied to a moment you already take.",
  },
  energy: {
    label: "Pair it with movement",
    detail: "Take it alongside your morning routine — a walk, a stretch, whatever you already do — to keep it consistent.",
  },
  focus: {
    label: "Pair it with your first task",
    detail: "Take it before you sit down to work, so it lands at the start of your day rather than in the middle of it.",
  },
  immunity: {
    label: "Keep the basics alongside it",
    detail: "Ashwagandha works best as one part of a routine — sleep, food and movement still do most of the work.",
  },
};

export function buildCautionNotes(cautions: Caution[]): string[] {
  return cautions.map((caution) => CAUTION_NOTES[caution]);
}

export function computeConfidence(input: RecommendationInput, consultRequired: boolean): Confidence {
  let score = 0.5;

  // A focused shopper is easier to advise than one who selected everything.
  if (input.goals.length <= 2) score += 0.2;
  else if (input.goals.length >= 4) score -= 0.1;

  if (input.format) score += 0.15;
  if (input.timing && input.timing !== "flexible") score += 0.1;
  if (consultRequired) score -= 0.15;

  score = clamp(score, 0.2, 0.95);

  const label: Confidence["label"] = score < 0.5 ? "Exploratory" : score < 0.75 ? "Balanced" : "Strong";
  return { score: Number(score.toFixed(2)), label };
}

function toPackPick(scored: ScoredPack): PackPick {
  const { pack, score, reason } = scored;
  return {
    id: pack.id,
    label: pack.label,
    count: pack.count,
    price: pack.price,
    days: daysOfSupply(pack),
    pricePerDay: Number(pricePerDay(pack).toFixed(2)),
    variantSku: pack.variantSku,
    reason,
    score: Number(score.toFixed(3)),
  };
}

function buildHeadline(goals: Goal[]): string {
  const [primary, secondary] = goals;
  if (secondary) {
    return `Built around ${GOAL_LABELS[primary].toLowerCase()} and ${GOAL_LABELS[secondary].toLowerCase()}`;
  }
  return `Built around ${GOAL_LABELS[primary].toLowerCase()}`;
}

function buildSummary(input: RecommendationInput, pack: PackPick, format: FormatPick, time: string): string {
  const goal = GOAL_LABELS[focusGoals(input.goals)[0]].toLowerCase();
  return `Based on what you told us, we'd start you on the ${pack.label} pack of ${format.label.toLowerCase()} — ${pack.days} days of supply — taken in the ${time}. It's a routine shaped around ${goal}, and it's built to be repeatable rather than intense.`;
}

/**
 * The deterministic counterpart to the optional Claude copy. Kept deliberately
 * plain: it ships whenever there's no API key, the call times out, or the
 * generated copy fails the claims check.
 */
function buildGuidance(format: FormatPick, time: string): string {
  const anchor =
    time === "evening"
      ? "Anchor it to something you already do in the evening — after dinner, or as you start winding down"
      : "Anchor it to something you already do in the morning — with breakfast, or alongside your first coffee";
  const prep =
    format.id === "powder"
      ? "The churna needs a minute to stir into warm milk, so it helps to make that minute part of the ritual rather than a chore."
      : "There's nothing to prepare, so the only thing that'll trip you up is forgetting.";
  return `${anchor} — the habit sticks better than the reminder does. ${prep} Ashwagandha is traditionally taken over a full course, so judge it after a few weeks rather than a few days.`;
}

/**
 * The deterministic recommendation. `enhanceWithClaude` may later rewrite the
 * prose fields, but never the pack, format, routine or cautions — those stay
 * owned by this engine so the advice can't drift.
 */
export function recommend(input: RecommendationInput): Recommendation {
  const cautions = input.cautions ?? [];
  const consultRequired = cautions.some((c) => CONSULT_CAUTIONS.includes(c));

  const ranked = scorePacks(input);

  // A flagged caution overrides the ranking: the smallest pack is the honest
  // recommendation while the shopper checks in with a practitioner.
  const winner = consultRequired
    ? (ranked.find((s) => s.pack.id === "starter") ?? ranked[0])
    : ranked[0];
  const runnerUp = ranked.find((s) => s.pack.id !== winner.pack.id) ?? null;

  const pack = toPackPick(winner);
  if (consultRequired) {
    pack.reason = `We've kept this to the smallest pack — ${pack.days} days — so you can check in with a practitioner before committing to more.`;
  }

  const format = pickFormat(input);
  const routine = buildRoutine(input, format);
  const time = resolveTiming(input);
  const goals = focusGoals(input.goals);

  return {
    focusGoals: goals,
    pack,
    alternatePack: runnerUp ? toPackPick(runnerUp) : null,
    format,
    routine,
    headline: buildHeadline(goals),
    summary: buildSummary(input, pack, format, time),
    guidance: buildGuidance(format, time),
    cautionNotes: buildCautionNotes(cautions),
    consultRequired,
    confidence: computeConfidence(input, consultRequired),
  };
}
