const fs = require("fs");
const path = require("path");
const { invalidateToken } = require("./utils");
const { callOpenAI, generateQuickAnswer } = require("./llm");

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
      conversationHistory: [], // NEW: Track AI conversation history
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
      const synonyms = def.synonyms || [];
      const allKeywords = [...keywords, ...synonyms];
      
      for (const kw of allKeywords) {
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

/**
 * Check for site-specific keywords not in flows.json
 */
function checkSiteKeywords(message) {
  const lowerMsg = message.toLowerCase();
  
  // Registration keywords
  if (/(sign ?up|register|create account|new user|get started|onboard)/i.test(lowerMsg)) {
    return {
      topic: "registration",
      response: "To register with InvestOnline.in, you'll need your PAN card and complete KYC verification. The process is simple and takes just 10 minutes! Would you like me to guide you through it? 😊",
      followUp: ["Start Registration", "What is KYC?", "Documents Needed"]
    };
  }
  
  // Payment/transaction issues
  if (/(payment fail|transaction fail|money not debited|payment not working|payment issue)/i.test(lowerMsg)) {
    return {
      topic: "payment issues",
      response: "For payment issues, please check: 1) Sufficient balance, 2) Daily transaction limit, 3) Correct OTP/CVV. Try using an alternate payment method (UPI/Net Banking). If the problem persists, contact us at 1800-2222-65. 📞",
      followUp: ["Talk to Support", "How to Invest", "SIP Information"]
    };
  }
  
  // Fund recommendations (boundary setting)
  if (/(best fund|top fund|which fund|recommend fund|good fund|suggest fund)/i.test(lowerMsg)) {
    return {
      topic: "fund recommendations",
      response: "I can't recommend specific funds, but I can help you understand fund categories! For personalized recommendations based on your goals and risk profile, please speak with our expert advisors at 1800-2222-65 or wealth@investonline.in. 😊",
      followUp: ["Fund Categories", "Talk to Advisor", "Use SIP Calculator"]
    };
  }
  
  // Login issues
  if (/(can'?t login|login fail|forgot password|account locked|reset password)/i.test(lowerMsg)) {
    return {
      topic: "login issues",
      response: "For login issues: Click 'Forgot Password' to reset, or contact support if your account is locked. Email: wealth@investonline.in | Phone: 1800-2222-65",
      followUp: ["Reset Password", "Talk to Support", "Registration Help"]
    };
  }
  
  // Minimum investment
  if (/(minimum|min) ?(amount|investment|sip)/i.test(lowerMsg)) {
    return {
      topic: "minimum investment",
      response: "You can start a SIP with as low as ₹500 per month! Lumpsum investments typically start from ₹1,000-₹5,000 depending on the scheme. 😊",
      followUp: ["Start SIP", "SIP Calculator", "Fund Categories"]
    };
  }
  
  return null;
}

/**
 * Generate contextual follow-up suggestions
 */
function generateFollowUpSuggestions(userMessage, aiResponse) {
  const lowerMsg = userMessage.toLowerCase();
  const lowerResp = aiResponse.toLowerCase();
  
  // KYC-related
  if (/kyc/i.test(lowerMsg) || /kyc/i.test(lowerResp)) {
    return ["Documents Needed", "e-KYC Process", "Start Registration"];
  }
  
  // SIP-related
  if (/sip/i.test(lowerMsg) || /sip/i.test(lowerResp)) {
    return ["Start SIP", "SIP Calculator", "SIP Benefits"];
  }
  
  // Registration-related
  if (/regist/i.test(lowerMsg) || /regist/i.test(lowerResp)) {
    return ["Start Registration", "What is KYC?", "Documents Needed"];
  }
  
  // Investment-related
  if (/(invest|fund|mutual)/i.test(lowerMsg)) {
    return ["Fund Categories", "Start SIP", "Use Calculator"];
  }
  
  // Default suggestions
  return flows.quickReplies?.slice(0, 3) || ["Start Registration", "What is SIP?", "Talk to Support"];
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
    return { 
      error: "rate_limit", 
      reply: "Please slow down a bit! 😊",
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

  // LAYER 1: Fast path for predefined intents (from flows.json)
  if (simpleMatch && (simpleMatch.type === "intent" || simpleMatch.type === "site")) {
    console.log(`⚡ Fast path (flows.json) for: ${simpleMatch.key}`);
    const def = simpleMatch.def;
    
    // Store in conversation history
    s.conversationHistory.push(
      { role: 'user', content: text },
      { role: 'assistant', content: def.response }
    );
    
    return {
      reply: formatResponse(def.response),
      suggested: (def.suggestions || def.suggested || []).slice(0, 5)
    };
  }

  // LAYER 2: Check for site-specific keywords
  const keywordResponse = checkSiteKeywords(text);
  if (keywordResponse) {
    console.log(`✓ Keyword matched: ${keywordResponse.topic}`);
    
    // Store in conversation history
    s.conversationHistory.push(
      { role: 'user', content: text },
      { role: 'assistant', content: keywordResponse.response }
    );
    
    return {
      reply: formatResponse(keywordResponse.response),
      suggested: keywordResponse.followUp || []
    };
  }

  // LAYER 3: Use OpenAI with full knowledge base
  try {
    console.log(`🤖 Using OpenAI with knowledge base for: "${text}"`);
    
    const context = {
      page: page || 'unknown',
      userStatus: 'guest',
      additionalInfo: ''
    };

    const aiResponse = await callOpenAI(
      text, 
      s.conversationHistory,
      context
    );

    console.log(`✅ OpenAI response generated`);

    // Store conversation in history
    s.conversationHistory.push(
      { role: 'user', content: text },
      { role: 'assistant', content: aiResponse }
    );

    // Keep only last 10 messages to avoid memory issues
    if (s.conversationHistory.length > 10) {
      s.conversationHistory = s.conversationHistory.slice(-10);
    }

    // Generate contextual follow-up suggestions
    const followUps = generateFollowUpSuggestions(text, aiResponse);

    return {
      reply: formatResponse(aiResponse),
      suggested: followUps
    };

  } catch (error) {
    console.error("❌ Error in handleChat:", error.message);
    
    // Friendly error message with support info
    return {
      reply: `I'm having trouble processing that right now. 😅<br><br>Please try rephrasing your question, or contact our support team:${getSupportInfo(flows)}`,
      suggested: ["Talk to Support", "Start Registration", "What is KYC?", "SIP Calculator"]
    };
  }
}

module.exports = { handleChat };
