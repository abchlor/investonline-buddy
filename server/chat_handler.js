const fs = require("fs");
const path = require("path");
const { invalidateToken } = require("./utils");
const { getSmartResponse } = require("./llm");

const FLOWS_PATH = path.join(__dirname, "..", "flows", "flows.json");
let flows = JSON.parse(fs.readFileSync(FLOWS_PATH, "utf8"));

const sessions = new Map();
const END_CHAT_KEYWORDS = ["end chat", "stop", "close chat", "bye", "goodbye", "exit"];
const SESSION_MSG_LIMIT = 120;
const MIN_INTER_MESSAGE_MS = 200;

function now() { 
  return Date.now(); 
}

function touchSession(sessionId) {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { 
      createdAt: now(), 
      lastMessageAt: now(),
      messageCount: 0, 
      context: [],
      token: Math.random().toString(36).slice(2, 8) 
    };
    sessions.set(sessionId, s);
  }
  return s;
}

function clearSession(sessionId, tokenId) {
  sessions.delete(sessionId);
  if (tokenId) {
    try { 
      invalidateToken(tokenId); 
    } catch (e) { 
      console.error("Error invalidating token:", e);
    }
  }
}

// Quick keyword matching for simple queries (fast path)
function matchSimpleIntent(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase().trim();
  
  if (END_CHAT_KEYWORDS.some(kw => lower.includes(kw))) {
    return { type: "end_chat" };
  }

  const simpleMatches = {
    "email": "email_support",
    "email support": "email_support",
    "mail": "email_support",
    "call": "call_support",
    "phone": "call_support",
    "call support": "call_support",
    "phone number": "call_support",
    "contact": "contact",
    "help": "contact"
  };

  for (const [keyword, intent] of Object.entries(simpleMatches)) {
    if (lower === keyword) {
      return { type: "simple", intent };
    }
  }

  return null;
}

function formatResponse(text) {
  if (!text) return text;
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function getSimpleResponse(intent, flows) {
  if (flows.intents && flows.intents[intent]) {
    const def = flows.intents[intent];
    return {
      reply: formatResponse(def.response),
      suggested: (def.suggested || []).slice(0, 5)
    };
  }
  
  if (flows.site && flows.site[intent]) {
    const def = flows.site[intent];
    return {
      reply: formatResponse(def.response),
      suggested: (def.suggested || []).slice(0, 5)
    };
  }
  
  return null;
}

async function handleChat({ session_id, message, page, lang, req }) {
  const text = typeof message === "string" ? message : (message && message.text) || "";
  const sessionId = session_id || `anon_${Math.random().toString(36).slice(2, 8)}`;
  
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
  
  if (s.messageCount > 0 && delta < MIN_INTER_MESSAGE_MS) {
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

  const simpleMatch = matchSimpleIntent(text);
  if (simpleMatch && simpleMatch.type === "end_chat") {
    const tokenId = req && req.body && req.body.token_id;
    clearSession(sessionId, tokenId);
    return { 
      reply: "Thanks for chatting with InvestOnline Buddy! Feel free to come back anytime. 👋",
      suggested: []
    };
  }

  if (simpleMatch && simpleMatch.type === "simple") {
    console.log(`⚡ Fast path for: ${simpleMatch.intent}`);
    const response = getSimpleResponse(simpleMatch.intent, flows);
    if (response) {
      return response;
    }
  }

  // Use GPT with reduced timeout (15 seconds total)
  try {
    console.log(`🤖 Processing: "${text.slice(0, 50)}..."`);
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), 15000) // Reduced from 25s to 15s
    );
    
    const responsePromise = getSmartResponse(text, flows);
    
    const result = await Promise.race([responsePromise, timeoutPromise]);
    
    s.context = s.context || [];
    s.context.push({ query: text, response: result.reply.slice(0, 100) });
    if (s.context.length > 5) s.context.shift();
    
    console.log(`✅ Response ready`);
    return result;

  } catch (gptError) {
    console.error("❌ Response failed:", gptError.message);
    
    const fallback = (flows.global && flows.global.fallback_message) || 
      "I can help with mutual funds, SIPs, calculators, KYC, and registration. 💰";
    
    const support = flows.global?.support_block || {
      email: "wealth@investonline.in",
      phone_primary: "1800-2222-65"
    };
    
    const reply = `${fallback}<br><br><div class="contact-info">📧 Email: <a href="mailto:${support.email}">${support.email}</a></div><div class="contact-info">📞 Phone: ${support.phone_primary}</div>`;
    
    return { 
      reply,
      suggested: [
        "What is KYC?",
        "How to register?",
        "SIP Calculator",
        "Top Funds",
        "Talk to Support"
      ]
    };
  }
}

module.exports = { handleChat };
