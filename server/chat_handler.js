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

// Quick keyword matching for simple queries (fast path - no GPT needed)
function matchSimpleIntent(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase().trim();
  
  // Check for end chat
  if (END_CHAT_KEYWORDS.some(kw => lower.includes(kw))) {
    return { type: "end_chat" };
  }

  // Very simple queries that don't need GPT
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

// Format response with clickable links
function formatResponse(text) {
  if (!text) return text;
  
  // Convert plain URLs to clickable HTML links
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Get response for simple intents without GPT
function getSimpleResponse(intent, flows) {
  // Check intents
  if (flows.intents && flows.intents[intent]) {
    const def = flows.intents[intent];
    return {
      reply: formatResponse(def.response),
      suggested: (def.suggested || []).slice(0, 5)
    };
  }
  
  // Check site
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
  
  // Get or create session
  const s = touchSession(sessionId);

  // Check message count limit
  if (s.messageCount > SESSION_MSG_LIMIT) {
    clearSession(sessionId);
    return { 
      error: "session_rate_limited", 
      reply: "You've reached the message limit for this session. Please refresh to start a new chat.",
      suggested: []
    };
  }

  // Check for rapid-fire messages (bot detection)
  const currentTime = now();
  const delta = currentTime - (s.lastMessageAt || 0);
  
  // Only check if this is NOT the first message
  if (s.messageCount > 0 && delta < MIN_INTER_MESSAGE_MS) {
    console.log(`⚠️ Rapid messages detected: ${delta}ms between messages for session ${sessionId}`);
    clearSession(sessionId);
    return { 
      error: "automated_activity", 
      reply: "Looks like automated activity. Session closed.",
      suggested: []
    };
  }

  // Update session tracking
  s.messageCount = (s.messageCount || 0) + 1;
  s.lastMessageAt = currentTime;

  // Handle end chat
  const simpleMatch = matchSimpleIntent(text);
  if (simpleMatch && simpleMatch.type === "end_chat") {
    const tokenId = req && req.body && req.body.token_id;
    clearSession(sessionId, tokenId);
    return { 
      reply: "Thanks for chatting with InvestOnline Buddy! Feel free to come back anytime. 👋",
      suggested: []
    };
  }

  // Handle simple intents (fast path - no GPT)
  if (simpleMatch && simpleMatch.type === "simple") {
    console.log(`⚡ Fast path for simple intent: ${simpleMatch.intent}`);
    const response = getSimpleResponse(simpleMatch.intent, flows);
    if (response) {
      return response;
    }
  }

  // Use GPT-4o-mini for intelligent responses (main path)
  try {
    console.log(`🤖 Processing query: "${text.slice(0, 50)}..."`);
    
    // Set a total timeout for the entire operation (25 seconds)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout - please try a simpler question')), 25000)
    );
    
    const responsePromise = getSmartResponse(text, flows);
    
    // Race between response and timeout
    const result = await Promise.race([responsePromise, timeoutPromise]);
    
    // Store in session context for potential follow-ups
    s.context = s.context || [];
    s.context.push({ 
      query: text, 
      response: result.reply.slice(0, 100) // Store truncated response
    });
    if (s.context.length > 5) s.context.shift(); // Keep last 5 interactions
    
    console.log(`✅ Response generated with ${result.suggested.length} suggestions`);
    return result;

  } catch (gptError) {
    console.error("❌ Response generation failed:", gptError.message);
    
    // User-friendly fallback response
    const fallback = (flows.global && flows.global.fallback_message) || 
      "I can help with mutual funds, SIPs, calculators, redemptions, KYC, and registration.";
    
    const support = flows.global?.support_block || {
      email: "wealth@investonline.in",
      phone_primary: "1800-2222-65"
    };
    
    // Determine error type
    let errorMessage = fallback;
    if (gptError.message.includes('timeout')) {
      errorMessage = "⏱️ That's taking a bit long. Let me give you our contact info instead!\n\n" + fallback;
    } else if (gptError.message.includes('API')) {
      errorMessage = "I'm having trouble connecting right now. Here's how to reach our support team:\n\n" + fallback;
    }
    
    const reply = `${errorMessage}\n\n📧 Email: <a href="mailto:${support.email}">${support.email}</a>\n📞 Phone: ${support.phone_primary}`;
    
    return { 
      reply,
      suggested: [
        "What is KYC?",
        "How to register?",
        "SIP Calculator",
        "Top Performing Funds",
        "Talk to Support"
      ]
    };
  }
}

module.exports = { handleChat };
