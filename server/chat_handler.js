/**
 * server/chat_handler.js
 *
 * Exports: handleChat({ session_id, message, page, lang })
 *
 * Lightweight intent matcher using flows/flows.json
 * - end-chat
 * - session rate limiting per-session
 * - intent match by keyword includes
 * - fallback -> support block
 *
 * This keeps signature/recaptcha already enforced by index.js middleware.
 */

const fs = require("fs");
const path = require("path");

const FLOWS_PATH = path.join(__dirname, "..", "flows", "flows.json");
let flows = JSON.parse(fs.readFileSync(FLOWS_PATH, "utf8"));

// In-memory session tracking (per-server). If you have session_store, that remains initialized elsewhere.
const sessions = new Map();

const END_CHAT_KEYWORDS = ["end chat", "stop", "close chat"];
const SESSION_MSG_LIMIT = 120; // per session lifetime cap
const MIN_INTER_MESSAGE_MS = 200; // automation detection per-session

function now() {
  return Date.now();
}

function touchSession(sessionId) {
  let s = sessions.get(sessionId);
  if (!s) {
    s = {
      createdAt: now(),
      lastMessageAt: 0,
      messageCount: 0,
      token: Math.random().toString(36).slice(2, 8)
    };
    sessions.set(sessionId, s);
  }
  s.lastMessageAt = now();
  s.messageCount = (s.messageCount || 0) + 1;
  return s;
}

function clearSession(sessionId) {
  sessions.delete(sessionId);
}

function matchIntentText(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();

  // check direct end commands
  if (END_CHAT_KEYWORDS.includes(lower.trim())) {
    return { type: "end_chat" };
  }

  // check flows.intents
  const intents = flows.intents || {};
  for (const [key, def] of Object.entries(intents)) {
    const kws = def.keywords || [];
    for (const kw of kws) {
      if (!kw) continue;
      if (lower.includes(kw.toLowerCase())) {
        return { type: "intent", key, def };
      }
    }
  }

  // check site level
  if (flows.site) {
    for (const [k, def] of Object.entries(flows.site)) {
      const kws = def.keywords || [];
      for (const kw of kws) {
        if (!kw) continue;
        if (lower.includes(kw.toLowerCase())) {
          return { type: "site", key: k, def };
        }
      }
    }
  }

  return null;
}

/**
 * handleChat
 * input:
 *  - session_id: string
 *  - message: string OR { text: string } (existing clients send string)
 *  - page, lang optional
 */
async function handleChat({ session_id, message, page, lang, req }) {
  // normalize message text
  const text = typeof message === "string" ? message : (message && message.text) || "";

  // session basic validation
  const sessionId = session_id || `anon_${Math.random().toString(36).slice(2,8)}`;
  const session = touchSession(sessionId);

  // per-session throttle
  if (session.messageCount > SESSION_MSG_LIMIT) {
    clearSession(sessionId);
    return { error: "session_rate_limited", reply: "You've hit the message limit for this session. Start a new chat." };
  }

  // per-session automation detection: messages too close together
  const delta = now() - (session.lastMessageAt || 0);
  if (delta < MIN_INTER_MESSAGE_MS) {
    clearSession(sessionId);
    return { error: "automated_activity", reply: "Looks like automated activity. Session closed." };
  }

  // End chat handling
  if (END_CHAT_KEYWORDS.includes(text.trim().toLowerCase())) {
    clearSession(sessionId);
    return { reply: "Session ended. Start again anytime." };
  }

  // Intent matching
  const match = matchIntentText(text);
  if (match) {
    if (match.type === "end_chat") {
      clearSession(sessionId);
      return { reply: "Session ended. Start again anytime." };
    }

    if (match.type === "intent") {
      const def = match.def;
      const resp = def.response || "";
      const suggested = def.suggested || [];
      return { reply: resp, suggested };
    }

    if (match.type === "site") {
      const def = match.def;
      return { reply: def.response || flows.global && flows.global.fallback_message, suggested: def.suggested || [] };
    }
  }

  // fallback
  const fallback = (flows.global && flows.global.fallback_message) || "Sorry, I don't have that information.";
  const support = (flows.global && flows.global.support_block) || {};
  return { reply: `${fallback}\nEmail: ${support.email}\nPhone: ${support.phone_primary}` };
}

module.exports = { handleChat };
