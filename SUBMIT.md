# Submission runbook

Ordered checklist to get from "code on GitHub" to "submitted". Tick as you go.

- [x] **Code pushed to GitHub** — https://github.com/Aashi2000/kerala-ayurveda
- [ ] Step 1 — Deploy the API to Vercel
- [ ] Step 2 — Set up the Shopify dev store
- [ ] Step 3 — Connect the advisor to the API
- [ ] Step 4 — Record the Loom
- [ ] Step 5 — Fill the README placeholders and submit

---

## Step 1 — Deploy the API to Vercel (~5 min)

The API needs to be reachable from your Shopify storefront, so it has to be hosted.

```bash
npm i -g vercel          # if you don't have it
cd /Users/aashipradhan/Desktop/assignment
vercel                   # first run: log in, accept defaults, link the project
vercel --prod            # deploy to a stable production URL
```

Vercel prints a URL like `https://kerala-ayurveda.vercel.app`. Your API endpoint is that **+ `/api/recommendation`**.

**Set environment variables** (Vercel dashboard → your project → Settings → Environment Variables), then redeploy:

| Name | Value | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | your `sk-ant-…` key | Optional — enables the Claude copy layer; without it the advisor uses deterministic copy |
| `ALLOWED_ORIGINS` | `https://YOUR-STORE.myshopify.com` | Only if you use the direct-URL option (Step 3, Option B) |

**Verify the deployed API** (swap in your URL):

```bash
curl -s https://YOUR-APP.vercel.app/api/recommendation \
  -X POST -H 'Content-Type: application/json' \
  -d '{"goals":["sleep"],"experience":"new"}'
```

You should get a JSON `recommendation` back. If so, the backend is live.

---

## Step 2 — Set up the Shopify dev store (~30 min)

This is the part that produces your **demo link**.

1. **Create a Partner account** — https://partners.shopify.com (free).
2. **Create a development store**: Partners dashboard → *Stores* → *Add store* → *Development store*. It ships with the **Dawn** theme.
3. **Add the product**: Products → Add product.
   - Title: `Ashwagandha` (or the real product name).
   - Add at least one image.
   - Add **variants** so the pack selector has something to show: create an option named e.g. *Pack* with values *30 / 60 / 90 tablets*, and give each a price. (These are what the advisor's pack recommendation maps to conceptually.)
   - Set it to Active and available on the Online Store.
4. **Push the theme files** using the Shopify CLI:
   ```bash
   npm i -g @shopify/cli @shopify/theme
   cd /Users/aashipradhan/Desktop/assignment/shopify
   shopify theme dev --store YOUR-STORE.myshopify.com
   ```
   This uploads `sections/` and `assets/` and gives you a live preview URL. (Alternatively: Online Store → Themes → Edit code, and paste the three files in manually.)
5. **Create the product metafields** — follow `docs/METAFIELDS.md` exactly (Settings → Custom data → Products). Then fill them in on the Ashwagandha product. This is the product-specific merchant config the rubric asks for.
6. **Add the section to the product page**: Online Store → Themes → Customize → navigate to the product → *Add section* → **Ayurveda PDP**. It arrives with a preset (3 trust points), so it renders immediately. Remove Dawn's default product section if you want this to be the hero.

Your **demo link** is that product's URL:
`https://YOUR-STORE.myshopify.com/products/ashwagandha`

> Note: dev store previews sometimes ask for a store password. That's fine for a demo link — include the password in your submission, or Partners → store → *disable password* for the review window.

---

## Step 3 — Connect the advisor to the API

In the theme customizer → **Ayurveda PDP** section → **Recommendation endpoint** setting. Two options:

**Option A — direct URL (simplest).** Set the endpoint to your Vercel URL:
```
https://YOUR-APP.vercel.app/api/recommendation
```
Then add your storefront domain to `ALLOWED_ORIGINS` in Vercel (Step 1) and redeploy, so the browser's cross-origin call is allowed.

**Option B — App Proxy (cleaner, more "Shopify-native").** Hides the API URL and makes the call same-origin (no CORS). Needs a Shopify app in your Partner account with an App Proxy configured (subpath prefix `apps`, subpath `ayurveda`, proxy URL = your Vercel `/api`). Then leave the endpoint as the default `/apps/ayurveda/recommendation`. Use this only if you're comfortable creating an app; Option A is fine for the demo.

**Test it on the live page:** open the product, scroll to the advisor, pick goals + experience, submit. You should see the skeleton loader, then a recommendation card. Try the pregnancy caution → it should show the practitioner message instead of a sale.

---

## Step 4 — Record the Loom (2–4 min)

Record at https://loom.com. Suggested script (hits every rubric area):

1. **The problem** (15s): "A shopper lands on Ashwagandha and has no basis to choose between three pack sizes."
2. **The hero** (30s): switch a variant — point out the price updating and unavailable combos striking through. Add to cart — show it's the real Shopify cart, not a mock.
3. **The advisor** (60s): answer the four questions. Narrate that a first-timer gets the 60-day pack *because* a full course is ~8 weeks — the engine disagreeing with the obvious answer. Show the routine and the reasoning on each pick.
4. **The safety override** (20s): re-run with the pregnancy answer → it drops to the smallest pack and routes to a practitioner instead of selling harder.
5. **Merchant config** (30s): open the theme editor, change the accent colour or a trust point live; mention the product-specific metafields.
6. **Backend honesty** (20s): show `meta.copySource` / mention the 38 tests and the claims screen on AI copy.

Keep it tight — 3 minutes is plenty.

---

## Step 5 — Fill the README placeholders and submit

Edit `README.md`, replace the three placeholders near the top:

- `_(add your dev store product URL)_` → your demo link from Step 2
- `_(add your Vercel URL)_` → your Vercel app URL
- `_(add your Loom link)_` → your Loom URL

Then commit and push:

```bash
cd /Users/aashipradhan/Desktop/assignment
git add README.md
git commit -m "Add demo, API, and Loom links"
git push
```

**Submit these five things:**
1. Shopify demo link (+ store password if enabled)
2. GitHub repo — https://github.com/Aashi2000/kerala-ayurveda
3. Loom link
4. README (it's in the repo)
5. AI usage note — `AI-USAGE.md` (in the repo)

---

## If you get stuck

- **API returns 500 on Vercel** → the Claude call is failing *and* not caught? No — it's caught. A 500 means something else; check the Vercel function logs. The engine itself is pure and can't 500.
- **Advisor shows nothing / "couldn't build your routine"** → the endpoint setting is wrong or CORS is blocking. Open browser devtools → Network → look at the `/recommendation` request. A CORS error means `ALLOWED_ORIGINS` doesn't include your store domain.
- **Section not in the theme editor** → the `.liquid` file didn't upload, or you're looking at the wrong theme. Re-run `shopify theme dev` and confirm it's the live/dev theme you're customizing.
- **Metafields not showing on the page** → the namespace/key must match `docs/METAFIELDS.md` exactly (`custom.advisor_intro`, etc.). A blank metafield is hidden by design.
