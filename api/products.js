/* ============================================================
   Spoiled & Iced — AliExpress product feed (serverless backend)
   ------------------------------------------------------------
   Fetches real products + photos from the AliExpress Affiliate API
   and returns them in the shape the voting storefront expects.

   WHY A BACKEND? The AliExpress API requires signing every request
   with your APP SECRET. A secret can never live in browser code, and
   AliExpress doesn't allow calls from a webpage anyway — so this runs
   server-side. Deploy it to Vercel / Netlify / Cloudflare (Node 18+),
   and the storefront calls it at /api/products.

   SETUP (see README for the full walkthrough):
     1. Get approved on the AliExpress Open Platform / Affiliate portal.
     2. Set env vars: ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET,
        ALIEXPRESS_TRACKING_ID.
     3. List the product IDs you want on the ballot in
        products.config.json (or the ALIEXPRESS_PRODUCT_IDS env var).
   ============================================================ */

const crypto = require("crypto");
let CONFIG = { productIds: [], overrides: {}, defaultGoal: 100 };
try { CONFIG = require("../products.config.json"); } catch (e) { /* use defaults */ }

const GATEWAY = process.env.ALIEXPRESS_GATEWAY || "https://api-sg.aliexpress.com/sync";
const APP_KEY = process.env.ALIEXPRESS_APP_KEY || "";
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET || "";
const TRACKING_ID = process.env.ALIEXPRESS_TRACKING_ID || "default";
// "sha256" (HMAC-SHA256, newer IOP gateway) or "md5" (classic TOP style).
// If you get an auth/sign error, flip this — provisioning differs per app.
const SIGN_METHOD = (process.env.ALIEXPRESS_SIGN_METHOD || "sha256").toLowerCase();

const CAT_EMOJI = {
  rings: "💍", necklaces: "💎", bracelets: "🔗",
  earrings: "✨", hellokitty: "🎀", bape: "🦈"
};

/* simple in-memory cache so we don't hammer the API (respects rate limits) */
let cache = { at: 0, data: null };
const CACHE_MS = 10 * 60 * 1000;

/* ---------- request signing ---------- */
function signParams(params, secret, method) {
  const base = Object.keys(params).sort().map(function (k) { return k + params[k]; }).join("");
  if (method === "md5") {
    return crypto.createHash("md5").update(secret + base + secret).digest("hex").toUpperCase();
  }
  return crypto.createHmac("sha256", secret).update(base).digest("hex").toUpperCase();
}

function nowTimestamp(method) {
  if (method === "md5") {
    // "yyyy-MM-dd HH:mm:ss" in GMT+8
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    return d.toISOString().slice(0, 19).replace("T", " ");
  }
  return String(Date.now()); // milliseconds for the IOP gateway
}

/* ---------- category inference (fallback when no override given) ---------- */
function inferCat(title) {
  const t = (title || "").toLowerCase();
  if (/hello kitty|sanrio|\bkitty\b|kuromi|melody/.test(t)) return "hellokitty";
  if (/bape|bathing ape|camo shark|ape head/.test(t)) return "bape";
  if (/earring|\bhoop\b|\bstud\b/.test(t)) return "earrings";
  if (/necklace|pendant|choker|\bchain\b/.test(t)) return "necklaces";
  if (/bracelet|bangle|\btennis\b/.test(t)) return "bracelets";
  if (/\bring\b|signet/.test(t)) return "rings";
  return "rings";
}

/* ---------- call AliExpress ---------- */
async function fetchProducts() {
  const ids = (process.env.ALIEXPRESS_PRODUCT_IDS
    ? process.env.ALIEXPRESS_PRODUCT_IDS.split(",")
    : CONFIG.productIds || []
  ).map(function (s) { return String(s).trim(); }).filter(Boolean);

  if (!APP_KEY || !APP_SECRET) throw new Error("Missing ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET");
  if (!ids.length) throw new Error("No product IDs configured (products.config.json or ALIEXPRESS_PRODUCT_IDS)");

  const params = {
    app_key: APP_KEY,
    method: "aliexpress.affiliate.productdetail.get",
    format: "json",
    v: "2.0",
    sign_method: SIGN_METHOD === "md5" ? "md5" : "sha256",
    timestamp: nowTimestamp(SIGN_METHOD),
    // business params
    product_ids: ids.join(","),
    target_currency: "USD",
    target_language: "EN",
    tracking_id: TRACKING_ID,
    fields: [
      "product_id", "product_title", "target_sale_price", "target_sale_price_currency",
      "product_main_image_url", "product_small_image_urls", "promotion_link",
      "first_level_category_name", "second_level_category_name"
    ].join(",")
  };
  params.sign = signParams(params, APP_SECRET, SIGN_METHOD);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body
  });
  const json = await res.json();
  return json;
}

/* ---------- normalize into the storefront's product shape ---------- */
function normalize(apiJson) {
  // response path: aliexpress_affiliate_productdetail_get_response.resp_result.result.products.product[]
  let list = [];
  try {
    const resp = apiJson.aliexpress_affiliate_productdetail_get_response || apiJson;
    const result = (resp.resp_result && resp.resp_result.result) || resp.result || {};
    list = (result.products && (result.products.product || result.products)) || [];
    if (!Array.isArray(list)) list = [list];
  } catch (e) { list = []; }

  return list.map(function (p) {
    const id = String(p.product_id);
    const ov = (CONFIG.overrides && CONFIG.overrides[id]) || {};
    const title = ov.name || p.product_title || "Untitled piece";
    const cat = ov.cat || inferCat(title + " " + (p.second_level_category_name || ""));
    const imgs = (p.product_small_image_urls && (p.product_small_image_urls.string || p.product_small_image_urls)) || [];
    return {
      id: id,
      name: title,
      cat: cat,
      price: parseFloat(p.target_sale_price || ov.price || 0) || 0,
      base: ov.base != null ? ov.base : 0,
      goal: ov.goal != null ? ov.goal : (CONFIG.defaultGoal || 100),
      badge: ov.badge || null,
      icon: CAT_EMOJI[cat] || "✨",
      src: p.promotion_link || ("https://www.aliexpress.com/item/" + id + ".html"),
      image: p.product_main_image_url || (Array.isArray(imgs) ? imgs[0] : undefined)
    };
  });
}

/* ---------- HTTP handler (Vercel / Netlify / Node) ---------- */
module.exports = async function handler(req, res) {
  // CORS so a Shopify-hosted page can call this cross-origin
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOW_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const debug = (req.query && req.query.debug) || (req.url || "").indexOf("debug=1") > -1;
  try {
    if (!cache.data || Date.now() - cache.at > CACHE_MS) {
      const raw = await fetchProducts();
      const products = normalize(raw);
      if (debug) {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ raw: raw, products: products }, null, 2));
      }
      if (!products.length) {
        // surface the API's own error/message to make setup debugging easy
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ products: [], error: "No products returned", api: raw }));
      }
      cache = { at: Date.now(), data: products };
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.end(JSON.stringify({ products: cache.data }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ products: [], error: String(err && err.message || err) }));
  }
};

module.exports.default = module.exports; // ESM/Vercel interop
