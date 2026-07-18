# AI usage note

## Tools

**Claude Code (Opus 4.8)** for the whole build — architecture discussion, the engine, the Liquid section, tests, and these docs. No other AI tools.

Where it genuinely saved time:

- **Liquid boilerplate.** The variant-resolution pattern, `options_with_values` iteration, the `{% schema %}` block, `image_tag` with `widths`/`sizes` — all well-trodden ground, and fast to generate correctly.
- **CSS volume.** ~600 lines of namespaced CSS with the motion system is tedious to hand-write and fast to review.
- **Test enumeration.** Once the engine's behaviour was decided, generating the 38 cases across scoring, cautions, format inference, timing, and validation was much faster than writing them out.

Where it cost time rather than saving it: the **first draft**. See below.

## One AI suggestion I rejected

**The first draft's entire architecture.** An earlier session produced a standalone Next.js PDP with:

- a `GOAL_RULES` object — a static lookup keyed on one field, with a few string tweaks layered on — behind `/api/recommend`;
- a fake add-to-cart that just `setTimeout`'d for 700ms and printed a success message;
- a 48-line stub `.liquid` file that rendered four headings and no product;
- merchant config in `src/lib/shopify-config.ts`, a TypeScript file no merchant can open.

It looked complete and demoed fine. I threw it away, because it failed the brief on the two points the brief is most explicit about: *"the backend should be meaningful, not a static response disguised as an API"*, and *"the final solution should work within Shopify"*. A lookup table behind an HTTP route is not a backend feature, and a merchant-config file that only a developer can edit is not merchant configurability — it's the appearance of both.

This is the failure mode I'd flag with AI on a task like this: it optimises for something that looks finished, and a PDP mock-up looks far more finished at hour one than a real theme section does. The judgement call — *this demos well and is still the wrong thing* — was mine, and it was the highest-leverage decision in the build.

## One thing I corrected materially

**The AI copy layer trusted its own prompt.** The generated `enhanceCopy` had a good system prompt telling Claude not to make health claims, and then shipped whatever came back.

That's not good enough for a product that mustn't say ashwagandha treats anything. A prompt is a request, not a guarantee — and this is exactly the kind of copy where a plausible-sounding sentence is the dangerous one. I added `passesClaimsCheck()`: a regex screen over the generated `summary` and `guidance` for claim language (`cure`, `treats`, `prevents`, `clinically proven`, `guarantee`, disease nouns…). If either field trips it, the whole response is dropped and the deterministic copy ships instead. The shopper sees a slightly plainer sentence; they never see a health claim.

The same instinct drove the structural rule: the Claude layer can only rewrite two prose fields. It can't touch the pack, the format, the routine or the cautions. Those stay owned by the engine, so no amount of model drift can change the actual advice — the worst case is a blander sentence, not wrong guidance.

Two smaller corrections worth naming:

- **The pregnancy path.** The scoring model, left alone, sold an experienced buyer who declared pregnancy the *largest* pack. Technically consistent, obviously wrong. Cautions now override the ranking: `consult_required` forces the smallest pack and leads with "speak to a practitioner". There's a test pinning it.
- **Money formatting.** The draft sent raw cents to the client and formatted them in JS. Replaced with Shopify's `money` filter at render time — Shopify already knows the shop's currency and format, and re-deriving that client-side is how storefronts end up printing `₹1299` instead of `₹1,299.00`.

## An example prompt

The one that set the direction, near the start:

> The end goal should be a real Shopify product page, not a separate Next.js website. Shopify Liquid/theme section for the PDP + JavaScript for interactions + Next.js only for the recommendation API. Do not submit a standalone Next.js PDP with a fake add-to-cart button and mocked Shopify data — that would demonstrate frontend development, but it would not prove genuine Shopify implementation, variants and cart behaviour, Theme Editor configurability, or merchant usability.

Worth including because of what it shows about the workflow: the model had already built the wrong thing and was happy with it. The correction had to come from me, stated as a constraint with the reasoning attached — not "use Liquid", but *why* Liquid, and what specifically not to hand back. Given that, it rebuilt in the right shape and stayed there.

The general pattern: **I decide the architecture and the product rules; AI writes the code and I check the parts that can be wrong quietly.**

## How I verified the output

Nothing here is "it looked right".

- **38 unit tests** (`npm test`) over the pure engine and the validator. They pin the behaviour I'd have to defend: caution overrides, determinism, format inference, confidence bounds, that scores respond to input.
- **Ran the API for real.** `curl` against a live dev server across three behaviour paths (newcomer, experienced+sleep, pregnancy caution) and the failure paths (422 with per-field errors, 400 on malformed JSON, CORS preflight). Outputs pasted in the README.
- **`tsc --noEmit`** clean.
- **Liquid**: parsed the `{% schema %}` as JSON (a malformed schema silently breaks the Theme Editor rather than erroring loudly) and checked every `if`/`for`/`form`/`case` open-close pair balances.
- **The claims check has a test of its own**, and the engine's own templated prose is asserted claim-free — the fallback has to be as safe as the thing it's replacing.

**Product content is the part AI is least trustworthy on, so it got the least trust.** Everything factual in the copy is deliberately bounded to what's defensible without a citation: ashwagandha is traditionally taken as a rasayana over a course, churna is traditionally taken with warm milk, it's traditionally advised against in pregnancy. No efficacy claims, no timelines, no numbers I can't source. Prices and pack sizes are **invented for this assignment** and labelled as such in `catalog.ts` — I didn't want mock data quietly reading as researched fact.

## React → Liquid conversion

Honestly: **less of a factor than the brief anticipates**, because I abandoned the React PDP instead of converting it.

The draft React component was useful as a *specification* — it settled what the panel contained and roughly how it behaved — and I had AI use it as a reference while writing the Liquid natively. But it was never mechanically translated, and I'd argue converting it would have been worse. The React version had `variants` as a hard-coded array of two objects; real Liquid has to handle any option structure the merchant creates, disable combinations that don't exist, and degrade without JS. Those aren't translation problems, they're the actual work, and a conversion pass would have carried the mock's assumptions into the theme.

Where AI did help on the Shopify side: recalling the shape of the variant-matching pattern, `shopify:section:load` for Theme Editor re-renders, and the app-proxy vs CORS tradeoff.

One more thing worth noting: before writing the Anthropic integration, Claude Code loaded its own API reference rather than working from memory — which corrected two things I'd have got wrong from an older mental model (`budget_tokens` is removed on current models; structured outputs go in `output_config.format`). Good example of the general rule: **verify the API surface, don't recall it.**

## What I'd improve or build next

In priority order:

1. **Map the recommendation onto real variants.** The engine returns `variantSku`, and nothing consumes it yet — the advisor tells you "Everyday, 60" and then makes you go select it by hand. Resolving that to a variant ID and pre-selecting it (or adding straight to cart) closes the loop between the advice and the purchase, and it's the single biggest conversion gap.
2. **An integration test for the route.** The engine and validator are well covered; the route's own wiring — status codes, CORS, error envelopes — was verified by hand with `curl`. That should be automated before anyone else touches it.
3. **Merchant-editable questions via a metaobject.** The question set is fixed, and it's the most likely thing a marketing team would want to change. A metaobject definition per question would work, but the API's validation has to stay in step, so it needs designing rather than bolting on.
4. **Rate-limit the endpoint.** It's an unauthenticated POST that can trigger an LLM call. Fine for a demo, not fine on a real storefront.
5. **Cache identical recommendations.** The engine is pure and the input space is small (~5 goals × 3 experience × 4 timing × 3 cautions). Keying the Claude copy on the input hash would eliminate nearly all latency and cost after warm-up.
6. **Real analytics.** Which goals get picked, where shoppers drop, whether the advisor moves add-to-cart at all. Right now the feature's value is an argument, not a measurement.
