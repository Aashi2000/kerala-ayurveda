"use client";

/**
 * A visual front end for the recommendation API.
 *
 * The customer-facing production experience is the Shopify Liquid section
 * (`shopify/sections/ayurveda-product-guide.liquid`), which runs on a real
 * product page with real variants and the native cart. This page posts the
 * exact same payload to `POST /api/recommendation` so the scoring engine can be
 * exercised and demoed on its own — dressed up here as a proper advisor flow,
 * with a raw-JSON toggle kept for inspection.
 */

import { useState } from "react";
import {
  CAUTIONS,
  EXPERIENCE_LEVELS,
  GOALS,
  GOAL_LABELS,
  TIMINGS,
  type Caution,
  type Experience,
  type Goal,
  type Timing,
} from "@/lib/catalog";
import type { RecommendationResponse } from "@/lib/recommendation-service";

const EXPERIENCE_LABELS: Record<Experience, string> = {
  new: "First time",
  occasional: "On and off",
  experienced: "Regularly",
};

const TIMING_LABELS: Record<Timing, string> = {
  morning: "Morning",
  evening: "Evening",
  flexible: "Not sure",
};

const CAUTION_LABELS: Record<Caution, string> = {
  pregnant_or_nursing: "Pregnant or nursing",
  taking_medication: "Taking medication",
  thyroid_condition: "Thyroid condition",
};

/** A small glyph per goal keeps the chips warm and scannable. */
const GOAL_ICONS: Record<Goal, string> = {
  stress: "☘",
  sleep: "☾",
  energy: "✦",
  focus: "◎",
  immunity: "✿",
};

type Status = "idle" | "loading" | "done" | "error";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
        active
          ? "border-transparent bg-gradient-to-br from-[#9a5b34] to-[#7a4526] text-amber-50 shadow-[0_6px_16px_-6px_rgba(122,69,38,0.7)]"
          : "border-stone-300/80 bg-white/70 text-stone-700 hover:-translate-y-0.5 hover:border-[#9a5b34]/60 hover:bg-white"
      }`}
    >
      {children}
      <span
        className={`text-xs transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}
        aria-hidden
      >
        ✓
      </span>
    </button>
  );
}

function Field({
  step,
  label,
  hint,
  children,
}: {
  step: number;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-stone-200/70 pt-6 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#9a5b34]/12 text-xs font-semibold text-[#7a4526]">
          {step}
        </span>
        <p className="text-sm font-semibold text-stone-800">{label}</p>
        {hint && <span className="text-xs text-stone-500">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2.5 pl-9">{children}</div>
    </div>
  );
}

function ConfidenceMeter({ score, label }: { score: number; label: string }) {
  const pct = Math.round(score * 100);
  return (
    <div className="min-w-[9rem]">
      <div className="mb-1 flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-stone-500">
        <span>Confidence</span>
        <span className="text-[#7a4526]">{label}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#9a5b34] to-[#5f7a50] transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PackCard({
  pack,
  primary,
}: {
  pack: NonNullable<RecommendationResponse["recommendation"]["pack"]>;
  primary: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-5 ${
        primary
          ? "border-[#9a5b34]/40 bg-gradient-to-br from-white to-[#fbf5ea] shadow-[0_12px_30px_-16px_rgba(122,69,38,0.5)]"
          : "border-stone-200 bg-white/60"
      }`}
    >
      {primary && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-[#7a4526] px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-50">
          Recommended
        </span>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-display text-lg font-semibold text-stone-900">{pack.label}</h4>
        <span className="font-display text-xl font-semibold text-[#7a4526]">₹{pack.price}</span>
      </div>
      <p className="mt-0.5 text-xs text-stone-500">
        {pack.count} servings · {pack.days} days · ₹{pack.pricePerDay.toFixed(2)}/day
      </p>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">{pack.reason}</p>
    </div>
  );
}

export function AdvisorHarness() {
  const [goals, setGoals] = useState<Goal[]>(["stress"]);
  const [experience, setExperience] = useState<Experience>("new");
  const [timing, setTiming] = useState<Timing | null>(null);
  const [cautions, setCautions] = useState<Caution[]>([]);

  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState("");
  const [showJson, setShowJson] = useState(false);

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function submit() {
    setStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goals,
          experience,
          timing: timing ?? undefined,
          cautions,
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Request failed");

      setData(body);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setStatus("error");
    }
  }

  const rec = data?.recommendation;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12 sm:py-16">
      <header className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#7a4526]">
          Kerala Ayurveda · Ashwagandha
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-stone-900 sm:text-5xl">
          Is this right <span className="italic text-[#7a4526]">for me?</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[0.95rem] leading-relaxed text-stone-600">
          Four quick questions. We&apos;ll suggest a pack size, a format and a daily routine —
          with the reasoning behind each, so you&apos;re not guessing.
        </p>
      </header>

      <div className="rounded-3xl border border-stone-200/70 bg-white/55 p-6 shadow-[0_20px_50px_-30px_rgba(41,33,29,0.4)] backdrop-blur-sm sm:p-8">
        <div className="space-y-6">
          <Field step={1} label="What are you hoping for?" hint="pick one or more">
            {GOALS.map((goal) => (
              <Chip key={goal} active={goals.includes(goal)} onClick={() => setGoals(toggle(goals, goal))}>
                <span aria-hidden className={goals.includes(goal) ? "text-amber-100" : "text-[#c98a4b]"}>
                  {GOAL_ICONS[goal]}
                </span>
                {GOAL_LABELS[goal]}
              </Chip>
            ))}
          </Field>

          <Field step={2} label="Have you taken ashwagandha before?">
            {EXPERIENCE_LEVELS.map((level) => (
              <Chip key={level} active={experience === level} onClick={() => setExperience(level)}>
                {EXPERIENCE_LABELS[level]}
              </Chip>
            ))}
          </Field>

          <Field step={3} label="When would you take it?" hint="optional">
            {TIMINGS.map((value) => (
              <Chip
                key={value}
                active={timing === value}
                onClick={() => setTiming(timing === value ? null : value)}
              >
                {TIMING_LABELS[value]}
              </Chip>
            ))}
          </Field>

          <Field step={4} label="Anything we should know?" hint="optional">
            {CAUTIONS.map((caution) => (
              <Chip
                key={caution}
                active={cautions.includes(caution)}
                onClick={() => setCautions(toggle(cautions, caution))}
              >
                {CAUTION_LABELS[caution]}
              </Chip>
            ))}
          </Field>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 border-t border-stone-200/70 pt-6">
          <button
            type="button"
            onClick={submit}
            disabled={status === "loading" || goals.length === 0}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#9a5b34] to-[#6f3f22] px-8 py-4 text-sm font-semibold tracking-wide text-amber-50 shadow-[0_14px_30px_-14px_rgba(111,63,34,0.9)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-14px_rgba(111,63,34,0.9)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:w-auto"
          >
            {status === "loading" ? (
              <>
                <span className="size-3.5 animate-spin rounded-full border-2 border-amber-50/40 border-t-amber-50" />
                Finding your fit…
              </>
            ) : (
              <>
                Show my recommendation
                <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
                  →
                </span>
              </>
            )}
          </button>
          {goals.length === 0 && (
            <span className="text-xs text-stone-500">Pick at least one goal to continue.</span>
          )}
        </div>
      </div>

      {status === "error" && (
        <div className="animate-rise mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {status === "done" && rec && (
        <section className="animate-rise mt-8 overflow-hidden rounded-3xl border border-stone-200/70 bg-white/80 shadow-[0_24px_60px_-30px_rgba(41,33,29,0.5)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 bg-gradient-to-br from-[#fbf5ea] to-white px-6 py-5">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7a4526]">
                Your recommendation
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold leading-snug text-stone-900">
                {rec.headline}
              </h2>
            </div>
            <ConfidenceMeter score={rec.confidence.score} label={rec.confidence.label} />
          </div>

          <div className="space-y-6 p-6">
            {rec.consultRequired && (
              <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <span aria-hidden className="text-lg leading-none">⚠</span>
                <div>
                  <p className="font-semibold">Worth a conversation first</p>
                  <p className="mt-1 leading-relaxed">{rec.cautionNotes[0]}</p>
                </div>
              </div>
            )}

            <p className="text-[0.95rem] leading-relaxed text-stone-700">{rec.summary}</p>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Suggested pack
              </p>
              <div className={`grid gap-3 ${rec.alternatePack ? "sm:grid-cols-2" : ""}`}>
                <PackCard pack={rec.pack} primary />
                {rec.alternatePack && <PackCard pack={rec.alternatePack} primary={false} />}
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-[#5f7a50]/8 p-4">
              <span className="rounded-full bg-[#5f7a50]/15 px-3 py-1 text-xs font-semibold text-[#4a6140]">
                Format
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-stone-800">{rec.format.label}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-stone-600">{rec.format.reason}</p>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                Your daily routine
              </p>
              <ol className="relative space-y-4 pl-6">
                <span className="absolute left-[0.3rem] top-1.5 bottom-1.5 w-px bg-stone-200" aria-hidden />
                {rec.routine.map((step) => (
                  <li key={step.label} className="relative">
                    <span
                      className="absolute -left-[1.35rem] top-1 size-2.5 rounded-full border-2 border-white bg-[#9a5b34] shadow"
                      aria-hidden
                    />
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#7a4526]">
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-stone-700">{step.detail}</p>
                  </li>
                ))}
              </ol>
            </div>

            <p className="rounded-2xl bg-stone-50 p-4 text-sm leading-relaxed text-stone-600">
              {rec.guidance}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
              {/* copySource makes the AI fallback observable: 'engine' means Claude was skipped/rejected. */}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">
                <span
                  className={`size-1.5 rounded-full ${data.meta.copySource === "claude" ? "bg-[#5f7a50]" : "bg-stone-400"}`}
                />
                copy: {data.meta.copySource}
              </span>
              <button
                type="button"
                onClick={() => setShowJson((value) => !value)}
                className="text-xs font-semibold text-stone-500 underline underline-offset-4 hover:text-[#7a4526]"
              >
                {showJson ? "Hide" : "Show"} raw response
              </button>
            </div>
            {showJson && (
              <pre className="overflow-x-auto rounded-2xl bg-stone-900 p-4 text-xs leading-relaxed text-stone-100">
                {JSON.stringify(data, null, 2)}
              </pre>
            )}
          </div>
        </section>
      )}

      <p className="mt-10 text-center text-xs leading-relaxed text-stone-500">
        Traditional wellness guidance, not medical advice. Ashwagandha is a food supplement — it
        isn&apos;t intended to diagnose, treat or cure any condition. Speak to a practitioner if
        you&apos;re pregnant, nursing, on medication or managing a health condition.
      </p>
    </main>
  );
}
