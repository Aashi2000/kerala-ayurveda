"use client";

/**
 * Developer harness for the recommendation API.
 *
 * This is NOT the customer-facing experience — that lives in the Shopify theme
 * (`shopify/sections/ayurveda-product-guide.liquid`) and runs on a real product
 * page with real variants and a real cart.
 *
 * This page exists so the API can be exercised, demoed and debugged without a
 * storefront: it posts the same payload the Liquid section posts, and shows both
 * the rendered result and the raw JSON.
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
      className={`rounded-full border px-3.5 py-2 text-sm transition-all duration-150 ${
        active
          ? "border-amber-800 bg-amber-800 text-white"
          : "border-stone-300 bg-white text-stone-700 hover:border-amber-800"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
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
    <main className="mx-auto max-w-3xl px-6 py-12 text-stone-800">
      <header className="mb-8 border-b border-stone-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
          Developer harness
        </p>
        <h1 className="mt-2 text-2xl font-medium text-stone-900">Recommendation API</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          This page exercises <code className="rounded bg-stone-100 px-1.5 py-0.5">POST /api/recommendation</code>{" "}
          directly. It is a test surface, not the product — the customer-facing experience is the
          Liquid section running on a real Shopify product page, with real variants and the native
          cart. See the README for install steps.
        </p>
      </header>

      <div className="space-y-6">
        <Field label="Goals (required)">
          {GOALS.map((goal) => (
            <Chip key={goal} active={goals.includes(goal)} onClick={() => setGoals(toggle(goals, goal))}>
              {GOAL_LABELS[goal]}
            </Chip>
          ))}
        </Field>

        <Field label="Experience (required)">
          {EXPERIENCE_LEVELS.map((level) => (
            <Chip key={level} active={experience === level} onClick={() => setExperience(level)}>
              {EXPERIENCE_LABELS[level]}
            </Chip>
          ))}
        </Field>

        <Field label="Timing (optional)">
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

        <Field label="Cautions (optional)">
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

        <div className="flex items-center gap-4 pt-2">
          <button
            type="button"
            onClick={submit}
            disabled={status === "loading" || goals.length === 0}
            className="rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading" ? "Building…" : "Send request"}
          </button>
          {goals.length === 0 && (
            <span className="text-sm text-stone-500">Pick at least one goal.</span>
          )}
        </div>
      </div>

      {status === "error" && (
        <div className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {status === "done" && rec && (
        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
              {rec.headline}
            </p>
            <div className="flex gap-2 text-xs">
              <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-600">
                {rec.confidence.label} · {rec.confidence.score}
              </span>
              {/* Makes the fallback visible: 'engine' means Claude was skipped or rejected. */}
              <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-600">
                copy: {data.meta.copySource}
              </span>
            </div>
          </div>

          {rec.consultRequired && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Worth a conversation first</p>
              <p className="mt-1 leading-relaxed">{rec.cautionNotes[0]}</p>
            </div>
          )}

          <p className="mt-4 leading-relaxed">{rec.summary}</p>

          <dl className="mt-5 grid gap-3 rounded-xl bg-stone-50 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-stone-500">Pack</dt>
              <dd className="text-right font-semibold">
                {rec.pack.label} · {rec.pack.count} · ₹{rec.pack.price}
              </dd>
            </div>
            <dd className="-mt-2 text-stone-600">{rec.pack.reason}</dd>
            <div className="flex justify-between gap-4 border-t border-stone-200 pt-3">
              <dt className="font-semibold text-stone-500">Format</dt>
              <dd className="text-right font-semibold">{rec.format.label}</dd>
            </div>
            <dd className="-mt-2 text-stone-600">{rec.format.reason}</dd>
          </dl>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Routine
          </p>
          <ol className="mt-2 space-y-2">
            {rec.routine.map((step) => (
              <li key={step.label} className="flex gap-3 rounded-lg bg-stone-50 p-3 text-sm">
                <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-amber-800">
                  {step.label}
                </span>
                <span className="leading-relaxed">{step.detail}</span>
              </li>
            ))}
          </ol>

          <p className="mt-4 text-sm leading-relaxed text-stone-600">{rec.guidance}</p>

          <button
            type="button"
            onClick={() => setShowJson((value) => !value)}
            className="mt-6 text-xs font-semibold text-stone-500 underline underline-offset-4"
          >
            {showJson ? "Hide" : "Show"} raw response
          </button>
          {showJson && (
            <pre className="mt-3 overflow-x-auto rounded-xl bg-stone-900 p-4 text-xs leading-relaxed text-stone-100">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </section>
      )}
    </main>
  );
}
