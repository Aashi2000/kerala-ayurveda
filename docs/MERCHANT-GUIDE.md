# Merchant guide

Everything below is done from Shopify admin. None of it needs a developer or a code change.

## What you can change

| What | Where | Product-specific? |
|---|---|---|
| Add-to-cart button label | Theme editor → section settings | No |
| Accent colour (buttons, selected pills, highlights) | Theme editor → section settings | No |
| Show/hide the advisor entirely | Theme editor → section settings | No |
| Advisor heading, subheading, button label | Theme editor → section settings | No |
| Legal disclaimer | Theme editor → section settings | No |
| "Speak to a practitioner" link | Theme editor → section settings | No |
| Recommendation API endpoint | Theme editor → section settings | No |
| Trust points (add / edit / reorder / remove) | Theme editor → blocks | No |
| Label above the "Inside" ingredient chips | Theme editor → section settings | No |
| Eyebrow label, intro, usage note, ingredients | Product metafields | **Yes** |

## Editing copy and colour

1. **Online Store → Themes → Customize**.
2. Navigate to a product page (top dropdown → *Products* → pick one).
3. Click the **Ayurveda PDP** section in the left sidebar.
4. Edit any setting on the right. Changes preview live.
5. **Save**.

## Trust points

The three trust points in the buy panel are **blocks**, so you control how many there are and what order they're in.

- **Add**: click *Add block → Trust point* (up to 6).
- **Reorder**: drag the block in the sidebar.
- **Remove**: click the block → *Remove block*.
- **Edit**: each has an icon (any single character or emoji), a title, and optional supporting text.

## Turning the advisor off

Section settings → untick **Show the advisor**. The product hero, variants and add-to-cart all keep working; only the questionnaire disappears. Useful if the API is down or for products where a routine recommendation doesn't apply.

## Product-specific content

The intro paragraph, usage note, eyebrow label, and ingredient chips come from **product metafields**, so each product carries its own. See [METAFIELDS.md](./METAFIELDS.md) for the one-time setup and where each one appears.

Once set up, edit them on the product itself: **Products → [product] → Metafields** (bottom of the page).

## Pointing the advisor at the API

Section settings → **Recommendation endpoint**. Two options:

- **`/apps/ayurveda/recommendation`** (default, recommended) — routes through a Shopify App Proxy, so the request is same-origin and the API's URL never appears in the storefront.
- **A full URL** (e.g. `https://your-api.vercel.app/api/recommendation`) — simpler to set up, but the browser calls it cross-origin, so the API's `ALLOWED_ORIGINS` must include your storefront domain.

Setup for both is in the main [README](../README.md#connecting-the-advisor-to-the-api).

## What you can't change without a developer

Being straight about the edges:

- **The questions themselves** (goals, experience, timing, cautions) are fixed. They're hard-coded in the section and mirrored by the API's validation, so changing one means changing both. If the question set needs to be merchant-editable, that's a real piece of work — see *What I'd do next* in the README.
- **The recommendation logic** — which pack wins, how the routine is built — lives in the API (`src/lib/recommendation-engine.ts`). Pack sizes, prices and the scoring weights are code, not settings.
- **The layout**. Copy, colour, trust points and product content are yours; the structure isn't.
