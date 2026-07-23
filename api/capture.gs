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
var OWNER_EMAIL = "avotransportationllc@gmail.com";  // new-order alerts
var STORE_NAME  = "Spoiled & Iced";
var STORE_URL   = "https://spoiled-iced-store.myshopify.com/";
/* =================================================================== */

var SHEET = "Captures";

function ensureSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(["Received", "Type", "Piece / Product", "Category",
                  "Price", "Voted", "Vote count", "Qty", "Email", "Voter ID", "Raw JSON"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------- POST: log an event, email on pre-order/purchase ---------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (err) {}
  try {
    var data = {};
    try { data = JSON.parse(e.postData.contents); } catch (er) {}
    ensureSheet_().appendRow([
      new Date(), data.type || "", data.name || data.product || "", data.cat || "",
      data.price || "", (data.voted === true ? "yes" : (data.voted === false ? "removed" : "")),
      (data.count != null ? data.count : ""), data.qty || "", data.email || "",
      data.vid || "", JSON.stringify(data)
    ]);
    if (data.email) {
      if (data.type === "preorder") { sendPreorderEmail_(data); notifyOwner_("New pre-order", data); }
      else if (data.type === "purchase") { sendPurchaseEmail_(data); notifyOwner_("New Vendors List order", data); }
    }
    return json_({ ok: true });
  } finally { try { lock.releaseLock(); } catch (er) {} }
}

/* ---------- GET: ping | public counts | private stats ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "counts") return reply_({ counts: computeCounts_() }, p.callback);   // public, safe
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
      preList.push([r[0], name, qty, email, psize]);
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
function sendPreorderEmail_(d) {
  MailApp.sendEmail({ to: d.email, name: STORE_NAME, subject: STORE_NAME + " — your pre-order is reserved 🩷",
    htmlBody: emailShell_("Your pre-order is reserved 🩷",
      "<p style='margin:0 0 14px'>Thanks for reserving a piece on <b>" + STORE_NAME + "</b> — you skipped the line and you're first up when it drops.</p>" +
      orderBox_(d.name, d.qty || 1, d.price) +
      "<p style='margin:16px 0 0;color:#8a6' >&nbsp;</p><p style='margin:0;color:#9a7;font-size:14px'>There's <b>no charge yet</b>. We'll email you to complete checkout the moment it's ready. Just reply anytime.</p>") });
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

/* ---------- responses ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function reply_(o, cb) {
  var s = JSON.stringify(o);
  if (cb) return ContentService.createTextOutput(cb + "(" + s + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
