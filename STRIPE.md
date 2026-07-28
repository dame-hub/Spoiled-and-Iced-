# Stripe setup — Payments, Tax & Invoicing

How Spoiled & Iced takes real money, in three pieces that match how the site
already works. Total setup is ~20 minutes in the Stripe Dashboard; the code is
already wired.

| Flow on the site | Stripe product | What you set up |
| --- | --- | --- |
| Deluxe Vendors List ($120 digital) | **Payments** (Payment Link) | A no-code checkout link pasted into `index.html` |
| Pre-orders ("no charge now") | **Invoicing** | A one-click menu inside your Google Sheet |
| Sales tax on both | **Tax** | Activate Stripe Tax + add your registration(s) |

> **Test first.** Do the whole setup in a Stripe **sandbox** (test mode) and pay
> yourself with card `4242 4242 4242 4242`. Flip to live keys/links only when
> it all works. No Stripe account yet? Create one at <https://dashboard.stripe.com/register>.

---

## 1. Payments — sell the Vendors List with a Payment Link

1. **Dashboard ▸ Product catalog ▸ Add product**
   - Name: `Deluxe Vendors List` · One-time · **$120.00 USD**
   - Under *Tax code*, pick the code that matches a downloadable PDF guide —
     search the selector for **digital goods / e-books**. Don't leave the
     over-broad "General – Electronically Supplied Services" code for US
     sales; pick a specific digital-goods code and confirm the choice with
     your tax advisor (<https://docs.stripe.com/tax/tax-codes>).
2. **Dashboard ▸ Payment Links ▸ New link** → select the product.
   - Turn on **Collect tax automatically** (appears once Stripe Tax is active — step 3).
   - Leave payment methods on automatic — Stripe picks the best ones per
     buyer (cards, Apple Pay, etc.). Never restrict them manually.
   - Optional: allow promotion codes; set the confirmation page message
     ("Your download arrives by email within minutes").
3. Copy the link (`https://buy.stripe.com/...`) and paste it into
   `index.html` → `CONFIG.vendorsCheckoutUrl`. From then on, **Get instant
   access** and the disclaimer button send buyers straight to Stripe checkout.
4. **Fulfillment:** Stripe emails you on every sale (Dashboard ▸ Settings ▸
   Notifications) — reply with the PDF, or automate delivery later.

## 2. Tax — activate Stripe Tax (read this part carefully)

1. **Dashboard ▸ Settings ▸ Tax**: confirm your origin address and set the
   default (preset) product tax code, then activate Stripe Tax.
2. **Dashboard ▸ Tax ▸ Registrations**: add each state/country where you're
   registered to collect.

⚠️ **The #1 Stripe Tax mistake:** "Collect tax automatically" does **nothing**
until you have an **active registration** in the buyer's jurisdiction. Stripe
won't error — it just calculates and collects **$0** while you think tax is
on. Adding a registration in Stripe records where you're *already* registered
with the tax authority; it doesn't register you. Where you're obligated to
register is a legal question — Stripe's threshold monitoring
(Dashboard ▸ Tax) flags where you might be approaching obligations, but
confirm with a tax advisor.

Stripe Tax **calculates and collects**; it doesn't file returns for you
unless you add a filing product. Reports for remitting: Dashboard ▸ Tax ▸
Reports.

## 3. Invoicing — bill pre-orders when the drop lands

The Google Sheet that captures pre-orders can now send real Stripe invoices.

**One-time setup**

1. **Dashboard ▸ Developers ▸ API keys ▸ Create restricted key** — permissions:
   - Customers: **Write**
   - Invoices: **Write**
   - everything else: None
   Use this `rk_...` key, **never** your `sk_...` secret key.
2. Google Sheet ▸ Extensions ▸ Apps Script ▸ ⚙ **Project Settings ▸ Script
   properties** ▸ add:
   - Property: `STRIPE_KEY` · Value: `rk_...`
   The key lives only there — never in code, never in git.
3. Re-paste the updated `apps-script/capture.gs` (it adds the menu + invoice code),
   save, and reload the Sheet. A **💎 Spoiled & Iced** menu appears.

**Every drop**

1. Open the `Captures` sheet, click any **preorder** row.
2. Menu ▸ **Send Stripe invoice for selected row**.
3. Choose whether to apply automatic tax:
   - **Yes** needs an active registration *and* that customer's address saved
     in Stripe (Dashboard ▸ Customers) — an invoice can't calculate tax from
     an email alone. If it's missing you'll get a clear error, not a silent $0.
   - **No** sends the invoice without tax.
4. The customer gets a Stripe-hosted **"Pay this invoice"** email (7-day due
   date; card/wallet options picked automatically). The invoice ID lands in
   the row's **Stripe invoice** column so you never double-bill.
5. Ring pre-orders automatically include the **ring size** on the invoice line.

## Security rules this setup follows

- **Restricted key (`rk_`), least privilege** — only Customers + Invoices write.
- **No keys in code or git** — the key lives in Apps Script Script properties
  (Google's server-side store). If a key ever leaks: Dashboard ▸ API keys ▸
  **roll it immediately**, then check Workbench request logs.
- **No card data ever touches your site or sheet** — buyers pay on
  Stripe-hosted pages only (Payment Link + hosted invoice).
- **Dashboard 2FA:** use a passkey or authenticator app, not SMS.
- Separate sandbox and live keys; test in sandbox first.

## Before going live

- [ ] Sandbox test: buy the Vendors List through the Payment Link with `4242…`
- [ ] Sandbox test: send yourself a pre-order invoice from the Sheet and pay it
- [ ] Stripe Tax active + at least your home registration added
- [ ] Product tax code confirmed for the Vendors List
- [ ] Live Payment Link pasted into `CONFIG.vendorsCheckoutUrl`
- [ ] Live restricted key in Script properties (replacing the sandbox one)
- [ ] Stripe's go-live checklist: <https://docs.stripe.com/get-started/checklist/go-live>
