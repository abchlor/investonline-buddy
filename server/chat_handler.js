const fs = require("fs");
const path = require("path");
const { invalidateToken } = require("./utils");

const FLOWS_PATH = path.join(__dirname, "..", "flows", "flows.json");
let flows = JSON.parse(fs.readFileSync(FLOWS_PATH, "utf8"));

const sessions = new Map();
const END_CHAT_KEYWORDS = ["end chat", "stop", "close chat"];
const SESSION_MSG_LIMIT = 120;
const MIN_INTER_MESSAGE_MS = 200;

function now() { return Date.now(); }

function touchSession(sessionId) {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { createdAt: now(), lastMessageAt: 0, messageCount: 0, token: Math.random().toString(36).slice(2,8) };
    sessions.set(sessionId, s);
  }
  s.messageCount = (s.messageCount || 0) + 1;
  s.lastMessageAt = now();
  return s;
}

function clearSession(sessionId, tokenId) {
  sessions.delete(sessionId);
  if (tokenId) {
    try { invalidateToken(tokenId); } catch (e) { /* ignore */ }
  }
}

function matchIntentText(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();
  if (END_CHAT_KEYWORDS.includes(lower.trim())) return { type: "end_chat" };

  const intents = flows.intents || {};
  for (const [key, def] of Object.entries(intents)) {
    const kws = def.keywords || [];
    for (const kw of kws) {
      if (!kw) continue;
      if (lower.includes(kw.toLowerCase())) return { type: "intent", key, def };
    }
  }

  if (flows.site) {
    for (const [k, def] of Object.entries(flows.site)) {
      const kws = def.keywords || [];
      for (const kw of kws) {
        if (!kw) continue;
        if (lower.includes(kw.toLowerCase())) return { type: "site", key: k, def };
      }
    }
  }
  return null;
}

async function handleChat({ session_id, message, page, lang, req }) {
  const text = typeof message === "string" ? message : (message && message.text) || "";
  const sessionId = session_id || `anon_${Math.random().toString(36).slice(2,8)}`;
  const s = touchSession(sessionId);

  if (s.messageCount > SESSION_MSG_LIMIT) {
    clearSession(sessionId);
    return { error: "session_rate_limited", reply: "You've hit the message limit for this session. Start a new chat." };
  }

  const delta = now() - (s.lastMessageAt || 0);
  if (delta < MIN_INTER_MESSAGE_MS) {
    clearSession(sessionId);
    return { error: "automated_activity", reply: "Looks like automated activity. Session closed." };
  }

  if (END_CHAT_KEYWORDS.includes(text.trim().toLowerCase())) {
    // Invalidate the server-side token (if provided in request body)
    const tokenId = req && req.body && req.body.token_id;
    clearSession(sessionId, tokenId);
    return { reply: "Session ended. Start again anytime." };
  }

  const match = matchIntentText(text);
  if (match) {
    if (match.type === "intent") {
      const def = match.def;
      const resp = def.response || "";
      const suggested = def.suggested || [];
      return { reply: resp, suggested };
    }
    if (match.type === "site") {
      const def = match.def;
      return { reply: def.response || (flows.global && flows.global.fallback_message), suggested: def.suggested || [] };
    }
  }

  const fallback = (flows.global && flows.global.fallback_message) || "Sorry, I don't have that information.";
  const support = (flows.global && flows.global.support_block) || {};
  return { reply: `${fallback}\nEmail: ${support.email}\nPhone: ${support.phone_primary}` };
}

module.exports = { handleChat };
