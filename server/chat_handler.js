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
const QUESTION_LIMIT = 15;

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
      questionCount: 0,
      askedTopics: [], // Track topics for smart suggestions
      context: [],
      conversationHistory: [],
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

/**
 * COMPREHENSIVE INVESTMENT KEYWORDS
 * Covers all mutual fund operations, processes, and services
 */
function isInvestmentRelated(message) {
  const investmentKeywords = [
    // Core Investments
    'invest', 'investment', 'mutual fund', 'mf', 'sip', 'systematic investment plan',
    'stock', 'share', 'equity', 'debt', 'hybrid', 'balanced', 'portfolio', 'fund', 
    'scheme', 'amc', 'asset management', 'nav', 'return', 'dividend', 'growth',
    
    // Financial Terms
    'financial', 'finance', 'money', 'wealth', 'saving', 'asset', 'capital', 'income',
    'profit', 'loss', 'gain', 'risk', 'volatility', 'insurance', 'loan', 'emi', 'credit', 'debit',
    
    // Account & KYC
    'account', 'kyc', 'ekyc', 'e-kyc', 'know your customer', 'pan', 'aadhaar', 'aadhar',
    'register', 'registration', 'login', 'signup', 'sign up', 'onboard', 'onboarding',
    
    // Transactions
    'redeem', 'redemption', 'withdraw', 'withdrawal', 'deposit', 'purchase', 'buy', 'sell',
    'transaction', 'payment', 'switch', 'transfer', 'lumpsum', 'lump sum',
    
    // Planning & Goals
    'retirement', 'goal', 'planning', 'calculator', 'tax', 'elss', 'saving', '80c',
    'child education', 'marriage', 'house', 'car', 'vacation', 'emergency fund',
    
    // Processes & Documentation
    'nomination', 'nominee', 'transmission', 'change nominee', 'update nominee',
    'death claim', 'legal heir', 'succession', 'will', 'beneficiary',
    'change bank', 'update bank', 'bank mandate', 'cancelled cheque',
    'change address', 'update address', 'change email', 'update mobile', 'change phone',
    'statement', 'account statement', 'capital gain', 'folio', 'holding', 'units',
    
    // Fund Types & Categories
    'large cap', 'mid cap', 'small cap', 'multi cap', 'flexi cap', 'sectoral', 'thematic',
    'index fund', 'etf', 'exchange traded fund', 'fof', 'fund of funds',
    'liquid fund', 'ultra short', 'short duration', 'credit risk', 'gilt', 'dynamic bond',
    'arbitrage', 'conservative', 'aggressive', 'balanced advantage',
    
    // Performance & Analysis
    'performance', 'rating', 'star rating', 'rank', 'comparison', 'compare',
    'expense ratio', 'exit load', 'entry load', 'aum', 'assets under management',
    'sharpe ratio', 'alpha', 'beta', 'standard deviation', 'volatility',
    
    // Operations
    'nfo', 'new fund offer', 'ipo', 'dividend', 'payout', 'reinvestment',
    'systematic withdrawal', 'swp', 'systematic transfer', 'stp',
    'step up sip', 'perpetual sip', 'top up', 'pause sip', 'stop sip', 'cancel sip',
    
    // Platform & Support
    'investonline', 'invest online', 'platform', 'website', 'portal', 'app', 'mobile app',
    'support', 'help', 'contact', 'customer care', 'service', 'complaint', 'grievance',
    'advisor', 'wealth advisor', 'relationship manager', 'rm',
    
    // Regulatory & Compliance
    'sebi', 'amfi', 'rbi', 'regulator', 'regulation', 'compliance', 'guidelines',
    'fatca', 'crs', 'pep', 'politically exposed person',
    
    // Documents
    'document', 'upload', 'submit', 'verify', 'proof', 'id proof', 'address proof',
    'signature', 'photo', 'selfie', 'in person verification', 'ipv',
    
    // Fees & Charges
    'fee', 'charge', 'commission', 'brokerage', 'expense', 'cost', 'tds', 'tax deduction',
    
    // Market Related
    'market', 'nifty', 'sensex', 'bse', 'nse', 'stock exchange', 'bull', 'bear',
    'rally', 'crash', 'correction', 'recession', 'inflation', 'interest rate',
    
    // Other Services
    'pms', 'portfolio management', 'advisory', 'research', 'recommendation',
    'alternative investment', 'aif', 'insurance', 'general insurance', 'life insurance',
    
    // Common Queries
    'how to', 'what is', 'where is', 'when to', 'why invest', 'best fund',
    'top fund', 'which fund', 'minimum', 'maximum', 'eligibility', 'eligible'
  ];
  
  const lowerMsg = message.toLowerCase();
  
  // Check if message contains any investment keywords
  return investmentKeywords.some(keyword => lowerMsg.includes(keyword));
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

function getSupportInfo(flows) {
  const support = flows.global?.support_block || {
    email: "wealth@investonline.in",
    phone_primary: "1800-2222-65 (Toll Free)",
    phone_secondary: "+91-22-4071-3333"
  };
  
  return `

📞 Contact Support:

📧 Email: ${support.email}
📞 Phone: ${support.phone_primary}
${support.phone_secondary ? `📱 Mobile: ${support.phone_secondary}` : ''}
`;
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
  
  // Nomination queries
  if (/(nomination|nominee|add nominee|change nominee|update nominee)/i.test(lowerMsg)) {
    return {
      topic: "nomination",
      response: "Nomination allows you to designate who will receive your mutual fund units in case of an unfortunate event.\n\n**How to add/update nominee:**\n1. Login to your account\n2. Go to 'Profile' > 'Nomination'\n3. Add nominee details (Name, Relationship, DOB, % allocation)\n4. Submit\n\nYou can add up to 3 nominees with % allocation.\n\n[Manage Nomination](https://www.investonline.in)",
      followUp: ["Documents for Nomination", "Transmission Process", "Talk to Support"]
    };
  }
  
  // Transmission queries
  if (/(transmission|death claim|legal heir|succession|deceased)/i.test(lowerMsg)) {
    return {
      topic: "transmission",
      response: "Transmission is the process of transferring units to legal heirs/nominees after the unit holder's demise.\n\n**Documents Required:**\n• Death certificate\n• Claimant's ID & address proof\n• Legal heir certificate / Succession certificate (if no nominee)\n• Indemnity bond\n\n**Process:** Submit documents → Verification → Units transferred\n\n📞 For assistance: 1800-2222-65",
      followUp: ["Required Documents", "Talk to Support", "Email Support"]
    };
  }
  
  // Change bank details
  if (/(change bank|update bank|bank mandate|bank account)/i.test(lowerMsg)) {
    return {
      topic: "bank_update",
      response: "To change your registered bank account:\n\n1. Login to your account\n2. Go to 'Profile' > 'Bank Details'\n3. Add new bank account\n4. Upload cancelled cheque/bank statement\n5. Submit for verification\n\n⏱️ Verification takes 2-3 business days.\n\n[Update Bank Details](https://www.investonline.in)",
      followUp: ["Required Documents", "How long verification?", "Talk to Support"]
    };
  }
  
  // Payment/transaction issues
  if (/(payment fail|transaction fail|money not debited|payment not working|payment issue)/i.test(lowerMsg)) {
    return {
      topic: "payment_issues",
      response: "For payment issues, please check:\n\n1. Sufficient account balance\n2. Daily transaction limit\n3. Correct OTP/CVV\n4. Try alternate payment method (UPI/Net Banking)\n\nIf problem persists:\n📞 Call: 1800-2222-65\n📧 Email: wealth@investonline.in",
      followUp: ["Talk to Support", "How to Invest", "Payment Methods"]
    };
  }
  
  // Fund recommendations (boundary setting)
  if (/(best fund|top fund|which fund|recommend fund|good fund|suggest fund)/i.test(lowerMsg)) {
    return {
      topic: "fund_recommendations",
      response: "I can't recommend specific funds, but I can help you understand fund categories and features! 📊\n\nFor personalized recommendations based on your:\n• Financial goals\n• Risk appetite\n• Investment horizon\n\nPlease speak with our expert advisors:\n📞 1800-2222-65\n📧 wealth@investonline.in",
      followUp: ["Fund Categories", "Talk to Advisor", "SIP Calculator", "Top Performing Funds"]
    };
  }
  
  // Login issues
  if (/(can'?t login|login fail|forgot password|account locked|reset password)/i.test(lowerMsg)) {
    return {
      topic: "login_issues",
      response: "**Login Issues?**\n\n1. Click 'Forgot Password' on login page\n2. Enter registered email/mobile\n3. Check email for reset link (also check spam folder)\n4. Create new password\n\nIf account is locked:\n📞 Call: 1800-2222-65\n📧 Email: wealth@investonline.in",
      followUp: ["Reset Password", "Talk to Support", "Registration Help"]
    };
  }
  
  // Minimum investment
  if (/(minimum|min) ?(amount|investment|sip)/i.test(lowerMsg)) {
    return {
      topic: "minimum_investment",
      response: "**Minimum Investment Amounts:**\n\n💰 **SIP:** ₹500 per month\n💰 **Lumpsum:** ₹1,000 - ₹5,000 (varies by scheme)\n\nYou can start your investment journey with as low as ₹500! 😊\n\n[Start SIP Now](https://www.investonline.in/mutual-funds)",
      followUp: ["Start SIP", "SIP Calculator", "Top SIP Funds"]
    };
  }
  
  return null;
}

/**
 * SMART SUGGESTIONS based on conversation history
 */
function generateSmartSuggestions(userMessage, aiResponse, askedTopics) {
  const lowerMsg = userMessage.toLowerCase();
  const lowerResp = aiResponse.toLowerCase();
  
  // Track topics
  let currentTopic = null;
  
  // Determine current topic
  if (/kyc|ekyc/i.test(lowerMsg) || /kyc/i.test(lowerResp)) {
    currentTopic = 'kyc';
  } else if (/sip/i.test(lowerMsg) || /sip/i.test(lowerResp)) {
    currentTopic = 'sip';
  } else if (/regist/i.test(lowerMsg) || /regist/i.test(lowerResp)) {
    currentTopic = 'registration';
  } else if (/fund|mutual/i.test(lowerMsg)) {
    currentTopic = 'funds';
  } else if (/nomin/i.test(lowerMsg)) {
    currentTopic = 'nomination';
  } else if (/redeem|withdraw/i.test(lowerMsg)) {
    currentTopic = 'redemption';
  }
  
  // Add to asked topics
  if (currentTopic && !askedTopics.includes(currentTopic)) {
    askedTopics.push(currentTopic);
  }
  
  // Smart suggestions based on topic progression
  const suggestionMap = {
    'kyc': {
      next: ["Start Registration", "Documents Needed", "How long KYC takes?"],
      related: ["What is PAN?", "What is Aadhaar?"]
    },
    'registration': {
      next: ["Complete KYC", "Start SIP", "Browse Funds"],
      related: ["Minimum investment", "Payment methods"]
    },
    'sip': {
      next: ["SIP Calculator", "Top SIP Funds", "Start SIP"],
      related: ["What is SIP?", "SIP benefits", "Pause SIP"]
    },
    'funds': {
      next: ["Compare Funds", "Top Funds", "Fund Categories"],
      related: ["What is NAV?", "What is expense ratio?"]
    },
    'nomination': {
      next: ["Add Nominee", "Change Nominee", "Transmission Process"],
      related: ["Required documents", "How many nominees?"]
    },
    'redemption': {
      next: ["Redeem Units", "Switch Funds", "Exit Load"],
      related: ["How long redemption?", "Tax implications"]
    }
  };
  
  // Get suggestions for current topic
  if (currentTopic && suggestionMap[currentTopic]) {
    const topicSuggestions = suggestionMap[currentTopic];
    
    // If user has asked about this topic before, show related questions
    if (askedTopics.filter(t => t === currentTopic).length > 1) {
      return topicSuggestions.related;
    }
    
    return topicSuggestions.next;
  }
  
  // Default suggestions
  return flows.quick_replies?.slice(0, 3) || ["How to register?", "Start SIP", "Talk to Support"];
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

  // Topic restriction - only investment-related questions
  if (!isInvestmentRelated(text)) {
    console.log(`⚠️ Off-topic question: "${text}"`);
    return {
      reply: "I'm specialized in helping with mutual fund investments, SIPs, account opening, KYC, nominations, and all investment-related processes on InvestOnline.in. 😊\n\nI can't answer questions outside of investment and finance topics.\n\nHow can I help you with your investments today?",
      suggested: ["How to register?", "Start SIP", "Top Mutual Funds", "Nomination Process", "Contact Support"]
    };
  }

  // Question limit check (15 questions)
  s.questionCount = (s.questionCount || 0) + 1;

  if (s.questionCount > QUESTION_LIMIT) {
    console.log(`⚠️ Question limit exceeded for session: ${sessionId}`);
    return {
      reply: "🎉 **You've used your 15 free questions!**\n\nTo continue chatting and get personalized investment advice:\n\n**Option 1: Register & Get Full Access**\n[Complete Registration](https://www.investonline.in)\n\n**Option 2: Talk to Investment Advisor**\n📞 Call: 1800-2222-65\n\n**Option 3: Request a Callback**\nType 'Request Callback' to share your details",
      suggested: ["Request Callback", "Register Now", "Call Support"],
      question_limit_reached: true
    };
  }

  // Warning at 10 questions
  if (s.questionCount === 10) {
    console.log(`⚠️ 5 questions remaining for session: ${sessionId}`);
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
    
    // Add question limit warning
    let reply = def.response;
    if (s.questionCount === 10) {
      reply += "\n\n⚠️ **Note:** You have 5 questions remaining in this session.";
    }
    
    return {
      reply: reply,
      suggested: (def.suggestions || def.suggested || []).slice(0, 5),
      questions_remaining: QUESTION_LIMIT - s.questionCount
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
    
    // Add question limit warning
    let reply = keywordResponse.response;
    if (s.questionCount === 10) {
      reply += "\n\n⚠️ **Note:** You have 5 questions remaining in this session.";
    }
    
    return {
      reply: reply,
      suggested: keywordResponse.followUp || [],
      questions_remaining: QUESTION_LIMIT - s.questionCount
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

    // Generate smart contextual follow-up suggestions
    const followUps = generateSmartSuggestions(text, aiResponse, s.askedTopics);

    // Add question limit warning
    let reply = aiResponse;
    if (s.questionCount === 10) {
      reply += "\n\n⚠️ **Note:** You have 5 questions remaining in this session.";
    }

    return {
      reply: reply,
      suggested: followUps,
      questions_remaining: QUESTION_LIMIT - s.questionCount
    };

  } catch (error) {
    console.error("❌ Error in handleChat:", error.message);
    
    // Friendly error message with support info
    return {
      reply: `I'm having trouble processing that right now. 😅

Please try rephrasing your question, or contact our support team:${getSupportInfo(flows)}`,
      suggested: ["Talk to Support", "Start Registration", "What is KYC?", "SIP Calculator"],
      questions_remaining: QUESTION_LIMIT - s.questionCount
    };
  }
}

module.exports = { handleChat };
