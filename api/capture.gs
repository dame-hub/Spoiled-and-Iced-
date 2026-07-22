/**
 * Spoiled & Iced — backend (Google Apps Script)
 * ==============================================
 * One free script that powers three things:
 *   1) Logs every visit / vote / pre-order / purchase to a Google Sheet.
 *   2) Emails the customer automatically the moment they pre-order (and
 *      emails YOU a heads-up).
 *   3) Serves private stats to your Host Hub dashboard — but ONLY when
 *      the correct secret passcode is supplied, so nobody else can read
 *      your numbers.
 *
 * SETUP (about 5 minutes) — see README "Host Hub & auto-emails":
 *   1. Create a Google Sheet → Extensions ▸ Apps Script. Paste ALL of this.
 *   2. Edit the three CONFIG values below (passcode + your email + name).
 *   3. Deploy ▸ New deployment ▸ Web app · Execute as: Me · Access: Anyone.
 *      (The first deploy asks you to authorize Gmail sending — allow it.)
 *   4. Copy the /exec URL. Put it in index.html CONFIG.captureUrl, and in
 *      admin.html when it asks (with your passcode).
 */

/* ======================= CONFIG — EDIT THESE ======================= */
var ADMIN_TOKEN = "change-me-to-a-long-secret";   // your Host Hub passcode
var OWNER_EMAIL = "avotransportationllc@gmail.com"; // where new-order alerts go
var STORE_NAME  = "Spoiled & Iced";
var STORE_URL   = "https://spoiled-iced-store.myshopify.com/";
/* =================================================================== */

var SHEET = "Captures";

function ensureSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(["Received", "Type", "Piece / Product", "Category",
                  "Price", "Voted", "Vote count", "Qty", "Email", "Raw JSON"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------- POST: log an event, and email on pre-order/purchase ---------- */
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
      JSON.stringify(data)
    ]);

    if (data.email) {
      if (data.type === "preorder") { sendPreorderEmail_(data); notifyOwner_("New pre-order", data); }
      else if (data.type === "purchase") { sendPurchaseEmail_(data); notifyOwner_("New Vendors List order", data); }
    }
    return json_({ ok: true });
  } finally {
    try { lock.releaseLock(); } catch (er) {}
  }
}

/* ---------- GET: public ping, or token-gated stats (JSONP) ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "stats") {
    if (p.token !== ADMIN_TOKEN) return reply_({ error: "unauthorized" }, p.callback);
    return reply_(computeStats_(), p.callback);
  }
  return ContentService.createTextOutput(STORE_NAME + " endpoint is live.");
}

function computeStats_() {
  var sh = ensureSheet_();
  var rows = sh.getDataRange().getValues();
  var visits = 0, uniq = {}, totalVotes = 0, votesNet = {}, catVotes = {},
      preorders = 0, preRevenue = 0, purchases = 0, purRevenue = 0, recent = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i], type = r[1], name = r[2], cat = r[3],
        price = Number(r[4]) || 0, voted = r[5], qty = Number(r[7]) || 1, email = r[8];
    var raw = {}; try { raw = JSON.parse(r[9]); } catch (er) {}
    if (type === "visit") { visits++; if (raw.visitorId) uniq[raw.visitorId] = 1; }
    else if (type === "vote") {
      if (voted === "yes") { totalVotes++; votesNet[name] = (votesNet[name] || 0) + 1; catVotes[cat] = (catVotes[cat] || 0) + 1; }
      else if (voted === "removed") { votesNet[name] = (votesNet[name] || 0) - 1; catVotes[cat] = (catVotes[cat] || 0) - 1; }
    }
    else if (type === "preorder") { preorders++; preRevenue += price * qty; recent.push([r[0], "Pre-order", name, qty, email]); }
    else if (type === "purchase") { purchases++; purRevenue += price * qty; recent.push([r[0], "Vendors List", name, qty, email]); }
  }
  var top = Object.keys(votesNet).map(function (k) { return { name: k, votes: votesNet[k] }; })
    .filter(function (x) { return x.votes > 0; }).sort(function (a, b) { return b.votes - a.votes; }).slice(0, 10);
  return {
    generated: new Date().toISOString(),
    uniqueVisitors: Object.keys(uniq).length, totalVisits: visits,
    totalVotes: totalVotes, preorders: preorders, preRevenue: Math.round(preRevenue * 100) / 100,
    purchases: purchases, purRevenue: Math.round(purRevenue * 100) / 100,
    revenue: Math.round((preRevenue + purRevenue) * 100) / 100,
    topPieces: top, recent: recent.slice(-15).reverse()
  };
}

/* ---------- emails ---------- */
function sendPreorderEmail_(d) {
  var qty = d.qty || 1;
  var html = emailShell_(
    "Your pre-order is reserved 🩷",
    "<p style='margin:0 0 14px'>Hey! Thanks for reserving a piece on <b>" + STORE_NAME + "</b>. You skipped the line — you're first up when it drops.</p>" +
    orderBox_(d.name, qty, d.price) +
    "<p style='margin:16px 0 0;color:#9aa0ae;font-size:14px'>There's <b>no charge yet</b>. We'll email you to complete checkout the moment it's ready to ship. Reply to this email anytime.</p>"
  );
  MailApp.sendEmail({ to: d.email, subject: STORE_NAME + " — your pre-order is reserved 🩷", htmlBody: html, name: STORE_NAME });
}
function sendPurchaseEmail_(d) {
  var html = emailShell_(
    "Your Deluxe Vendors List order",
    "<p style='margin:0 0 14px'>Thanks for your order! Here's what happens next: we'll email your <b>secure payment link</b> and, right after payment, your <b>instant download</b> of the Deluxe Vendors List.</p>" +
    orderBox_(d.product || "Deluxe Vendors List", 1, d.price) +
    "<p style='margin:16px 0 0;color:#9aa0ae;font-size:14px'>Questions? Just reply to this email.</p>"
  );
  MailApp.sendEmail({ to: d.email, subject: STORE_NAME + " — your Vendors List order", htmlBody: html, name: STORE_NAME });
}
function notifyOwner_(subject, d) {
  if (!OWNER_EMAIL) return;
  try {
    MailApp.sendEmail(OWNER_EMAIL, "[" + STORE_NAME + "] " + subject,
      (d.name || d.product || "") + "  x" + (d.qty || 1) + "\nEmail: " + (d.email || "") +
      "\nPrice: $" + (d.price || "") + "\n\n" + JSON.stringify(d, null, 2));
  } catch (err) {}
}
function orderBox_(name, qty, price) {
  return "<table style='width:100%;border-collapse:collapse;background:#fff5fa;border:1px solid #ffd0e6;border-radius:12px'>" +
    "<tr><td style='padding:14px 16px;font-size:16px'><b>" + escHtml_(name) + "</b>" +
    (qty > 1 ? " &times;" + qty : "") + "</td>" +
    "<td style='padding:14px 16px;text-align:right;font-size:16px'>" + (price ? "$" + price : "") + "</td></tr></table>";
}
function emailShell_(title, body) {
  return "<div style='font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#2a1330'>" +
    "<div style='background:linear-gradient(135deg,#ff3d9a,#b98bff);padding:22px 24px;border-radius:16px 16px 0 0'>" +
    "<div style='color:#fff;font-size:22px;font-weight:800;letter-spacing:.5px'>SPOILED &amp; ICED</div></div>" +
    "<div style='background:#ffffff;border:1px solid #ffd0e6;border-top:none;padding:24px;border-radius:0 0 16px 16px'>" +
    "<h2 style='margin:0 0 14px;font-size:20px'>" + title + "</h2>" + body +
    "<p style='margin:22px 0 0'><a href='" + STORE_URL + "' style='color:#ff3d9a;font-weight:bold'>Visit the store →</a></p>" +
    "</div><p style='text-align:center;color:#b8b0c0;font-size:12px;margin:14px 0'>You run the buy. 🩷</p></div>";
}
function escHtml_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

/* ---------- response helpers ---------- */
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function reply_(obj, callback) {
  var s = JSON.stringify(obj);
  if (callback) return ContentService.createTextOutput(callback + "(" + s + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
