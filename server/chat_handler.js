const fs = require("fs");
const path = require("path");
const { invalidateToken } = require("./utils");

const FLOWS_PATH = path.join(__dirname, "..", "flows", "flows.json");
let flows = JSON.parse(fs.readFileSync(FLOWS_PATH, "utf8"));

const sessions = new Map();
const END_CHAT_KEYWORDS = ["end chat", "stop", "close chat"];
const SESSION_MSG_LIMIT = 120;
const MIN_INTER_MESSAGE_MS = 200; // Minimum time between messages

function now() { return Date.now(); }

function touchSession(sessionId) {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { 
      createdAt: now(), 
      lastMessageAt: now(), // FIX: Initialize to now() instead of 0
      messageCount: 0, 
      token: Math.random().toString(36).slice(2,8) 
    };
    sessions.set(sessionId, s);
  }
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
  
  // Get or create session
  const s = touchSession(sessionId);

  // Check message count limit
  if (s.messageCount > SESSION_MSG_LIMIT) {
    clearSession(sessionId);
    return { error: "session_rate_limited", reply: "You've hit the message limit for this session. Start a new chat." };
  }

  // Check for rapid-fire messages (bot detection)
  const currentTime = now();
  const delta = currentTime - (s.lastMessageAt || 0);
  
  // Only check if this is NOT the first message (messageCount > 0)
  if (s.messageCount > 0 && delta < MIN_INTER_MESSAGE_MS) {
    console.log(`⚠️ Rapid messages detected: ${delta}ms between messages`);
    clearSession(sessionId);
    return { error: "automated_activity", reply: "Looks like automated activity. Session closed." };
  }

  // Update session tracking
  s.messageCount = (s.messageCount || 0) + 1;
  s.lastMessageAt = currentTime;

  // Handle end chat
  if (END_CHAT_KEYWORDS.includes(text.trim().toLowerCase())) {
    const tokenId = req && req.body && req.body.token_id;
    clearSession(sessionId, tokenId);
    return { reply: "Session ended. Start again anytime." };
  }

  // Match intent
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
      return { 
        reply: def.response || (flows.global && flows.global.fallback_message), 
        suggested: def.suggested || [] 
      };
    }
  }

  // Fallback
  const fallback = (flows.global && flows.global.fallback_message) || "Sorry, I don't have that information.";
  const support = (flows.global && flows.global.support_block) || {};
  return { 
    reply: `${fallback}\n\nEmail: ${support.email || 'support@investonline.in'}\nPhone: ${support.phone_primary || ''}` 
  };
}

module.exports = { handleChat };
