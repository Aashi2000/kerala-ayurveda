import { describe, expect, it } from "vitest";
import { validateRecommendationInput } from "./validation";

const valid = { goals: ["stress"], experience: "occasional" };

describe("validateRecommendationInput", () => {
  it("accepts a minimal valid payload and defaults the optional fields", () => {
    const result = validateRecommendationInput(valid);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.goals).toEqual(["stress"]);
    expect(result.value.format).toBeUndefined();
    expect(result.value.timing).toBeUndefined();
    expect(result.value.cautions).toEqual([]);
  });

  it("de-duplicates repeated goals", () => {
    const result = validateRecommendationInput({ ...valid, goals: ["stress", "stress", "sleep"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.goals).toEqual(["stress", "sleep"]);
  });

  it.each([
    ["a non-object body", "nope"],
    ["an array body", []],
    ["null", null],
  ])("rejects %s", (_label, body) => {
    const result = validateRecommendationInput(body);
    expect(result.ok).toBe(false);
  });

  it("requires at least one goal", () => {
    const result = validateRecommendationInput({ ...valid, goals: [] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].field).toBe("goals");
  });

  it("rejects an unknown goal", () => {
    const result = validateRecommendationInput({ ...valid, goals: ["telepathy"] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].field).toBe("goals");
  });

  it("rejects a missing experience level", () => {
    const result = validateRecommendationInput({ goals: ["stress"] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.field === "experience")).toBe(true);
  });

  it("collects every problem rather than stopping at the first", () => {
    const result = validateRecommendationInput({ goals: [], experience: "wizard", format: "smoke" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field).sort()).toEqual(["experience", "format", "goals"]);
  });

  it("rejects an oversized goals array", () => {
    const result = validateRecommendationInput({ ...valid, goals: new Array(50).fill("stress") });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/at most/i);
  });

  it("treats explicit null optionals as absent", () => {
    const result = validateRecommendationInput({ ...valid, format: null, timing: null, cautions: null });
    expect(result.ok).toBe(true);
  });
});
