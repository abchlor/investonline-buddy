/**
 * server/utils.js
 *
 * - createSessionTokenForClient(payload) -> { token, clientKey, expiresAt }
 * - verifyTokenAndPayload(token) -> { payload, clientKey, expiresAt }
 * - verifySignatureWithClientKey(clientKey, timestamp, body, signatureHex) -> boolean
 * - verifyRecaptcha(secret, token) -> score (throws on failure)
 * - rateLimitMiddleware, detectAutomationMiddleware (IP & heuristics)
 *
 * NOTE: This uses an in-memory store `sessionKeyStore` to map tokenId -> clientKey.
 * Replace sessionKeyStore with Redis or your session_store for production.
 */

const crypto = require("crypto");
const fetch = require("node-fetch");

const HMAC_SECRET = process.env.HMAC_SECRET || "";
const ENC_KEY_B64 = process.env.SESSION_ENCRYPTION_KEY || ""; // base64 32 bytes
const SESSION_TTL = parseInt(process.env.SESSION_TOKEN_TTL_SECONDS || "1800", 10) * 1000; // ms

if (!ENC_KEY_B64) {
  console.warn("Warning: SESSION_ENCRYPTION_KEY not set. Tokens will not work correctly.");
}
const ENC_KEY = Buffer.from(ENC_KEY_B64, 'base64'); // 32 bytes expected

// Use the persistent session store instead of in-memory Map
const { getSession, setSession } = require('./session_store');

const sessionKeyStore = {
  async set(tokenId, data) {
    await setSession(`token:${tokenId}`, data);
  },
  async get(tokenId) {
    return await getSession(`token:${tokenId}`);
  },
  async delete(tokenId) {
    await setSession(`token:${tokenId}`, null);
  }
};


// Helpers: AES-GCM encrypt/decrypt for token payload
function aesGcmEncrypt(plaintext) {
  const iv = crypto.randomBytes(12); // 96-bit iv
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  // token format: iv.tag.ciphertext (base64 parts)
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

function aesGcmDecrypt(tokenStr) {
  const parts = tokenStr.split('.');
  if (parts.length !== 3) throw new Error('invalid_token_format');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('utf8');
}

// HMAC sign/verify for token integrity (server-side)
function hmacSign(hexOrBuffer) {
  const h = crypto.createHmac('sha256', HMAC_SECRET);
  h.update(hexOrBuffer);
  return h.digest('hex');
}

// Create a session token and store clientKey mapping
async function createSessionTokenForClient(payloadObj) {
  const now = Date.now();
  const tokenId = crypto.randomBytes(8).toString('hex');
  const expiresAt = now + SESSION_TTL;
  const payload = { tokenId, payload: payloadObj, issuedAt: now, expiresAt };
  const plaintext = JSON.stringify(payload);
  const encrypted = aesGcmEncrypt(plaintext);
  const signature = hmacSign(encrypted);
  const token = `${encrypted}.${signature}`; // final token

  // clientKey: random 32 bytes hex used only between this client and server for request signatures
  const clientKey = crypto.randomBytes(24).toString('hex'); // 48 chars
  // Store mapping
  await sessionKeyStore.set(tokenId, { clientKey, expiresAt, payload: payloadObj });

  // return token and clientKey to client
  return { token, clientKey, expiresAt };
}

// Verify token -> returns { payload, clientKey, expiresAt } or null
async function verifyTokenAndPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const encrypted = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  // verify signature
  const expected = hmacSign(encrypted);
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
    return null;
  }
  // decrypt
  let plaintext;
  try {
    plaintext = aesGcmDecrypt(encrypted);
  } catch (e) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(plaintext);
  } catch (e) {
    return null;
  }
  const tokenId = payload.tokenId;
  const store = await sessionKeyStore.get(tokenId);
  if (!store) return null;
  if (Date.now() > store.expiresAt) {
    await sessionKeyStore.delete(tokenId);
    return null;
  }
  return { payload: payload.payload, clientKey: store.clientKey, expiresAt: store.expiresAt, tokenId };
}

// Verify signature from client using stored clientKey.
// signatureHex expected hex of HMAC-SHA256(`${timestamp}.${bodyString}`) using clientKey.
async function verifySignatureWithClientKey(clientKey, timestamp, body, signatureHex) {
  if (!clientKey || !timestamp || !signatureHex) return false;
  // replay protection: allow 5 minutes skew
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  if (Math.abs(Date.now() - ts) > 1000 * 60 * 5) return false;

  const bodyString = typeof body === 'string' ? body : JSON.stringify(body || {});
  const payload = `${timestamp}.${bodyString}`;
  const h = crypto.createHmac('sha256', clientKey).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(signatureHex, 'hex'));
  } catch (e) {
    return false;
  }
}

/**
 * verifyRecaptcha(secret, token)
 * returns score (throws if failure)
 */
async function verifyRecaptcha(secret, token) {
  if (!secret) {
    const err = new Error('recaptcha not configured');
    err.code = 'RECAPTCHA_MISSING';
    throw err;
  }
  const url = 'https://www.google.com/recaptcha/api/siteverify';
  const params = new URLSearchParams();
  params.append('secret', secret);
  params.append('response', token);
  const resp = await fetch(url, { method: 'POST', body: params });
  if (!resp.ok) throw new Error('recaptcha request failed');
  const data = await resp.json();
  if (!data.success) {
    const err = new Error('recaptcha failed');
    err.code = 'RECAPTCHA_FAIL';
    throw err;
  }
  return data.score || 0;
}

/**
 * Simple IP-based rate limiter (in-memory).
 * Replace with Redis or external store for multiple instances.
 */
const IP_RATE_LIMIT_PER_MIN = parseInt(process.env.IP_RATE_LIMIT_PER_MINUTE || '60', 10);
const IP_RATE_LIMIT_PER_HOUR = parseInt(process.env.IP_RATE_LIMIT_PER_HOUR || '1200', 10);
const ipMap = new Map();
function rateLimitMiddleware() {
  return (req, res, next) => {
    const ip = (req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown').split(',')[0].trim();
    const now = Date.now();
    let rec = ipMap.get(ip);
    if (!rec) rec = { minuteTs: now, hourTs: now, minuteCount: 0, hourCount: 0 };
    if (now - rec.minuteTs > 60000) { rec.minuteTs = now; rec.minuteCount = 0; }
    if (now - rec.hourTs > 3600000) { rec.hourTs = now; rec.hourCount = 0; }
    rec.minuteCount++; rec.hourCount++;
    ipMap.set(ip, rec);
    if (rec.minuteCount > IP_RATE_LIMIT_PER_MIN || rec.hourCount > IP_RATE_LIMIT_PER_HOUR) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}

/**
 * detectAutomationMiddleware: simple heuristics
 */
function detectAutomationMiddleware() {
  return (req, res, next) => {
    const raw = req.body;
    if (raw && typeof raw === 'string' && raw.length > 1500 * 10) {
      return res.status(400).json({ error: 'Payload too large' });
    }
    const ua = (req.headers['user-agent'] || '').toString();
    if (!ua || ua.length < 8) {
      return res.status(403).json({ error: 'Client not allowed' });
    }
    next();
  };
}

// Utility: invalidate tokenId (used for end chat)
async function invalidateToken(tokenId) {
  await sessionKeyStore.delete(tokenId);
}

module.exports = {
  createSessionTokenForClient,
  verifyTokenAndPayload,
  verifySignatureWithClientKey,
  verifyRecaptcha,
  rateLimitMiddleware,
  detectAutomationMiddleware,
  invalidateToken
};
