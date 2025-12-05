/**
 * server/utils.js
 *
 * - verifySignature(secret, timestamp, body, signatureHex)
 * - verifyRecaptcha(secret, token)
 * - rateLimitMiddleware()  -> IP-based
 * - detectAutomationMiddleware() -> payload heuristics
 *
 * uses node-fetch
 */

const crypto = require("crypto");
const fetch = require("node-fetch");

const IP_RATE_LIMIT_PER_MIN = parseInt(process.env.IP_RATE_LIMIT_PER_MINUTE || "60", 10);
const IP_RATE_LIMIT_PER_HOUR = parseInt(process.env.IP_RATE_LIMIT_PER_HOUR || "1200", 10);

const ipMap = new Map();

/**
 * verifySignature
 * expects HMAC-SHA256 hex over `${timestamp}.${bodyString}`
 * Returns boolean
 */
function verifySignature(secret, timestamp, body, signatureHex) {
  if (!secret) return false;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  // allow 5 minute skew
  const now = Date.now();
  if (Math.abs(now - ts) > 1000 * 60 * 5) return false;

  const bodyString = typeof body === "string" ? body : JSON.stringify(body || {});
  const payload = `${timestamp}.${bodyString}`;
  const h = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(signatureHex, "hex"));
  } catch (e) {
    return false;
  }
}

/**
 * verifyRecaptcha
 * Returns score (0..1) or throws
 */
async function verifyRecaptcha(secret, token) {
  if (!secret) throw new Error("Recaptcha secret not configured");
  const url = "https://www.google.com/recaptcha/api/siteverify";
  const params = new URLSearchParams();
  params.append("secret", secret);
  params.append("response", token);

  const resp = await fetch(url, { method: "POST", body: params });
  if (!resp.ok) throw new Error("Recaptcha request failed");
  const data = await resp.json();
  if (!data.success) {
    throw new Error("Recaptcha verification failed");
  }
  return data.score || 0;
}

/**
 * rateLimitMiddleware
 * simple IP windowing (in-memory). For production, use Redis.
 */
function rateLimitMiddleware() {
  return (req, res, next) => {
    const ip = (req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress || "unknown").split(",")[0].trim();
    const now = Date.now();
    let rec = ipMap.get(ip);
    if (!rec) {
      rec = { minuteTs: now, hourTs: now, minuteCount: 0, hourCount: 0 };
      ipMap.set(ip, rec);
    }
    // reset windows
    if (now - rec.minuteTs > 60000) {
      rec.minuteTs = now;
      rec.minuteCount = 0;
    }
    if (now - rec.hourTs > 3600000) {
      rec.hourTs = now;
      rec.hourCount = 0;
    }
    rec.minuteCount += 1;
    rec.hourCount += 1;
    if (rec.minuteCount > IP_RATE_LIMIT_PER_MIN || rec.hourCount > IP_RATE_LIMIT_PER_HOUR) {
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}

/**
 * detectAutomationMiddleware
 * lightweight payload and header heuristics
 */
function detectAutomationMiddleware() {
  return (req, res, next) => {
    // payload length
    const raw = req.body;
    if (raw && typeof raw === "string" && raw.length > 1500 * 10) {
      return res.status(400).json({ error: "Payload too large" });
    }
    // suspicious User-Agent (missing or extremely short)
    const ua = (req.headers["user-agent"] || "").toString();
    if (!ua || ua.length < 8) {
      // Strict mode: block if UA is missing
      return res.status(403).json({ error: "Client not allowed" });
    }
    next();
  };
}

module.exports = {
  verifySignature,
  verifyRecaptcha,
  rateLimitMiddleware,
  detectAutomationMiddleware
};
