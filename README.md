# Spoiled &amp; Iced — Voting Marketplace ✦

A storefront-style **voting marketplace**. Visitors scroll a full catalog of 18k & 14k
gold-plated jewelry (rings, earrings, necklaces, bracelets) and **vote** on what they want
stocked. The most-wanted pieces hit their vote goal, "unlock the drop," and are the ones you
add to your [Spoiled &amp; Iced Shopify store](https://spoiled-iced-store.myshopify.com/).

The catalog ships with **20 real products** — names, prices, ratings, "sold" counts and photos
extracted from the Alex Handwork Store jewelry catalog. Styled in a light bubblegum-pink theme that matches the Spoiled & Iced
Shopify storefront (pale pink background, dark-plum text, pink accents).

It's a single, self-contained `index.html` — no build step, no dependencies (the logo is
embedded inline). Open it, host it, or drop it into Shopify.

## What it does

- **Click-to-enter intro**: on arrival the logo's pieces (letters *and* charms) fall from the
  top, sparkle, and assemble into the full logo, then a "Click to enter" prompt waits — the
  site opens only when the visitor clicks/taps (no auto-dismiss). Shown once per session;
  reduced-motion users get the same gate without the animation.
- **Disclaimer pop-up** (shown on every visit): prices are marked up over vendor cost, some photos are stock vendor images, with an X to close and a button through to the Deluxe Vendors List.
- **Light / dark theme toggle** in the header — visitors pick the bubblegum-light look (default, matches the store) or the dark liquid-chrome look; their choice is remembered.
- **Hero collage of real products** (photos pulled from the live catalog, not emoji, with a couple of bags featured).
- **Ring-size poll** pinned to the very top of the site: visitors tap their size (5–10, half sizes included) so you stock the sizes people actually wear. One vote per device (change it anytime), a live bar + count on each size, a crown on the most-wanted size, and it feeds the Host Hub's **Ring Size Demand** panel.
- **Storefront catalog** with category filters (All, Rings, Earrings, Necklaces, Bracelets, Hello Kitty Bags, Bape Bags) plus search and sort. Cards show real photos, price (with original-price strikethrough) and a votes-to-unlock meter — no review clutter under the product.
- **Vote on any piece**. Votes toggle on/off, one per piece per device.
- **"Votes to unlock the drop"** progress bar on every card — hit the goal and it unlocks (with confetti).
- **Pre-order / "Skip the wait"** on every piece: a visitor who doesn't want to wait for the
  drop reserves it (quantity + email) — no charge now, they're first in line when it lands.
  Ring pre-orders add a **ring-size picker** (pre-filled from the visitor's size-poll pick),
  and the chosen size flows into the reservation, the confirmation email and the Host Hub.
  A **Reserved** counter in the header opens their list of pre-orders.
- **Most-wanted ranks** (#1, #2, #3) update live as votes come in; sort by *Most wanted* to see the leaderboard.
- **"My votes"** view so a visitor can see everything they picked.
- **Live hero stats** + a **trust bar** (rating · pieces sold · positive reviews).
- **The Deluxe Vendors List** — a dedicated section selling one digital product ($120, was $250): 15+ vetted vendors low→high tier + a reseller PDF guide, with its own checkout flow.
- **Vote/pre-order/purchase capture** — every action is POSTed to your endpoint so you can see what's winning (see below).
- **Optimized for iPhone / mobile**: single-column catalog, a big unmistakable **Vote** button (with a "Skip the wait" pre-order beneath it), a "How to vote" guide bar, large tap targets, and iOS-safe inputs/insets.
- 67 real products (original catalog photos): jewelry (incl. 35 Hello Kitty Barbie ring variants) plus Hello Kitty & Bape bags.
- Fully responsive, light bubblegum-pink theme (matches the Shopify storefront), respects reduced-motion preferences.

## Backend, auto-emails &amp; your private Host Hub (5-minute setup)

One free Google Apps Script powers everything: it logs every visit / vote / pre-order /
purchase, **emails the customer automatically when they pre-order**, and serves **private
stats** to your Host Hub dashboard. No server to run, no monthly cost.

### 1. Deploy the backend
1. Create a **Google Sheet** → **Extensions ▸ Apps Script**. Delete the sample and paste ALL
   of [`api/capture.gs`](api/capture.gs).
2. Edit the three CONFIG values at the top:
   - `ADMIN_TOKEN` — your **Host Hub passcode** (make it long; this is what keeps your numbers private).
   - `OWNER_EMAIL` — where new-order alerts are sent.
   - `STORE_NAME` / `STORE_URL`.
3. **Deploy ▸ New deployment ▸ Web app** · *Execute as: Me* · *Who has access: Anyone*.
   The first deploy asks you to **authorize Gmail sending** — allow it (that's what powers the
   automatic emails). Copy the Web app URL (ends in `/exec`).
4. In `index.html`, set `CONFIG.captureUrl = "your /exec URL";`

### 2. Automatic pre-order emails ✅
Once deployed, this is fully automatic — the moment a visitor pre-orders, the script emails
them a branded confirmation ("your pre-order is reserved, no charge yet…") and emails **you**
a heads-up. Same for a Vendors List purchase. Consumer Gmail sends up to ~100 emails/day free
(Google Workspace: ~1,500). Edit the wording in the `sendPreorderEmail_` / `sendPurchaseEmail_`
functions.

### 3. Your private Host Hub (only you can see it)
Open **`admin.html`** (host it alongside `index.html`, e.g. `yourstore.com/admin.html`, or just
open the file). Enter your `/exec` URL and your `ADMIN_TOKEN` passcode once — it's saved to your
device. It's organised into tabs:
- **Overview** — unique visitors, total votes, pre-orders, pre-order value, sales, revenue, top pieces, and votes-by-category.
- **Votes** — **every piece with its live vote count** (searchable), plus a **who-voted-&-when log** (each vote event by anonymous per-device ID).
- **Pre-orders** — every reservation with piece, qty and email.
- **Sales** — every Deluxe Vendors List order.

Click **Preview with sample data** first to see it before connecting. Votes are funneled into
the sheet as they happen, and the storefront also reads back **shared per-piece counts** (a
public, safe endpoint) so everyone sees the same tallies.

**Why it's private:** the backend refuses to return any stats unless the correct `ADMIN_TOKEN`
is supplied, and only you know it. Don't link `admin.html` from the public site, and keep your
passcode secret. (This is solid for a small store; it isn't enterprise SSO — for that you'd add
a real auth provider.)

Each sheet row is: time, type, piece, category, price, voted, count, qty, email, raw JSON.
Prefer your own server / Supabase / Firebase? Point `captureUrl` at any endpoint that accepts a
JSON `POST` and mirror the stats/email logic there.

## The Deluxe Vendors List (digital product)

The `#vendors` section sells a single premium download. To take real payments, set
`CONFIG.vendorsCheckoutUrl` to a **Stripe / Shopify / Gumroad payment link** — the "Get
instant access" button then sends buyers straight there. Left blank, it opens a checkout
modal that captures the buyer's email (logged via `captureUrl`) and promises the payment
link + download by email. Edit the price/copy in the `.vendors` section of `index.html`.

## Your logo &amp; the intro

The real logo is embedded as a transparent image in the `--logo` CSS variable at the top of
the `<style>` block, and used in the header, the footer, and the intro animation. To swap in
a different file, replace that one `--logo: url("data:image/png;base64,…")` value with
`url("your-logo.png")` (or a data URI) — everything else updates automatically.

The intro splits the logo into a 7×5 grid of pieces that fall and reassemble. Tune it in
`initIntro()`: `cols`/`rows` (how many pieces), the fall `transition` timing, or the
auto-dismiss timeout. It's gated by `sessionStorage` so it plays on a fresh visit but not on
every refresh.

## Customize it

Everything is data-driven. Open `index.html` and edit the arrays near the top of the `<script>`:

### Products (the ballot)
```js
{ id: "r1", name: "Iced Butterfly Ring", cat: "rings",
  price: 24.00, base: 82, goal: 100, badge: "hot", icon: "🦋",
  src: SOURCES.jewelry }
```
- `base` — starting vote count. `goal` — votes needed to unlock the drop.
- `badge` — `"hot"`, `"new"`, or `null`.
- `icon` — the emoji shown on the tile.
- **Real photos:** add `image: "https://…your-photo.jpg"` to any product and it renders
  the photo instead of the emoji tile.
- `src` — the vendor product link (see below).

### Vendor sources
The two partner storefronts are in `SOURCES`:
```js
var SOURCES = {
  jewelry: "https://a.aliexpress.com/_msqbsqx",
  bags:    "https://a.aliexpress.com/_mtEMOIF"
};
```
Paste an **exact product URL** into a product's `src` to make its "View source ↗" link
deep-link straight to that item.

### Categories
Add or rename categories in the `CATS` object (label, chip emoji, and the two-color tile gradient).

## Connect the AliExpress API (automatic products + photos)

Instead of hand-entering pieces, the site can pull **real products, prices, and photos**
straight from AliExpress via their official Affiliate API. Because every API request must be
signed with your secret key (which can't live in a webpage), this runs through a tiny
backend — `api/products.js` — that you deploy once. The storefront then loads live products
on page load, and falls back to the demo catalog whenever the backend isn't reachable.

### 1. Get API access
- Sign up on the **AliExpress Open Platform / Affiliate portal** (`portals.aliexpress.com`
  for affiliates, or `openservice.aliexpress.com` for the open platform) and create an app.
- After approval you'll have an **App Key**, an **App Secret**, and a **Tracking ID**.

### 2. Choose your pieces
Open `products.config.json` and list the **numeric product IDs** you want on the ballot —
the number in a product URL, e.g. `.../item/`**`1005006123456789`**`.html`. From your two
vendor links, open each piece and grab that number. Use `overrides` to set each item's
category and drop goal (category matters most for the bags — the code can't tell Hello Kitty
from Bape on its own):
```json
{
  "productIds": ["1005006123456789", "1005006987654321"],
  "defaultGoal": 100,
  "overrides": {
    "1005006123456789": { "cat": "hellokitty", "goal": 120, "badge": "hot" },
    "1005006987654321": { "cat": "bape" }
  }
}
```

### 3. Deploy the backend
Push this repo to **Vercel** (easiest — it auto-detects the `api/` folder), or Netlify /
Cloudflare (Node 18+). Set these environment variables in the host's dashboard:

| Variable | Value |
|---|---|
| `ALIEXPRESS_APP_KEY` | your App Key |
| `ALIEXPRESS_APP_SECRET` | your App Secret |
| `ALIEXPRESS_TRACKING_ID` | your Tracking ID |
| `ALIEXPRESS_SIGN_METHOD` | `sha256` (default) — flip to `md5` only if you get a sign error |
| `ALIEXPRESS_PRODUCT_IDS` | *(optional)* comma-separated IDs, overrides the config file |

Visit `https://your-app.vercel.app/api/products` — you should see JSON of your products.
Add `?debug=1` to see the raw AliExpress response, which is handy if signing needs a tweak.

### 4. Point the storefront at it
In `index.html`, the `CONFIG.apiUrl` near the top of the script decides where products come
from:
- Same domain as the backend → leave it as `"/api/products"`.
- Storefront on **Shopify**, backend on Vercel → set it to the full URL,
  `"https://your-app.vercel.app/api/products"` (CORS is already enabled in the backend).
- Set it to `""` to force the built-in demo catalog.

> **Heads up on signing:** AliExpress provisions apps against two API gateways with slightly
> different signature rules. The backend defaults to the newer HMAC-SHA256 method; if the API
> returns a sign/auth error, switch `ALIEXPRESS_SIGN_METHOD` to `md5`. Once you have real
> credentials we can confirm the right setting together against the live `?debug=1` output.

## Votes &amp; pre-orders: device vs. shared

By default votes **and pre-orders** are saved in the browser's `localStorage` — **per
device**. Great for a demo or a light launch, but each visitor sees their own tally on top of
the seeded numbers.

To make votes **shared across all visitors**, wire up a backend. The `STORES` section in the
script is isolated for exactly this — replace the `localStorage` read/write helpers with
`fetch()` calls to an API (a tiny serverless function, Supabase, Firebase, or a Google Sheet
endpoint). The whole UI already reacts to whatever count the store returns.

**Pre-orders** currently reserve a piece (name, quantity, email) with **no charge** and store
it locally. To make them real orders, use the clearly-marked `HOOK` line in `submitPreorder()`:
POST the reservation to your backend / email service, or redirect to a Shopify checkout /
pre-order product so the customer can pay. The confirmation copy already promises "no charge
now — we'll email you when it's ready," so it's honest either way.

## Deploy

- **Any static host** (Netlify, Vercel, GitHub Pages, Cloudflare Pages): upload `index.html`.
- **Shopify:** create a page and paste the contents of the `<body>` into a *Custom Liquid*
  or *Custom HTML* section, or add it as a page template. Link to it from your nav as
  "Vote the Drop."
- **Locally:** just open `index.html` in a browser.

---
Built for Spoiled &amp; Iced. Your votes are the buy plan. 🩷
