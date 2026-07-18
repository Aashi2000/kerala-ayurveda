# Product metafields

These are the **product-specific** merchant controls. Section settings apply to the section wherever it's placed; metafields travel with the product, so the same section serves every product without being duplicated or re-edited per product.

Create them once in **Shopify admin → Settings → Custom data → Products → Add definition**, then fill them in per product on the product page (**Metafields** panel at the bottom).

| Namespace & key | Type | Shown where | Required |
|---|---|---|---|
| `custom.eyebrow` | Single line text | Small label above the product title | No |
| `custom.advisor_intro` | Single line text | Intro paragraph under the title | No |
| `custom.usage_note` | Multi-line text | Bordered note under the add-to-cart button | No |
| `custom.key_ingredients` | List of single line text | "Inside" chips in the buy panel | No |

Every one is optional — the section hides the block if the metafield is blank, so a product with none set still renders correctly.

## Setting them up

For each row above:

1. **Settings → Custom data → Products → Add definition**.
2. **Name**: anything readable (e.g. "Advisor intro").
3. **Namespace and key**: click *Edit* and set it to exactly the value in the table — e.g. `custom.advisor_intro`. This must match exactly or the section won't read it.
4. **Type**: as per the table. For `key_ingredients`, choose *Single line text* and then tick **List of values**.
5. Save.

## Example values (Ashwagandha)

| Metafield | Example |
|---|---|
| `custom.eyebrow` | `Rasayana · Root extract` |
| `custom.advisor_intro` | `A classical adaptogenic root, traditionally taken as a daily rasayana rather than a quick fix.` |
| `custom.usage_note` | `Take one tablet daily with water, after a meal. Traditionally taken as a course of at least eight weeks.` |
| `custom.key_ingredients` | `Ashwagandha root extract`, `Organic ashwagandha powder` |

> These examples are **illustrative** — written for this assignment, not lifted from Kerala Ayurveda's live listings. Replace them with approved copy before any real use, and keep them at the level of traditional use rather than health outcomes.

## A note on claims

The section escapes and renders metafield content verbatim. It does not check what you write. Anything entered here goes straight onto a live product page, so it's the merchant's responsibility to keep this copy free of disease, treatment, or guaranteed-outcome claims. The advisor's generated copy is checked server-side (see `src/lib/recommendation-ai.ts`); metafield copy is not, because a merchant typing into Shopify admin is a trusted author in a way a language model isn't.
