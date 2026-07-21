# Kerala Ayurveda — PDP enhancement

An "Is this right for me?" advisor on an Ashwagandha product page: four questions, and you get a pack size, a format, a daily routine, and the reasoning behind each — instead of guessing between three pack sizes you have no basis to choose from.

The product page is **a real Shopify theme section**. The recommendation is **a real scoring engine behind an API**. Neither is a mock-up of the other.

- **Demo:** https://eewiww-cw.myshopify.com/products/ashwagandha — storefront password: `temick`
- **API harness:** https://kerala-ayurveda-eight.vercel.app — a test surface for the API, not the product
- **Walkthrough:** _(add your Loom link)_
- **AI usage note:** [AI-USAGE.md](./AI-USAGE.md)

---

## Architecture

```
Shopify storefront (the product page the customer sees)
└── Product template
    └── sections/ayurveda-product-guide.liquid
        ├── Shopify product media, price, variants   ← product.* Liquid objects
        ├── Native add-to-cart                        ← {% form 'product' %} → /cart/add.js
        ├── Trust points                              ← section blocks (merchant-editable)
        ├── Product-specific copy                     ← product metafields
        └── "Is this right for me?" advisor           ← assets/ayurveda-product-guide.js
                        │
                        │  POST { goals, experience, timing, cautions }
                        ▼
Next.js  —  POST /api/recommendation
    ├── validation.ts               field-level validation
    ├── recommendation-engine.ts    pure scoring + routine logic  ← the actual feature
    ├── recommendation-ai.ts        optional Claude copy + claims check + fallback
    └── recommendation-service.ts   orchestration
```

**Why this split.** Shopify owns everything it's already good at — media, variants, pricing, cart, the Theme Editor, metafields. Next.js owns the one thing Liquid genuinely can't do: run scoring logic and talk to an LLM with a server-side key. Nothing is re-implemented on the wrong side of the line. There's no headless storefront, no Storefront API, no duplicated cart.

The Next.js app is **the backend**. Its one page is a developer harness for exercising the API — deliberately not a second storefront.

### Repo layout

```
shopify/
  sections/ayurveda-product-guide.liquid   the PDP: hero, variants, cart, advisor
  assets/ayurveda-product-guide.js         variant resolution, AJAX cart, advisor
  assets/ayurveda-product-guide.css        styling + the motion system
src/
  lib/catalog.ts                  packs, formats, goals  (ILLUSTRATIVE — see below)
  lib/recommendation-engine.ts    pure, deterministic, no I/O
  lib/recommendation-ai.ts        optional Claude layer, always falls back
  lib/recommendation-service.ts   validate → score → re-voice
  lib/validation.ts               request validation
  app/api/recommendation/route.ts thin HTTP adapter
  components/advisor-harness.tsx  dev harness (not the product)
docs/
  MERCHANT-GUIDE.md               how a merchant changes things
  METAFIELDS.md                   product metafield setup
```

---

## The backend feature

The core is a **weighted scoring engine**, not a lookup table. Every pack is scored on four signals; the weights sum to 1, so a score is always 0–1 and comparable.

| Signal | Weight | What it measures |
|---|---|---|
| Commitment | 0.40 | How far along the shopper is vs. how much they're being asked to buy |
| Course | 0.20 | Whether the pack covers a full 56-day course |
| Value | 0.20 | Cost per day, normalised across the catalogue |
| Caution | 0.20 | Whether a smaller first commitment is the kinder default |

The winning reason is derived from whichever signal contributed most, so the explanation shown to the shopper is generated from the maths — it can't drift from the actual decision.

**It's genuinely non-obvious.** A first-time buyer gets the **60-day pack, not the 30** — because ashwagandha is traditionally taken as a course of at least eight weeks, so the 30-day pack loses on `course` more than it wins on `commitment`. That's the engine disagreeing with the intuitive answer, and it's pinned by a test.

Other logic in the engine: format inference from goals + timing (churna for an evening sleep routine, capsules for morning energy), routine construction, and a confidence score that drops when a shopper selects everything.

### The safety rule

If a shopper declares pregnancy/nursing or a thyroid condition, scoring is **overridden**: smallest pack, and the panel leads with "speak to a practitioner" rather than a sale. Left to the maths, an experienced buyer who declared pregnancy would have been sold the largest pack.

### The AI layer

When `ANTHROPIC_API_KEY` is set, Claude re-voices two prose fields (`summary`, `guidance`) so they don't read like templates. Deliberately bounded:

- **It can't change the advice.** Pack, format, routine and cautions are owned by the engine. The model only rewrites prose.
- **The output is checked, not trusted.** A regex screen rejects claim language (`cure`, `treats`, `prevents`, `clinically proven`, disease nouns…). Tripping it drops the whole response.
- **Every failure is a fallback.** No key, timeout (8s), bad JSON, failed claims check → deterministic copy ships. The PDP never fails because the LLM did.

`meta.copySource` in the response is `"claude"` or `"engine"`, so the fallback is observable rather than silent.

---

## API

### `POST /api/recommendation`

```jsonc
{
  "goals": ["sleep", "stress"],        // required, 1–5 of: stress|sleep|energy|focus|immunity
  "experience": "new",                 // required: new|occasional|experienced
  "timing": "evening",                 // optional: morning|evening|flexible
  "cautions": ["taking_medication"]    // optional: pregnant_or_nursing|taking_medication|thyroid_condition
}
```

**200**

```jsonc
{
  "recommendation": {
    "focusGoals": ["sleep", "stress"],
    "pack": { "id": "everyday", "label": "Everyday", "count": 60, "price": 699,
              "days": 60, "pricePerDay": 11.65, "variantSku": "KA-ASH-60",
              "reason": "60 days covers a full 56-day course…", "score": 0.725 },
    "alternatePack": { "…": "…" },
    "format": { "id": "powder", "label": "Churna (powder)", "reason": "…", "chosenByShopper": false },
    "routine": [{ "label": "Evening", "detail": "…" }],
    "headline": "Built around restful sleep and everyday stress",
    "summary": "…",
    "guidance": "…",
    "cautionNotes": ["…"],
    "consultRequired": false,
    "confidence": { "score": 0.85, "label": "Strong" }
  },
  "meta": { "copySource": "engine", "generatedAt": "2026-07-17T…" }
}
```

| Status | When |
|---|---|
| 200 | Recommendation built |
| 400 | Body isn't valid JSON |
| 422 | Validation failed — `error.fields[]` gives `{ field, message }` per problem |
| 500 | Genuinely unexpected (the engine is pure; the AI layer swallows its own failures) |

Validation collects **every** problem rather than stopping at the first, so the storefront can highlight all offending fields at once.

---

## Setup

### The API

```bash
npm install
npm run dev        # http://localhost:3000 — dev harness
npm test           # 38 tests
```

Optional — enables the Claude copy layer. Everything works without it:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-…
ALLOWED_ORIGINS=https://your-store.myshopify.com
```

`ALLOWED_ORIGINS` is a comma-separated CORS allowlist. Unset reflects any origin — fine locally, set it in production. Not needed at all if you use an App Proxy.

Deploy to Vercel (`vercel deploy`) and set both as environment variables. **The key is server-side only** — the storefront only ever talks to your API route.

### The Shopify theme

1. Copy the files into a Dawn-based theme:
   ```
   shopify/sections/ayurveda-product-guide.liquid  →  sections/
   shopify/assets/ayurveda-product-guide.css       →  assets/
   shopify/assets/ayurveda-product-guide.js        →  assets/
   ```
   Via CLI: `shopify theme dev --store your-store.myshopify.com`

2. Create the product metafields — [docs/METAFIELDS.md](./docs/METAFIELDS.md) (one-time).

3. **Customize → product page → Add section → Ayurveda PDP**. It ships with a preset, so it renders with three trust points immediately. Remove Dawn's default product section if you want this to be the hero.

4. Section settings → **Recommendation endpoint**.

### Connecting the advisor to the API

**Option A — App Proxy (recommended).** Same-origin, no CORS, and the API's URL never appears in the storefront.

In your Shopify app → *App proxy*: subpath prefix `apps`, subpath `ayurveda`, proxy URL `https://your-api.vercel.app/api`. Then leave the endpoint setting as `/apps/ayurveda/recommendation`.

**Option B — direct URL.** Set the endpoint to `https://your-api.vercel.app/api/recommendation` and add your storefront to `ALLOWED_ORIGINS`. Simpler; exposes the API URL and requires CORS. Both are supported.

---

## Merchant configurability

Twelve editable properties. Full detail in [docs/MERCHANT-GUIDE.md](./docs/MERCHANT-GUIDE.md).

**Section settings** — button label, accent colour, advisor on/off, advisor heading/subheading/button, disclaimer, practitioner link, API endpoint, ingredients label.

**Blocks** — trust points: add, edit, reorder, remove (up to 6).

**Product metafields (product-specific)** — `custom.eyebrow`, `custom.advisor_intro`, `custom.usage_note`, `custom.key_ingredients`.

The section/metafield split is the point: settings apply wherever the section is placed; metafields travel with the product. One section serves the whole catalogue without being duplicated per product.

> The draft this replaced had merchant config in `src/lib/shopify-config.ts` — a TypeScript file no merchant can open. Config a merchant can't reach isn't config.

---

## Testing

```bash
npm test
```

38 tests across the pure engine and the validator — caution overrides, determinism, format inference, timing derivation, confidence bounds, that scores actually respond to input, and that the engine's own prose is claim-free.

Beyond the suite, I verified against a running server rather than trusting it:

```
Newcomer + stress          → pack: Everyday (60 days) · copy source: engine · Balanced 0.7
Experienced + sleep + eve  → pack: Value · format: Churna · routine[0]: Evening — warm milk
Pregnancy caution          → pack: Starter · consultRequired: true · practitioner note
Empty goals + bad field    → HTTP 422, per-field errors for both
Malformed JSON             → HTTP 400
CORS preflight             → HTTP 204 + allow-origin echoed
```

Also: `tsc --noEmit` clean; the `{% schema %}` block parsed as JSON (a malformed schema breaks the Theme Editor silently); Liquid tag pairs balance-checked.

---

## Performance and reliability

- **Images** — `image_url` + `image_tag` with `widths`/`sizes`, so Shopify's CDN serves a responsive `srcset`. Hero is `eager`/`high` priority; thumbnails lazy.
- **Zero frontend dependencies** — the storefront ships ~10KB of hand-written JS and CSS. No framework, no build step, no runtime on the customer's critical path.
- **Prices formatted by Liquid**, not JS. Shopify already knows the shop's currency; re-deriving that client-side is how storefronts print `₹1299` instead of `₹1,299.00`.
- **Unavailable variants are struck through, not hidden** — you can't assemble a combination that doesn't exist and discover it via a dead button.
- **8s timeout + 1 retry** on the Claude call, then fallback. Worst case is plainer copy.
- **Degrades without JS** — the product form submits natively; the advisor hides rather than showing a dead panel.
- **Survives bad data** — no product, blank metafields, malformed variant JSON, missing endpoint are all handled without taking the buy button down.
- **`prefers-reduced-motion`** collapses all motion (the loading spinner keeps turning slowly — it still has to read as "working").

---

## Real vs. mocked

**Real** — the Liquid section and its Shopify objects; variant resolution; native cart via `/cart/add.js`; section settings, blocks and metafields; the scoring engine; the API and its validation; the Claude integration and claims check; the tests.

**Illustrative / invented** — pack sizes, prices (₹399/699/949) and SKUs in `catalog.ts`; the `56`-day course constant and the 1-unit/day baseline; all example metafield copy; the scoring weights (defensible, but tuned by judgement, not data). Everything in `catalog.ts` is flagged as such in the file itself.

**Not built** — no live dev store is included (you'll need to install into your own); the engine's `variantSku` isn't yet mapped to a real variant ID; no rate limiting; no analytics.

**Content standard.** Nothing claims ashwagandha treats, cures or prevents anything. Copy stays at traditional use and routine. The advisor is framed as supporting your own research, carries a disclaimer, and routes pregnancy/thyroid answers to a practitioner rather than a sale.

---

## Tradeoffs

**Rebuilt rather than converted.** A working React PDP existed. I deleted it. It had a static lookup behind the API, a `setTimeout` add-to-cart, and a stub Liquid file — it demoed well and was the wrong thing, on the two points the brief is most explicit about. Converting it would have carried the mock's assumptions (a hard-coded two-variant array) into the theme. The Liquid was written natively; the React version served as a spec.

**One product, deep.** Ashwagandha only. The section is product-agnostic — it reads whatever options and metafields a product has — but the engine's catalogue and goal vocabulary are Ashwagandha-specific. Generalising is real work, not a config change.

**Hand-rolled validation.** No Zod. Five fields, narrow shapes; a schema library would be more dependency than the problem deserves.

**The advisor is a section, not a theme app extension.** An extension would be the more "correct" distribution mechanism for a real app. For a single merchant's theme, a section is installable in minutes and fully Theme-Editor-configurable — the extension's benefits are mostly about app distribution, which isn't the scenario here.

**Fixed questions.** The most likely merchant request the current design can't serve. Making them editable means keeping the API's validation in step — designable, but not bolt-on.

---

## Time

Roughly **8 hours**: ~1h understanding the brief and rejecting the first draft's architecture, ~2h engine + tests, ~1h AI layer + API, ~2.5h Liquid section + JS + CSS, ~1.5h verification and docs.
