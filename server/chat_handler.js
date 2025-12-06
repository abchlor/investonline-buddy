const fs = require("fs");
const path = require("path");
const { invalidateToken } = require("./utils");

const FLOWS_PATH = path.join(__dirname, "..", "flows", "flows.json");
let flows = JSON.parse(fs.readFileSync(FLOWS_PATH, "utf8"));

const sessions = new Map();
const END_CHAT_KEYWORDS = ["end chat", "stop", "close chat", "bye", "goodbye"];
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
      context: [], // Store conversation context
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

// ✨ NEW: Fuzzy matching for typos and variations
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // Contains match
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Levenshtein distance (simple version)
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = [];

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1.0 : 1 - (distance / maxLen);
}

// ✨ IMPROVED: Better intent matching with fuzzy logic
function matchIntentText(text, sessionContext = []) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase().trim();
  
  // Check for end chat
  if (END_CHAT_KEYWORDS.some(kw => lower.includes(kw))) {
    return { type: "end_chat" };
  }

  let bestMatch = null;
  let bestScore = 0.5; // Minimum threshold

  // Check intents with fuzzy matching
  const intents = flows.intents || {};
  for (const [key, def] of Object.entries(intents)) {
    const allKeywords = [...(def.keywords || []), ...(def.synonyms || [])];
    
    for (const kw of allKeywords) {
      if (!kw) continue;
      const kwLower = kw.toLowerCase();
      
      // Direct contains match (highest priority)
      if (lower.includes(kwLower)) {
        return { type: "intent", key, def, score: 1.0 };
      }
      
      // Fuzzy match for typos
      const similarity = calculateSimilarity(lower, kwLower);
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = { type: "intent", key, def, score: similarity };
      }
      
      // Check if user message words match keyword words
      const userWords = lower.split(/\s+/);
      const kwWords = kwLower.split(/\s+/);
      for (const uw of userWords) {
        for (const kw of kwWords) {
          const wordSim = calculateSimilarity(uw, kw);
          if (wordSim > 0.75 && wordSim > bestScore) {
            bestScore = wordSim;
            bestMatch = { type: "intent", key, def, score: wordSim };
          }
        }
      }
    }
  }

  // Check site intents
  if (flows.site) {
    for (const [k, def] of Object.entries(flows.site)) {
      const allKeywords = [...(def.keywords || []), ...(def.synonyms || [])];
      
      for (const kw of allKeywords) {
        if (!kw) continue;
        const kwLower = kw.toLowerCase();
        
        if (lower.includes(kwLower)) {
          return { type: "site", key: k, def, score: 1.0 };
        }
        
        const similarity = calculateSimilarity(lower, kwLower);
        if (similarity > bestScore) {
          bestScore = similarity;
          bestMatch = { type: "site", key: k, def, score: similarity };
        }
      }
    }
  }

  return bestMatch;
}

// ✨ NEW: Convert URLs to clickable HTML links
function formatResponseWithLinks(text) {
  if (!text) return text;
  
  // Match URLs and convert to HTML links
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

async function handleChat({ session_id, message, page, lang, req }) {
  const text = typeof message === "string" ? message : (message && message.text) || "";
  const sessionId = session_id || `anon_${Math.random().toString(36).slice(2,8)}`;
  
  const s = touchSession(sessionId);

  // Check message count limit
  if (s.messageCount > SESSION_MSG_LIMIT) {
    clearSession(sessionId);
    return { 
      error: "session_rate_limited", 
      reply: "You've hit the message limit for this session. Please refresh to start a new chat." 
    };
  }

  // Check for rapid-fire messages (only after first message)
  const currentTime = now();
  const delta = currentTime - (s.lastMessageAt || 0);
  
  if (s.messageCount > 0 && delta < MIN_INTER_MESSAGE_MS) {
    console.log(`⚠️ Rapid messages detected: ${delta}ms between messages`);
    clearSession(sessionId);
    return { 
      error: "automated_activity", 
      reply: "Looks like automated activity. Session closed." 
    };
  }

  // Update session tracking
  s.messageCount = (s.messageCount || 0) + 1;
  s.lastMessageAt = currentTime;

  // Handle end chat
  if (END_CHAT_KEYWORDS.some(kw => text.trim().toLowerCase().includes(kw))) {
    const tokenId = req && req.body && req.body.token_id;
    clearSession(sessionId, tokenId);
    return { 
      reply: "Thanks for chatting! Feel free to come back anytime. 👋",
      suggested: []
    };
  }

  // Match intent with context
  const match = matchIntentText(text, s.context || []);
  
  if (match) {
    // Update context
    s.context = s.context || [];
    s.context.push({ query: text, intent: match.key || match.type });
    if (s.context.length > 5) s.context.shift(); // Keep last 5 interactions

    if (match.type === "intent" || match.type === "site") {
      const def = match.def;
      let reply = def.response || "";
      
      // ✨ Format reply with clickable links
      reply = formatResponseWithLinks(reply);
      
      // ✨ Return up to 5 suggestions (not limited to 3)
      const suggested = (def.suggested || []).slice(0, 5);
      
      console.log(`✅ Matched intent: ${match.key} (score: ${match.score?.toFixed(2)})`);
      
      return { reply, suggested };
    }
  }

  // ✨ IMPROVED: Better fallback with helpful suggestions
  console.log(`⚠️ No match found for: "${text}"`);
  
  const fallback = (flows.global && flows.global.fallback_message) || 
    "I can help with mutual funds, SIPs, calculators, redemptions, KYC, and platform questions.";
  
  const support = (flows.global && flows.global.support_block) || {};
  
  const reply = `${fallback}\n\n📧 Email: <a href="mailto:${support.email || 'wealth@investonline.in'}">${support.email || 'wealth@investonline.in'}</a>\n📞 Phone: ${support.phone_primary || '1800-2222-65'}`;
  
  return { 
    reply,
    suggested: [
      "What is KYC?",
      "Start Registration",
      "SIP Calculator",
      "Top Performing Funds",
      "Talk to Support"
    ]
  };
}

module.exports = { handleChat };
