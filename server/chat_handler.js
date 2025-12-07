const fs = require("fs");
const path = require("path");
const { invalidateToken } = require("./utils");
const { callOpenAI } = require("./llm");

const FLOWS_PATH = path.join(__dirname, "..", "flows", "flows.json");
let flows = JSON.parse(fs.readFileSync(FLOWS_PATH, "utf8"));

const sessions = new Map();
const END_CHAT_KEYWORDS = ["end chat", "stop", "close chat", "bye", "goodbye", "exit"];
const SESSION_MSG_LIMIT = 120;
const MIN_INTER_MESSAGE_MS = 200;

function now() { return Date.now(); }

function touchSession(sessionId) {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { 
      createdAt: now(), 
      lastMessageAt: now(),
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
  const lower = text.toLowerCase().trim();
  
  if (END_CHAT_KEYWORDS.some(kw => lower.includes(kw))) {
    return { type: "end_chat" };
  }

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

async function handleChat({ session_id, message, page, lang, req }) {
  const text = typeof message === "string" ? message : (message && message.text) || "";
  const sessionId = session_id || `anon_${Math.random().toString(36).slice(2,8)}`;
  
  const s = touchSession(sessionId);

  if (s.messageCount > SESSION_MSG_LIMIT) {
    clearSession(sessionId);
    return { 
      error: "session_rate_limited", 
      reply: "You've reached the message limit for this session. Please refresh to start a new chat.",
      suggested: []
    };
  }

  const currentTime = now();
  const delta = currentTime - (s.lastMessageAt || 0);
  
  if (s.messageCount > 1 && delta < MIN_INTER_MESSAGE_MS) {
    console.log(`⚠️ Rapid messages detected: ${delta}ms`);
    clearSession(sessionId);
    return { 
      error: "automated_activity", 
      reply: "Looks like automated activity. Session closed.",
      suggested: []
    };
  }

  s.messageCount = (s.messageCount || 0) + 1;
  s.lastMessageAt = currentTime;

  const match = matchIntentText(text);
  if (match && match.type === "end_chat") {
    const tokenId = req && req.body && req.body.token_id;
    clearSession(sessionId, tokenId);
    return { 
      reply: "Thanks for chatting with InvestOnline Buddy! Feel free to come back anytime. 👋",
      suggested: []
    };
  }

  if (match) {
    if (match.type === "intent" || match.type === "site") {
      const def = match.def;
      const resp = def.response || "";
      const suggested = (def.suggested || []).slice(0, 5);
      return { reply: resp, suggested };
    }
  }

  // Use OpenAI for general queries
  try {
    console.log(`🤖 Using OpenAI for: "${text.slice(0, 50)}..."`);
    
    let context = "You are InvestOnline Buddy, a helpful financial assistant for InvestOnline.in.\n\n";
    context += "Available services:\n";
    
    const intents = flows.intents || {};
    Object.entries(intents).forEach(([key, def]) => {
      if (def.response) {
        context += `- ${key}: ${def.response.slice(0, 100)}...\n`;
      }
    });
    
    context += "\nAnswer briefly (under 150 words). Be helpful and professional.";
    
    const prompt = `${context}\n\nUser question: ${text}\n\nYour answer:`;
    
    const answer = await callOpenAI(prompt);
    
    const suggested = [
      "What is KYC?",
      "How to register?",
      "SIP Calculator",
      "Talk to Support"
    ];
    
    return { 
      reply: answer,
      suggested
    };

  } catch (error) {
    console.error("❌ OpenAI error:", error.message);
    
    const fallback = (flows.global && flows.global.fallback_message) || 
      "I can help with mutual funds, SIPs, calculators, KYC, and registration. 💰";
    
    const support = flows.global?.support_block || {
      email: "wealth@investonline.in",
      phone_primary: "1800-2222-65"
    };
    
    const reply = `${fallback}<br><br>📧 Email: ${support.email}<br>📞 Phone: ${support.phone_primary}`;
    
    return { 
      reply,
      suggested: [
        "What is KYC?",
        "How to register?",
        "SIP Calculator",
        "Talk to Support"
      ]
    };
  }
}

module.exports = { handleChat };
