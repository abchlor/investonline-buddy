const fs = require("fs");
const path = require("path");
const { invalidateToken } = require("./utils");
const { searchKnowledge } = require("./search");

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

  // Check flows.json for predefined responses
  if (flows.intents) {
    for (const [key, def] of Object.entries(flows.intents)) {
      const keywords = def.keywords || [];
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          return { type: "intent", key, def };
        }
      }
    }
  }

  if (flows.site) {
    for (const [key, def] of Object.entries(flows.site)) {
      const keywords = def.keywords || [];
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          return { type: "site", key, def };
        }
      }
    }
  }

  return null;
}

function formatResponse(text) {
  if (!text) return text;
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function getSupportInfo(flows) {
  const support = flows.global?.support_block || {
    email: "wealth@investonline.in",
    phone_primary: "1800-2222-65 (Toll Free)",
    phone_secondary: "+91-22-4071-3333"
  };
  
  return `
<div class="support-info" style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
  <strong>📞 Contact Support:</strong><br><br>
  📧 <strong>Email:</strong> <a href="mailto:${support.email}">${support.email}</a><br>
  📞 <strong>Phone:</strong> ${support.phone_primary}<br>
  ${support.phone_secondary ? `📱 <strong>Mobile:</strong> ${support.phone_secondary}<br>` : ''}
</div>`;
}

function formatSearchResults(results, query, flows) {
  if (!results || results.length === 0) {
    return {
      reply: `I couldn't find specific information about "${query}" on InvestOnline.in.<br><br>
Please contact our support team for assistance:${getSupportInfo(flows)}`,
      suggested: [
        "What is KYC?",
        "How to register?",
        "SIP Calculator",
        "Mutual Funds",
        "Contact Support"
      ],
      sources: []
    };
  }

  // Build response from search results
  let reply = `Here's what I found about "${query}" on InvestOnline.in:<br><br>`;
  
  const sources = [];
  
  results.slice(0, 3).forEach((result, index) => {
    reply += `<div class="search-result" style="margin-bottom: 15px;">
  <strong>${index + 1}. <a href="${result.url}" target="_blank">${result.title}</a></strong><br>
  <p style="margin: 5px 0; color: #555;">${result.snippet}</p>
</div>`;
    
    sources.push({
      title: result.title,
      url: result.url
    });
  });

  reply += `<br><div style="margin-top: 10px; font-size: 0.9em; color: #666;">
💡 <em>Click the links above to learn more</em>
</div>`;

  // Generate relevant suggestions
  const suggested = [
    "Tell me more",
    "SIP Calculator",
    "Contact Support",
    "Mutual Funds",
    "KYC Information"
  ];

  return { reply, suggested, sources };
}

async function handleChat({ session_id, message, page, lang, req }) {
  const text = typeof message === "string" ? message : (message && message.text) || "";
  const sessionId = session_id || `anon_${Math.random().toString(36).slice(2, 8)}`;
  
  const s = touchSession(sessionId);

  // Rate limiting
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

  // Fast path for predefined intents (from flows.json)
  if (simpleMatch && (simpleMatch.type === "intent" || simpleMatch.type === "site")) {
    console.log(`⚡ Fast path for: ${simpleMatch.key}`);
    const def = simpleMatch.def;
    return {
      reply: formatResponse(def.response),
      suggested: (def.suggested || []).slice(0, 5)
    };
  }

  // Search InvestOnline.in website
  try {
    console.log(`🔍 Searching InvestOnline.in for: "${text}"`);
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Search timeout')), 20000) // 20 second timeout
    );
    
    const searchPromise = searchKnowledge(text, 5);
    const results = await Promise.race([searchPromise, timeoutPromise]);
    
    console.log(`✅ Search completed: ${results.length} results`);
    
    return formatSearchResults(results, text, flows);

  } catch (error) {
    console.error("❌ Search failed:", error.message);
    
    return {
      reply: `Sorry, I encountered an issue while searching InvestOnline.in.<br><br>
Please contact our support team:${getSupportInfo(flows)}`,
      suggested: [
        "Try again",
        "Contact Support",
        "What is KYC?",
        "Mutual Funds",
        "SIP Calculator"
      ]
    };
  }
}

module.exports = { handleChat };
