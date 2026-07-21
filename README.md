# Spoiled &amp; Iced — Voting Marketplace ✦

A storefront-style **voting marketplace**. Visitors scroll a full catalog of pieces
(rings, necklaces, bracelets, earrings, Hello Kitty bags, Bape bags) and **vote** on
what they want stocked. The most-wanted pieces hit their vote goal, "unlock the drop,"
and are the ones you add to your [Spoiled &amp; Iced Shopify store](https://spoiled-iced-store.myshopify.com/).

It's a single, self-contained `index.html` — no build step, no dependencies. Open it,
host it, or drop it into Shopify.

## What it does

- **Storefront catalog** with category filters (All, Rings, Necklaces, Bracelets, Earrings, Hello Kitty, Bape) plus search and sort.
- **Vote on any piece** with the heart button. Votes toggle on/off, one per piece per device.
- **"Votes to unlock the drop"** progress bar on every card — hit the goal and it unlocks (with confetti).
- **Most-wanted crowns** (👑 #1, #2, #3) update live as votes come in; sort by *Most wanted* to see the leaderboard.
- **"My votes"** view so a visitor can see everything they picked.
- **Live hero stats**: pieces up for vote, total votes cast, drops unlocked.
- Fully responsive, Y2K kawaii-luxe design, respects reduced-motion preferences.

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

## Votes: device vs. shared

By default votes are saved in the browser's `localStorage` — **per device**. Great for a
demo or a light launch, but each visitor sees their own tally on top of the seeded numbers.

To make votes **shared across all visitors**, wire up a backend. The `VOTE STORE` section
in the script is isolated for exactly this — replace `saveVotes()` / the initial read with
`fetch()` calls to an API (e.g. a tiny serverless function, Supabase, Firebase, or a
Google Sheet endpoint). The whole UI already reacts to whatever count the store returns.

## Deploy

- **Any static host** (Netlify, Vercel, GitHub Pages, Cloudflare Pages): upload `index.html`.
- **Shopify:** create a page and paste the contents of the `<body>` into a *Custom Liquid*
  or *Custom HTML* section, or add it as a page template. Link to it from your nav as
  "Vote the Drop."
- **Locally:** just open `index.html` in a browser.

---
Built for Spoiled &amp; Iced. Your votes are the buy plan. 🩷
