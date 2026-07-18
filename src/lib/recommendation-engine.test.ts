import { describe, expect, it } from "vitest";
import { PACKS, pricePerDay } from "./catalog";
import {
  buildRoutine,
  computeConfidence,
  focusGoals,
  pickFormat,
  recommend,
  resolveTiming,
  scorePacks,
  type RecommendationInput,
} from "./recommendation-engine";

/** A valid baseline; each test overrides only the field it's about. */
function input(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return { goals: ["stress"], experience: "occasional", ...overrides };
}

describe("scorePacks", () => {
  it("ranks every pack and returns them best-first", () => {
    const ranked = scorePacks(input());

    expect(ranked).toHaveLength(PACKS.length);
    const scores = ranked.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("keeps scores within the 0..1 range the weights imply", () => {
    for (const scored of scorePacks(input({ experience: "experienced" }))) {
      expect(scored.score).toBeGreaterThanOrEqual(0);
      expect(scored.score).toBeLessThanOrEqual(1);
    }
  });

  it("moves the ranking when only experience changes", () => {
    // The engine must actually respond to input rather than returning a fixed answer.
    const newcomer = scorePacks(input({ experience: "new" }));
    const veteran = scorePacks(input({ experience: "experienced" }));

    expect(veteran[0].pack.id).toBe("value");
    expect(newcomer.find((s) => s.pack.id === "starter")!.score).toBeGreaterThan(
      veteran.find((s) => s.pack.id === "starter")!.score,
    );
  });

  it("scores the cheapest-per-day pack best on value", () => {
    const cheapest = [...PACKS].sort((a, b) => pricePerDay(a) - pricePerDay(b))[0];
    expect(cheapest.id).toBe("value");
  });
});

describe("recommend", () => {
  it("recommends a full-course pack to a newcomer rather than the smallest one", () => {
    // 30 days doesn't cover the 56-day course, so Starter loses despite the
    // newcomer's commitment preference. This is the main non-obvious behaviour.
    const result = recommend(input({ experience: "new" }));

    expect(result.pack.id).toBe("everyday");
    expect(result.pack.days).toBeGreaterThanOrEqual(56);
  });

  it("recommends the best-value pack to an experienced buyer", () => {
    const result = recommend(input({ experience: "experienced" }));
    expect(result.pack.id).toBe("value");
  });

  it("always offers a different alternate pack", () => {
    const result = recommend(input());
    expect(result.alternatePack).not.toBeNull();
    expect(result.alternatePack!.id).not.toBe(result.pack.id);
  });

  it("is deterministic — same input, same output", () => {
    const args = input({ goals: ["sleep", "stress"], format: "powder", timing: "evening" });
    expect(recommend(args)).toEqual(recommend(args));
  });

  it("keeps the engine's own prose free of health claims", () => {
    const result = recommend(input({ goals: ["sleep", "energy"] }));
    const prose = [result.summary, result.guidance, result.headline].join(" ");
    expect(prose).not.toMatch(/\b(cure|treats?|prevents?|clinically proven|guarantee)\b/i);
  });
});

describe("cautions", () => {
  it("forces the smallest pack and flags a consult when pregnancy is declared", () => {
    // Safety rule overrides the scoring: an experienced buyer would otherwise
    // be sold the largest pack.
    const result = recommend(input({ experience: "experienced", cautions: ["pregnant_or_nursing"] }));

    expect(result.consultRequired).toBe(true);
    expect(result.pack.id).toBe("starter");
    expect(result.pack.reason).toMatch(/practitioner/i);
    expect(result.cautionNotes[0]).toMatch(/pregnancy|nursing/i);
  });

  it("surfaces a note for medication without demanding a consult", () => {
    const result = recommend(input({ cautions: ["taking_medication"] }));

    expect(result.consultRequired).toBe(false);
    expect(result.cautionNotes).toHaveLength(1);
    expect(result.cautionNotes[0]).toMatch(/doctor/i);
  });

  it("reports no notes when nothing is flagged", () => {
    expect(recommend(input()).cautionNotes).toEqual([]);
  });
});

describe("pickFormat", () => {
  it("honours an explicit format choice", () => {
    const format = pickFormat(input({ format: "tablet", goals: ["sleep"], timing: "evening" }));
    expect(format.id).toBe("tablet");
    expect(format.chosenByShopper).toBe(true);
  });

  it("infers churna for an evening sleep routine", () => {
    const format = pickFormat(input({ goals: ["sleep"], timing: "evening" }));
    expect(format.id).toBe("powder");
    expect(format.chosenByShopper).toBe(false);
  });

  it("infers capsules for a morning energy routine", () => {
    expect(pickFormat(input({ goals: ["energy"], timing: "morning" })).id).toBe("capsule");
  });

  it("does not infer churna when sleep is paired with a morning preference", () => {
    expect(pickFormat(input({ goals: ["sleep"], timing: "morning" })).id).not.toBe("powder");
  });
});

describe("resolveTiming", () => {
  it("respects an explicit preference", () => {
    expect(resolveTiming(input({ goals: ["sleep"], timing: "morning" }))).toBe("morning");
  });

  it("derives evening from a sleep goal when unstated", () => {
    expect(resolveTiming(input({ goals: ["sleep"] }))).toBe("evening");
  });

  it("derives morning from an energy goal when unstated", () => {
    expect(resolveTiming(input({ goals: ["energy"] }))).toBe("morning");
  });

  it("lets the higher-priority goal win when goals disagree", () => {
    expect(resolveTiming(input({ goals: ["energy", "sleep"] }))).toBe("evening");
  });
});

describe("focusGoals", () => {
  it("caps at two goals and orders them by routine impact", () => {
    expect(focusGoals(["immunity", "energy", "sleep"])).toEqual(["sleep", "energy"]);
  });
});

describe("buildRoutine", () => {
  it("tells a powder user to stir it into warm milk at night", () => {
    const args = input({ goals: ["sleep"], timing: "evening", format: "powder" });
    const steps = buildRoutine(args, pickFormat(args));

    expect(steps[0].label).toBe("Evening");
    expect(steps[0].detail).toMatch(/warm milk/i);
    expect(steps.at(-1)!.detail).toMatch(/56-day course/);
  });

  it("gives a capsule user a morning step with no preparation", () => {
    const args = input({ goals: ["energy"], timing: "morning", format: "capsule" });
    const steps = buildRoutine(args, pickFormat(args));

    expect(steps[0].label).toBe("Morning");
    expect(steps[0].detail).toMatch(/glass of water/i);
  });
});

describe("computeConfidence", () => {
  it("is strongest when the shopper is focused and specific", () => {
    const confident = computeConfidence(
      input({ goals: ["sleep"], format: "powder", timing: "evening" }),
      false,
    );
    expect(confident.label).toBe("Strong");
  });

  it("drops when the shopper selects everything and specifies nothing", () => {
    const vague = computeConfidence(
      input({ goals: ["stress", "sleep", "energy", "focus", "immunity"] }),
      false,
    );
    expect(vague.score).toBeLessThan(0.5);
    expect(vague.label).toBe("Exploratory");
  });

  it("is reduced by a consult flag", () => {
    const args = input({ goals: ["sleep"], format: "powder", timing: "evening" });
    expect(computeConfidence(args, true).score).toBeLessThan(computeConfidence(args, false).score);
  });

  it("stays inside its clamped bounds", () => {
    const score = computeConfidence(input({ goals: ["stress", "sleep", "energy", "focus"] }), true).score;
    expect(score).toBeGreaterThanOrEqual(0.2);
    expect(score).toBeLessThanOrEqual(0.95);
  });
});
