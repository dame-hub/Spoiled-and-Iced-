/**
 * Spoiled & Iced — backend (Google Apps Script)
 * ==============================================
 * One free script that:
 *   1) Logs every visit / vote / pre-order / purchase to a Google Sheet.
 *   2) Emails the customer automatically on pre-order / purchase (and alerts you).
 *   3) Serves PUBLIC per-piece vote counts to the storefront (so tallies are shared).
 *   4) Serves PRIVATE, passcode-gated stats to your Host Hub dashboard — every
 *      piece's votes, who voted (by device id), pre-orders and sales.
 *
 * SETUP (see README "Backend, auto-emails & Host Hub"):
 *   1. Google Sheet → Extensions ▸ Apps Script. Paste ALL of this.
 *   2. Edit the CONFIG values below.
 *   3. Deploy ▸ New deployment ▸ Web app · Execute as: Me · Access: Anyone.
 *      (Authorize Gmail when prompted.) Copy the /exec URL.
 *   4. index.html  -> CONFIG.captureUrl = "that /exec URL"
 *      admin.html  -> enter the same URL + your passcode.
 */

/* ======================= CONFIG — EDIT THESE ======================= */
var ADMIN_TOKEN = "change-me-to-a-long-secret";     // Host Hub passcode
var OWNER_EMAIL = "you@example.com";                 // new-order alerts — set to YOUR email
var STORE_NAME  = "Spoiled & Iced";
var STORE_URL   = "https://spoiled-iced-store.myshopify.com/";
/* =================================================================== */

var SHEET = "Captures";

function ensureSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(["Received", "Type", "Piece / Product", "Category",
                  "Price", "Voted", "Vote count", "Qty", "Email", "Voter ID", "Raw JSON",
                  "Stripe invoice", "Ship to"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------- Catalog sheet: owner edits from the Host Hub ---------- */
var CATALOG_SHEET = "Catalog";

function ensureCatalog_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CATALOG_SHEET) || ss.insertSheet(CATALOG_SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(["Updated", "ID", "Name", "Category", "Price", "Goal", "Badge", "Hidden", "Image"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* Upsert one catalog override (called from the Host Hub, token-gated). */
function catalogUpsert_(d) {
  var sh = ensureCatalog_(), rows = sh.getDataRange().getValues(), rowIdx = -1;
  for (var i = 1; i < rows.length; i++) if (String(rows[i][1]) === String(d.id)) { rowIdx = i + 1; break; }
  var row = [new Date(), String(d.id), d.name || "", d.cat || "", (d.price === "" || d.price == null) ? "" : Number(d.price),
             d.goal ? Number(d.goal) : "", d.badge || "", d.hidden ? "yes" : "", d.image || ""];
  if (rowIdx > -1) sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function catalogDelete_(d) {
  var sh = ensureCatalog_(), rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][1]) === String(d.id)) sh.deleteRow(i + 1);
}

/* Public read — what the storefront applies on load. */
function computeCatalog_() {
  var rows = ensureCatalog_().getDataRange().getValues(), out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[1]) continue;
    out.push({ id: String(r[1]), name: r[2] || "", cat: r[3] || "",
               price: (r[4] === "" ? "" : Number(r[4])), goal: r[5] ? Number(r[5]) : "",
               badge: r[6] || "", hidden: r[7] === "yes", image: r[8] || "" });
  }
  return out;
}

/* ---------- POST: log an event, email on pre-order/purchase ---------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (err) {}
  try {
    var data = {};
    try { data = JSON.parse(e.postData.contents); } catch (er) {}
    /* Host Hub catalog edits — require the admin passcode, never logged as events */
    if (data.type === "catalog_upsert" || data.type === "catalog_delete") {
      if (data.token !== ADMIN_TOKEN) return json_({ error: "unauthorized" });
      if (!data.id) return json_({ error: "missing id" });
      if (data.type === "catalog_upsert") catalogUpsert_(data); else catalogDelete_(data);
      return json_({ ok: true });
    }
    /* Host Hub: generate Stripe payment links for the whole catalog */
    if (data.type === "stripe_links_generate") {
      if (data.token !== ADMIN_TOKEN) return json_({ error: "unauthorized" });
      return json_(generatePayLinks_(data.items || []));
    }
    var sh = ensureSheet_();
    var shipStr = "";
    if (data.ship && data.ship.addr) {
      shipStr = [data.ship.name, data.ship.addr, data.ship.city,
                 ((data.ship.state || "") + " " + (data.ship.zip || "")).trim()]
                .filter(Boolean).join(", ");
    }
    sh.appendRow([
      new Date(), data.type || "", data.name || data.product || "", data.cat || "",
      data.price || "", (data.voted === true ? "yes" : (data.voted === false ? "removed" : "")),
      (data.count != null ? data.count : ""), data.qty || "", data.email || "",
      data.vid || "", JSON.stringify(data), "", shipStr
    ]);
    var rowIdx = sh.getLastRow();
    if (data.email) {
      if (data.type === "preorder") {
        /* AUTO-INVOICE: if a STRIPE_KEY is configured, every pre-order
           automatically gets a Stripe invoice (7 days to pay) — no manual step. */
        var inv = null;
        try { inv = autoInvoicePreorder_(data); } catch (er) {}
        if (inv && inv.id) sh.getRange(rowIdx, 12).setValue(inv.id);
        sendPreorderEmail_(data, inv);
        notifyOwner_("New pre-order" + (inv ? " · invoiced " + inv.id : " · NOT auto-invoiced"), data);
      }
      else if (data.type === "purchase") { sendPurchaseEmail_(data); notifyOwner_("New Vendors List order", data); }
    }
    return json_({ ok: true });
  } finally { try { lock.releaseLock(); } catch (er) {} }
}

/* ---------- GET: ping | public counts | private stats ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "counts") return reply_({ counts: computeCounts_() }, p.callback);   // public, safe
  if (p.action === "catalog") return reply_({ catalog: computeCatalog_() }, p.callback); // public, safe
  if (p.action === "paylinks") return reply_({ links: computePayLinks_() }, p.callback); // public, safe (buy.stripe.com URLs)
  if (p.action === "stats") {
    if (p.token !== ADMIN_TOKEN) return reply_({ error: "unauthorized" }, p.callback);
    return reply_(computeStats_(), p.callback);
  }
  return ContentService.createTextOutput(STORE_NAME + " endpoint is live.");
}

/* net votes per piece (public) */
function computeCounts_() {
  var rows = ensureSheet_().getDataRange().getValues(), net = {};
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] === "vote") {
      var name = rows[i][2], v = rows[i][5];
      if (v === "yes") net[name] = (net[name] || 0) + 1;
      else if (v === "removed") net[name] = (net[name] || 0) - 1;
    }
  }
  return net;
}

/* full dashboard data (private) */
function computeStats_() {
  var rows = ensureSheet_().getDataRange().getValues();
  var visits = 0, uniq = {}, totalVotes = 0, net = {}, cat = {}, rs = {},
      preorders = 0, preRev = 0, purchases = 0, purRev = 0,
      voteLog = [], preList = [], salesList = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i], type = r[1], name = r[2], c = r[3],
        price = Number(r[4]) || 0, voted = r[5], qty = Number(r[7]) || 1, email = r[8], vid = r[9];
    if (type === "visit") { visits++; if (vid) uniq[vid] = 1; }
    else if (type === "vote") {
      if (voted === "yes") { totalVotes++; net[name] = (net[name] || 0) + 1; cat[c] = (cat[c] || 0) + 1; }
      else if (voted === "removed") { net[name] = (net[name] || 0) - 1; cat[c] = (cat[c] || 0) - 1; }
      voteLog.push([r[0], name, c, voted, vid]);
    }
    else if (type === "ringsize") {
      if (voted === "yes") rs[name] = (rs[name] || 0) + 1;
      else if (voted === "removed") rs[name] = (rs[name] || 0) - 1;
    }
    else if (type === "preorder") {
      preorders++; preRev += price * qty;
      var psize = ""; try { psize = (JSON.parse(r[10]) || {}).size || ""; } catch (er) {}
      preList.push([r[0], name, qty, email, psize, r[12] || ""]);
    }
    else if (type === "purchase") { purchases++; purRev += price * qty; salesList.push([r[0], name, email, price]); }
  }
  var SZORDER = ["5","5.5","6","6.5","7","7.5","8","8.5","9","9.5","10"];
  var ringSizes = SZORDER.filter(function (s) { return rs[s]; }).map(function (s) { return { size: s, votes: rs[s] }; });
  var pieces = Object.keys(net).map(function (k) { return { name: k, votes: net[k] }; })
    .sort(function (a, b) { return b.votes - a.votes; });
  var cats = Object.keys(cat).map(function (k) { return { cat: k, votes: cat[k] }; })
    .sort(function (a, b) { return b.votes - a.votes; });
  return {
    generated: new Date().toISOString(),
    uniqueVisitors: Object.keys(uniq).length, totalVisits: visits,
    totalVotes: totalVotes, preorders: preorders, preRevenue: round2_(preRev),
    purchases: purchases, purRevenue: round2_(purRev), revenue: round2_(preRev + purRev),
    pieces: pieces, cats: cats, ringSizes: ringSizes,
    voteLog: voteLog.slice(-250).reverse(),
    preList: preList.slice(-100).reverse(),
    salesList: salesList.slice(-100).reverse()
  };
}
function round2_(n) { return Math.round(n * 100) / 100; }

/* ---------- emails ---------- */
function sendPreorderEmail_(d, inv) {
  var sizeLine = d.size ? " · ring size " + d.size : "";
  var invoiceCopy = inv
    ? "<p style='margin:0;color:#9a7;font-size:14px'>Your <b>Stripe invoice</b> is on its way in a separate email — you have <b>up to 7 days</b> to pay it, and your piece locks in the moment it's paid.</p>"
    : "<p style='margin:0;color:#9a7;font-size:14px'>Watch your inbox for your <b>invoice</b> — you'll have <b>up to 7 days</b> to pay it, and your piece locks in the moment it's paid.</p>";
  MailApp.sendEmail({ to: d.email, name: STORE_NAME, subject: STORE_NAME + " — your pre-order is reserved 🩷",
    htmlBody: emailShell_("Your pre-order is reserved 🩷",
      "<p style='margin:0 0 14px'>Thanks for reserving a piece on <b>" + STORE_NAME + "</b>" + escHtml_(sizeLine) + " — you skipped the line and you're first up when it drops.</p>" +
      orderBox_(d.name, d.qty || 1, d.price) +
      (d.ship && d.ship.addr
        ? "<p style='margin:14px 0 0;color:#9a7;font-size:13px'><b>Ships to:</b> " +
          escHtml_([d.ship.name, d.ship.addr, d.ship.city, ((d.ship.state || "") + " " + (d.ship.zip || "")).trim()].filter(function (x) { return x; }).join(", ")) + "</p>"
        : "") +
      "<p style='margin:16px 0 0'>&nbsp;</p>" + invoiceCopy +
      "<p style='margin:12px 0 0;color:#b8a;font-size:13px'>⏳ Popular sizes and high-demand pieces can take a little longer to arrive — we'll keep you posted. Just reply anytime.</p>") });
}
function sendPurchaseEmail_(d) {
  MailApp.sendEmail({ to: d.email, name: STORE_NAME, subject: STORE_NAME + " — your Vendors List order",
    htmlBody: emailShell_("Your Deluxe Vendors List order",
      "<p style='margin:0 0 14px'>Thanks for your order! We'll email your <b>secure payment link</b> and, right after payment, your <b>instant download</b> of the Deluxe Vendors List (15+ vetted vendors + the reseller PDF guide).</p>" +
      orderBox_(d.product || "Deluxe Vendors List", 1, d.price) +
      "<p style='margin:16px 0 0;color:#9a7;font-size:14px'>Questions? Just reply to this email.</p>") });
}
function notifyOwner_(subject, d) {
  if (!OWNER_EMAIL) return;
  try { MailApp.sendEmail(OWNER_EMAIL, "[" + STORE_NAME + "] " + subject,
    (d.name || d.product || "") + " x" + (d.qty || 1) + "\nEmail: " + (d.email || "") +
    "\nPrice: $" + (d.price || "") + "\n\n" + JSON.stringify(d, null, 2)); } catch (err) {}
}
function orderBox_(name, qty, price) {
  return "<table style='width:100%;border-collapse:collapse;background:#fff5fa;border:1px solid #ffd0e6;border-radius:12px'>" +
    "<tr><td style='padding:14px 16px;font-size:16px'><b>" + escHtml_(name) + "</b>" + (qty > 1 ? " &times;" + qty : "") +
    "</td><td style='padding:14px 16px;text-align:right;font-size:16px'>" + (price ? "$" + price : "") + "</td></tr></table>";
}
function emailShell_(title, body) {
  return "<div style='font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#2a1330'>" +
    "<div style='background:linear-gradient(135deg,#e8579b,#a579e6);padding:22px 24px;border-radius:16px 16px 0 0'>" +
    "<div style='color:#fff;font-size:22px;font-weight:800;letter-spacing:.5px'>SPOILED &amp; ICED</div></div>" +
    "<div style='background:#fff;border:1px solid #ffd0e6;border-top:none;padding:24px;border-radius:0 0 16px 16px'>" +
    "<h2 style='margin:0 0 14px;font-size:20px'>" + title + "</h2>" + body +
    "<p style='margin:22px 0 0'><a href='" + STORE_URL + "' style='color:#e8579b;font-weight:bold'>Visit the store →</a></p></div>" +
    "<p style='text-align:center;color:#b8b0c0;font-size:12px;margin:14px 0'>You run the buy. 🩷</p></div>";
}
function escHtml_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

/* =================================================================
 * STRIPE INVOICING — bill a pre-order when the drop lands (STRIPE.md)
 * =================================================================
 * Setup (one time):
 *   1. Stripe Dashboard ▸ Developers ▸ API keys ▸ Create RESTRICTED key
 *      with only: Customers = Write, Invoices = Write. (Use rk_..., never sk_.)
 *   2. Apps Script ▸ Project Settings ▸ Script properties ▸ add
 *      STRIPE_KEY = rk_...   (never paste the key into this file or git)
 *   3. Reload the Google Sheet — a "💎 Spoiled & Iced" menu appears.
 * Use: click any pre-order row ▸ menu ▸ "Send Stripe invoice for selected row".
 * The customer gets a Stripe-hosted "Pay this invoice" email (card, wallets,
 * etc. chosen dynamically — we never restrict payment_method_types).
 *
 * TAX: choosing "Yes" applies Stripe automatic tax. Two things must be true
 * or Stripe silently collects $0 tax: (a) you have an ACTIVE registration in
 * the customer's jurisdiction (Dashboard ▸ Tax ▸ Registrations), and (b) the
 * customer has an address saved in Stripe (Dashboard ▸ Customers) — invoices
 * can't calculate tax from email alone.
 */
var STRIPE_API_VERSION = "2026-06-24.dahlia";

function onOpen() {
  SpreadsheetApp.getUi().createMenu("💎 Spoiled & Iced")
    .addItem("Send Stripe invoice for selected row", "sendStripeInvoiceForSelectedRow")
    .addToUi();
}

function sendStripeInvoiceForSelectedRow() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEET) { ui.alert("Open the '" + SHEET + "' sheet and select a pre-order row first."); return; }
  var row = sh.getActiveRange().getRow();
  if (row < 2) { ui.alert("Select a pre-order row (not the header)."); return; }
  var r = sh.getRange(row, 1, 1, 13).getValues()[0];
  if (r[1] !== "preorder") { ui.alert("That row is a \"" + r[1] + "\" — pick a pre-order row."); return; }
  if (!r[8]) { ui.alert("This row has no customer email."); return; }
  if (r[11]) { ui.alert("Already invoiced (" + r[11] + "). Clear the 'Stripe invoice' cell to re-send."); return; }
  var name = r[2] || "Pre-ordered piece", price = Number(r[4]) || 0,
      qty = Number(r[7]) || 1, email = r[8], size = "", ship = null;
  try { var raw = JSON.parse(r[10]) || {}; size = raw.size || ""; ship = raw.ship || null; } catch (e) {}
  if (!price) { ui.alert("This row has no price — fill in the Price column first."); return; }

  var label = name + " ×" + qty + (size ? " · ring size " + size : "");
  var tax = ui.alert("Send Stripe invoice",
    "Invoice " + email + " for:\n\n" + label + " — $" + (price * qty).toFixed(2) +
    "\n\nApply automatic tax?\n(Yes needs an active Stripe Tax registration AND this " +
    "customer's address saved in Stripe, or the invoice will fail / collect $0 tax.)",
    ui.ButtonSet.YES_NO_CANCEL);
  if (tax === ui.Button.CANCEL || tax === ui.Button.CLOSE) return;

  try {
    var invoice = createAndSendInvoice_(name, price, qty, size, email, tax === ui.Button.YES, ship);
    sh.getRange(row, 12).setValue(invoice.id);
    ui.alert("Invoice sent ✅", email + " just got a Stripe email with a hosted \"Pay this invoice\" page.\nInvoice: " + invoice.id, ui.ButtonSet.OK);
  } catch (err) {
    var msg = String((err && err.message) || err);
    if (msg.indexOf("tax") > -1 && msg.toLowerCase().indexOf("location") > -1)
      msg += "\n\nFix: add this customer's address in Stripe (Dashboard ▸ Customers ▸ " + email +
             "), or re-run and answer \"No\" to automatic tax.";
    ui.alert("Stripe error", msg, ui.ButtonSet.OK);
  }
}

/* Create + send a 7-day Stripe invoice. Used by the automatic pre-order flow
   and the manual Sheet menu. Returns the invoice object.
   `ship` (optional) = {name,addr,city,state,zip} — saved onto the Stripe
   customer so the invoice shows the shipping address and tax CAN be
   calculated once you enable it. */
function createAndSendInvoice_(name, price, qty, size, email, withTax, ship) {
  var label = name + " ×" + qty + (size ? " · ring size " + size : "");
  var found = stripe_("get", "/v1/customers?email=" + encodeURIComponent(email) + "&limit=1");
  var customer = (found.data && found.data[0]) || stripe_("post", "/v1/customers", { email: email });
  if (ship && ship.addr) {
    try {
      stripe_("post", "/v1/customers/" + customer.id, {
        name: ship.name || "",
        "address[line1]": ship.addr, "address[city]": ship.city || "",
        "address[state]": ship.state || "", "address[postal_code]": ship.zip || "",
        "address[country]": "US",
        "shipping[name]": ship.name || email,
        "shipping[address][line1]": ship.addr, "shipping[address][city]": ship.city || "",
        "shipping[address][state]": ship.state || "", "shipping[address][postal_code]": ship.zip || "",
        "shipping[address][country]": "US"
      });
    } catch (er) {} // address save is best-effort — never block the invoice
  }
  var params = {
    customer: customer.id,
    collection_method: "send_invoice",   // hosted pay page — no card data touches us
    days_until_due: "7",
    auto_advance: "false",
    description: "Your " + STORE_NAME + " pre-order — you have up to 7 days to pay. " +
                 "Popular sizes and high-demand pieces can take a little longer to arrive."
  };
  if (withTax) params["automatic_tax[enabled]"] = "true";
  var invoice = stripe_("post", "/v1/invoices", params);
  stripe_("post", "/v1/invoiceitems", {
    customer: customer.id, invoice: invoice.id, currency: "usd",
    amount: String(Math.round(Number(price) * 100) * (Number(qty) || 1)), description: label
  });
  stripe_("post", "/v1/invoices/" + invoice.id + "/send", {});
  return invoice;
}

/* Automatic pre-order invoicing. The customer's shipping address (collected
   in the pre-order form) is saved to Stripe, so automatic tax becomes
   possible: set Script property AUTO_TAX = "yes" once your Stripe Tax
   registration is active. If a taxed invoice fails (bad address, no
   registration), we retry without tax so the customer always gets billed. */
function autoInvoicePreorder_(d) {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("STRIPE_KEY")) return null;
  if (!d.email || !d.price) return null;
  var name = d.name || "Pre-ordered piece", ship = d.ship || null;
  var wantTax = props.getProperty("AUTO_TAX") === "yes" && !!(ship && ship.addr);
  try {
    return createAndSendInvoice_(name, d.price, d.qty || 1, d.size || "", d.email, wantTax, ship);
  } catch (err) {
    if (wantTax) return createAndSendInvoice_(name, d.price, d.qty || 1, d.size || "", d.email, false, ship);
    throw err;
  }
}

/* ================== STRIPE PAYMENT LINKS (per product) ==================
 * The Host Hub ▸ Catalog tab sends the whole catalog here (token-gated).
 * For each piece we create a Price + Payment Link once (re-running skips
 * pieces already linked at the same price, so it's safe to run again —
 * including to finish a partial run). The storefront reads the public
 * map via ?action=paylinks and shows "Buy now" on each piece.
 * Requires STRIPE_KEY to ALSO have: Products = Write, Payment Links = Write.
 */
var PAYLINKS_SHEET = "PayLinks";

function ensurePayLinks_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PAYLINKS_SHEET) || ss.insertSheet(PAYLINKS_SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(["Updated", "ID", "Name", "Price", "Stripe price", "Payment link"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function computePayLinks_() {
  var rows = ensurePayLinks_().getDataRange().getValues(), links = {};
  for (var i = 1; i < rows.length; i++) if (rows[i][1] && rows[i][5]) links[String(rows[i][1])] = String(rows[i][5]);
  return links;
}

function generatePayLinks_(items) {
  var sh = ensurePayLinks_(), rows = sh.getDataRange().getValues();
  var existing = {}; // id -> {row, price}
  for (var i = 1; i < rows.length; i++) if (rows[i][1]) existing[String(rows[i][1])] = { row: i + 1, price: Number(rows[i][3]) };
  var started = Date.now(), created = 0, skipped = 0, errors = [];
  for (var j = 0; j < items.length; j++) {
    var it = items[j] || {};
    if (!it.id || !it.name || !(Number(it.price) > 0)) { skipped++; continue; }
    var ex = existing[String(it.id)];
    if (ex && ex.price === Number(it.price)) { skipped++; continue; }   // already linked at this price
    if (Date.now() - started > 270000) return { partial: true, created: created, skipped: skipped, errors: errors,
      note: "Time limit — run Generate again to finish the rest." };
    try {
      var price = stripe_("post", "/v1/prices", {
        unit_amount: String(Math.round(Number(it.price) * 100)), currency: "usd",
        "product_data[name]": String(it.name).slice(0, 250)
      });
      var link = stripe_("post", "/v1/payment_links", {
        "line_items[0][price]": price.id, "line_items[0][quantity]": "1",
        "line_items[0][adjustable_quantity][enabled]": "true",
        "line_items[0][adjustable_quantity][minimum]": "1",
        "line_items[0][adjustable_quantity][maximum]": "10",
        /* collect the shipping address at checkout so a direct "Buy now"
           gives you everything you need to ship — same data the pre-order
           form captures. */
        "shipping_address_collection[allowed_countries][0]": "US",
        "metadata[piece_id]": String(it.id)
      });
      var row = [new Date(), String(it.id), it.name, Number(it.price), price.id, link.url];
      if (ex) sh.getRange(ex.row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
      created++;
    } catch (err) { errors.push(String(it.id) + ": " + String((err && err.message) || err)); }
  }
  return { ok: true, created: created, skipped: skipped, errors: errors };
}

/* Minimal Stripe REST helper (form-encoded, restricted key from Script properties). */
function stripe_(method, path, params) {
  var key = PropertiesService.getScriptProperties().getProperty("STRIPE_KEY");
  if (!key) throw new Error("Missing STRIPE_KEY. Apps Script ▸ Project Settings ▸ Script properties ▸ add STRIPE_KEY with a restricted key (rk_...).");
  var opts = {
    method: method, muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + key, "Stripe-Version": STRIPE_API_VERSION }
  };
  if (params && method !== "get") opts.payload = params;
  var res = UrlFetchApp.fetch("https://api.stripe.com" + path, opts);
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() >= 300) throw new Error((body.error && body.error.message) || ("Stripe error " + res.getResponseCode()));
  return body;
}

/* ---------- responses ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function reply_(o, cb) {
  var s = JSON.stringify(o);
  if (cb) return ContentService.createTextOutput(cb + "(" + s + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
