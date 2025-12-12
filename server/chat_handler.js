// ====================================
// chat_handler_ALL_ISSUES_FIXED.js
// VERSION: v5 - Complete Fix for ALL Issues
// Fixed: Language auto-switching, WhatsApp number, 404 links, repetitive suggestions
// ====================================

const fs = require('fs');
const path = require('path');
const { search } = require('./search');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load knowledge base
const flows = require('../flows/flows.json');

// Constants
const QUESTION_LIMIT = 15;
const QUESTION_WARNING_THRESHOLD = 10;

// InvestOnline URLs
const INVESTONLINE_URLS = {
  register: 'https://www.investonline.in/features/register-with-pan-card', // ✅ CORRECTED
  login: 'https://www.investonline.in/login',
  topFunds: 'https://www.investonline.in/mutual-funds/top-performing-funds',
  largeCap: 'https://www.investonline.in/mutual-funds/large-cap-funds',
  midCap: 'https://www.investonline.in/mutual-funds/mid-cap-funds',
  smallCap: 'https://www.investonline.in/mutual-funds/small-cap-funds',
  elss: 'https://www.investonline.in/mutual-funds/tax-saving-elss',
  compareFunds: 'https://www.investonline.in/mutual-funds/compare-schemes',
  sipCalculator: 'https://www.investonline.in/financial-calculators/sip-calculator',
  calculators: 'https://www.investonline.in/financial-calculators/calculators',
  magazine: 'https://www.investonline.in/magazine/investguide',
  contact: 'https://www.investonline.in/contact-us',
  // ✅ NEW FEATURE URLs
  whoHoldsWhat: 'https://www.investonline.in/mutual-funds/who-holds-what',
  goalPlanning: 'https://www.investonline.in/features/goal-planning',
  diyPortfolio: 'https://www.investonline.in/features/do-it-yourself-portfolio',
  portfolioAlerts: 'https://www.investonline.in/features/portfolio-triggers-and-alerts',
  fundsExplorer: 'https://www.investonline.in/mutual-funds/funds-explorer',
};

// FIXED: Correct WhatsApp number
const SUPPORT_INFO = {
  phone: '1800-2222-65',
  phoneDirect: '+91-22-4071-3333',
  email: 'wealth@investonline.in',
  whatsapp: '+91-77770-24447', // ✅ FIXED: Was +91-9820119909
};

// ====================================
// FIXED: Enhanced Intent Matching with Category Awareness
// ====================================
function matchIntentWithCategory(userMessage) {
  const msg = userMessage.toLowerCase();
  
  // Category keywords for fund types
  const categoryMap = {
    'large cap': ['large cap', 'largecap', 'blue chip', 'large-cap'],
    'mid cap': ['mid cap', 'midcap', 'mid-cap'],
    'small cap': ['small cap', 'smallcap', 'small-cap'],
    'flexi cap': ['flexi cap', 'flexicap', 'flexi-cap'],
    'elss': ['elss', 'tax saving', 'tax saver', '80c'],
    'debt': ['debt fund', 'debt', 'fixed income'],
    'index': ['index fund', 'index', 'passive'],
    'etf': ['etf', 'exchange traded'],
  };

  // Check for each intent in flows.json
  for (const intent of flows.intents) {
    const keywords = intent.keywords || [];
    
    // Check if any keyword matches
    const keywordMatch = keywords.some(kw => msg.includes(kw.toLowerCase()));
    
    if (keywordMatch) {
      // Check for category-specific requests
      let detectedCategory = null;
      for (const [category, patterns] of Object.entries(categoryMap)) {
        if (patterns.some(pattern => msg.includes(pattern))) {
          detectedCategory = category;
          break;
        }
      }
      
      return {
        intent: intent.intent,
        response: intent.response,
        suggestions: intent.suggestions || [],
        category: detectedCategory,
        urls: intent.urls || [],
      };
    }
  }
  
  return null;
}

// ====================================
// FIXED: Smart Contextual Suggestions (Avoid Repetition)
// ====================================
function getContextualSuggestions(intent, language = 'en', conversationHistory = []) {
  const suggestionMap = {
    // SIP related
    'sip': ['SIP Calculator', 'Types of SIP', 'Top SIP funds', 'Modify SIP'],
    'sip_calculator': ['Start SIP now', 'Step-up SIP', 'SIP vs Lumpsum', 'Best SIP funds'],
    'sip_modify': ['SIP Calculator', 'Pause SIP', 'Step-up SIP', 'Stop SIP'],
    'sip_pause': ['Resume SIP', 'Modify SIP', 'Reduce SIP amount', 'Why continue SIP?'],
    'step_up_sip': ['SIP Calculator', 'How much to invest?', 'Goal planning', 'Start SIP'],
    
    // Fund categories
    'large_cap': ['Mid Cap funds', 'Compare funds', 'Top performing funds', 'SIP in Large Cap'],
    'mid_cap': ['Large Cap funds', 'Small Cap funds', 'Top performing funds', 'Compare funds'],
    'small_cap': ['Mid Cap funds', 'Risk in Small Cap', 'SIP in Small Cap', 'Diversification'],
    'elss': ['Tax benefits', 'Lock-in period', 'Top ELSS funds', '80C deduction'],
    
    // Investment concepts
    'nav': ['Expense Ratio', 'Exit Load', 'How to invest?', 'Fund performance'],
    'expense_ratio': ['NAV', 'Compare funds', 'Low cost funds', 'Hidden charges'],
    'exit_load': ['NAV', 'Lock-in period', 'Redemption process', 'When to exit'],
    'lock_in': ['Exit load', 'ELSS', 'Redemption', 'Tax implications'],
    'aum': ['Fund size', 'NAV', 'Fund performance', 'Large vs Small funds'],
    
    // Account & KYC
    'kyc': ['Documents needed', 'e-KYC process', 'KYC status', 'Registration benefits'],
    'registration': ['Complete KYC', 'Start investing', 'First SIP', 'Registration benefits'],
    'registration_benefits': ['How to register?', 'KYC process', 'First investment', 'Account features'],
    'documents_needed': ['Complete KYC', 'Upload documents', 'KYC status', 'Registration'],
    
    // Transactions
    'redemption': ['Exit load', 'Switch funds', 'Tax on redemption', 'Processing time'],
    'switch': ['Rebalancing', 'Exit load', 'Tax implications', 'Best time to switch'],
    'transmission': ['Add nominee', 'Required documents', 'Transmission timeline', 'Legal heir'],
    
    // Top funds
    'top_funds': ['Compare funds', 'Large Cap funds', 'SIP Calculator', 'Start investing'],
    
    // Calculators
    'retirement_calculator': ['SIP Calculator', 'Asset Allocation', 'Goal Planning', 'Retirement planning'],
    'asset_allocation': ['Risk Profile', 'Portfolio Review', 'Retirement Planning', 'Diversification'],
    'compounding_calculator': ['SIP Calculator', 'Goal planning', 'Power of compounding', 'Long-term investing'],
    'goal_based_sip': ['SIP Calculator', 'Retirement calculator', 'How much to invest?', 'Goal tracking'],
    
    // Magazine & Tools
    'invest_guide': ['Latest articles', 'Investment tips', 'Market insights', 'Top funds'],
    'compare_funds': ['Fund comparison', 'Top performing funds', 'Risk comparison', 'Expense ratio'],
    
    // Processes
    'nomination': ['How to add?', 'Multiple nominees', 'Minor nominee', 'Change nominee'],
    'mandate': ['Start SIP', 'e-Mandate', 'Mandate rejection', 'Change bank'],
    'payment_failed': ['Retry payment', 'Register mandate', 'Change bank', 'SIP missed'],
    'statement': ['Capital gains report', 'Tax statement', 'Portfolio value', 'Transaction history'],
    'capital_gains': ['Tax calculator', 'ELSS funds', 'Tax saving', 'Download report'],
    
    // SWP/STP
    'swp': ['SWP Calculator', 'Best funds for SWP', 'Retirement planning', 'Tax on SWP'],
    'stp': ['How to start STP?', 'STP vs Lumpsum', 'Best time for STP', 'STP Calculator'],
    
    // Dividend & Folio
    'dividend': ['Growth vs Dividend', 'SWP alternative', 'Dividend tax', 'Best option?'],
    'folio': ['View my folios', 'Consolidate folios', 'Folio statement', 'Contact support'],
    
    // NFO & Bank
    'nfo': ['Top performing funds', 'How to choose funds?', 'NAV meaning', 'Fund performance'],
    'bank_change': ['Register mandate', 'Primary bank', 'Add secondary bank', 'Verification pending'],
    
    // Contact
    'contact': ['Registration help', 'Transaction issue', 'Account query', 'Investment advice'],
  };

  // Get suggestions for this intent
  let suggestions = suggestionMap[intent] || [
    'Top Mutual Funds',
    'SIP Calculator', 
    'Compare Funds',
    'Contact Support'
  ];

  // FIXED: Avoid repetitive suggestions by tracking conversation
  if (conversationHistory && conversationHistory.length > 0) {
    // Get recently used suggestions
    const recentSuggestions = conversationHistory
      .slice(-4) // Last 4 exchanges
      .filter(h => h.suggestions)
      .flatMap(h => h.suggestions || []);
    
    // Filter out recently shown suggestions
    const freshSuggestions = suggestions.filter(s => !recentSuggestions.includes(s));
    
    // If we filtered too many, add some fallback suggestions
    if (freshSuggestions.length < 2) {
      const fallbackSuggestions = [
        'All Calculators',
        'Invest Guide Magazine',
        'Retirement Planning',
        'Asset Allocation',
        'Compare Funds',
        'Contact Support'
      ].filter(s => !recentSuggestions.includes(s));
      
      suggestions = [...freshSuggestions, ...fallbackSuggestions].slice(0, 4);
    } else {
      suggestions = freshSuggestions.slice(0, 4);
    }
  }

  return suggestions.slice(0, 4); // Max 4 suggestions
}

// ====================================
// FIXED: Enhanced Response with CTAs (Only Valid URLs)
// ====================================
function enhanceResponseWithCTA(response, intent, category = null, urls = []) {
  let enhanced = response;
  
  // Add category-specific URL if available
  if (category) {
    if (category === 'large cap' && !enhanced.includes(INVESTONLINE_URLS.largeCap)) {
      enhanced += `\n\n**[Explore Large Cap Funds →](${INVESTONLINE_URLS.largeCap})**`;
    } else if (category === 'mid cap' && !enhanced.includes(INVESTONLINE_URLS.midCap)) {
      enhanced += `\n\n**[Explore Mid Cap Funds →](${INVESTONLINE_URLS.midCap})**`;
    } else if (category === 'small cap' && !enhanced.includes(INVESTONLINE_URLS.smallCap)) {
      enhanced += `\n\n**[Explore Small Cap Funds →](${INVESTONLINE_URLS.smallCap})**`;
    } else if (category === 'elss' && !enhanced.includes(INVESTONLINE_URLS.elss)) {
      enhanced += `\n\n**[Explore ELSS Funds →](${INVESTONLINE_URLS.elss})**`;
    }
  }
  
  // Add general CTAs based on intent
  if (intent === 'sip_calculator' && !enhanced.includes(INVESTONLINE_URLS.sipCalculator)) {
    enhanced += `\n\n**[Calculate SIP Returns →](${INVESTONLINE_URLS.sipCalculator})**`;
  } else if (intent === 'top_funds' && !enhanced.includes(INVESTONLINE_URLS.topFunds)) {
    enhanced += `\n\n**[View Top Funds →](${INVESTONLINE_URLS.topFunds})**`;
  } else if ((intent === 'retirement_calculator' || intent === 'asset_allocation' || intent === 'compounding_calculator' || intent === 'goal_based_sip') && !enhanced.includes(INVESTONLINE_URLS.calculators)) {
    enhanced += `\n\n**[Try Calculator →](${INVESTONLINE_URLS.calculators})**`;
  } else if (intent === 'invest_guide' && !enhanced.includes(INVESTONLINE_URLS.magazine)) {
    enhanced += `\n\n**[Read Invest Guide →](${INVESTONLINE_URLS.magazine})**`;
  } else if (intent === 'compare_funds' && !enhanced.includes(INVESTONLINE_URLS.compareFunds)) {
    enhanced += `\n\n**[Compare Funds →](${INVESTONLINE_URLS.compareFunds})**`;
  }
  
  // FIXED: Only add "Learn More" if URL is valid and not already added
  if (!enhanced.match(/\[.*→\]/) && urls && urls.length > 0 && urls[0] && urls[0].startsWith('http')) {
    enhanced += `\n\n**[Learn More →](${urls[0]})**`;
  }
  
  return enhanced;
}

// ====================================
// Translation function (Unchanged)
// ====================================
async function translateText(text, targetLanguage) {
  if (targetLanguage === 'en') return text;

  const languageNames = {
    hi: 'Hindi',
    mr: 'Marathi',
    gu: 'Gujarati',
    ta: 'Tamil',
  };

  try {
    console.log(`🌐 Translating response to ${languageNames[targetLanguage]}...`);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator for InvestOnline, an Indian mutual fund investment platform.

TRANSLATION RULES:
1. Translate the text to ${languageNames[targetLanguage]}
2. Keep ALL URLs, markdown formatting [text](url), and **bold** syntax EXACTLY as is
3. Keep ALL numbers, percentages, and financial terms in their original form
4. Keep brand names like "InvestOnline" unchanged
5. Keep financial terms like "NAV", "SIP", "KYC", "ELSS" in English
6. Translate only the natural language text
7. Maintain all newlines and formatting
8. Keep emojis unchanged

EXAMPLE:
Input: "NAV stands for **Net Asset Value**. [Learn More](https://url)"
Output: "NAV का मतलब है **Net Asset Value**। [और जानें](https://url)"`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.3,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('❌ Translation error:', error.message);
    return text; // Return original if translation fails
  }
}

// ====================================
// Detect if message is investment-related
// ====================================
function isInvestmentRelated(message) {
  const msg = message.toLowerCase();
  
  const investmentKeywords = [
    // Core investment terms
    'mutual fund', 'sip', 'invest', 'portfolio', 'return', 'nav', 'aum',
    'expense ratio', 'exit load', 'scheme', 'fund', 'equity', 'debt',
    
    // Fund categories
    'large cap', 'mid cap', 'small cap', 'flexi cap', 'index', 'etf',
    'elss', 'tax saving', 'liquid', 'gilt', 'balanced', 'hybrid',
    
    // Investment actions
    'buy', 'sell', 'redeem', 'switch', 'lumpsum', 'stp', 'swp',
    'systematic', 'top up', 'pause', 'cancel', 'modify',
    'redemption', 'transmission', 'withdrawal',
    
    // Account & KYC
    'account', 'kyc', 'register', 'login', 'profile', 'nominee',
    'bank', 'mandate', 'ekyc', 'aadhar', 'pan', 'document',
    'registration', 'benefits of registration', 'why register',
    
    // Queries
    'how to', 'what is', 'which fund', 'best fund', 'top fund',
    'compare', 'calculator', 'status', 'track', 'statement',
    
    // Issues
    'payment', 'failed', 'pending', 'rejected', 'error', 'problem',
    'help', 'support', 'contact',
    
    // Hinglish/Hindi
    'निवेश', 'म्यूचुअल फंड', 'केवाईसी', 'रजिस्टर' 'एसेट', 'पोर्टफोलियो', 'योजना', 'फंड',
    'kaise', 'kya hai', 'chahiye', 'banao', 'shuru',

    // ✅ NEW KEYWORDS:
    'asset allocation', 'allocation', 'diversification', 'rebalancing',
    'portfolio mix', 'asset distribution', 'investment strategy',
    'wealth', 'savings', 'goals', 'retirement', 'planning',
    'risk', 'returns', 'performance', 'analysis', 'comparison',
    'top funds', 'best funds', 'calculator', 'nfo', 'ipo',
  ];

  const msg = message.toLowerCase();
  return investmentKeywords.some(keyword => msg.includes(keyword));
}

// ====================================
// Main Chat Handler
// ====================================
async function handleChat({ sessionId, message, page, language = 'en', SESSION_STORE }) {
  console.log(`\n📨 [${sessionId}] Message: "${message}" | Language: ${language}`);

  const session = SESSION_STORE.get(sessionId);
  if (!session) {
    return {
      error: 'invalid_session',
      reply: 'Session expired. Please refresh the page.',
    };
  }

  // Initialize conversation history with suggestions tracking
  if (!session.conversationHistory) {
    session.conversationHistory = [];
  }

  // Increment question count
  session.questionCount = (session.questionCount || 0) + 1;
  session.language = language;

  // Check question limit
  if (session.questionCount > QUESTION_LIMIT) {
    const limitMessage = language === 'en' 
      ? `🎯 You've asked ${QUESTION_LIMIT} questions! To continue getting personalized investment advice, please register or sign in.\n\n**Benefits of Registration:**\n• Unlimited queries\n• Personalized portfolio tracking\n• Direct investment facility\n• Priority support\n\n**[Register Now →](${INVESTONLINE_URLS.register})** | **[Sign In →](${INVESTONLINE_URLS.login})**\n\nOr contact our team:\n📞 ${SUPPORT_INFO.phone}\n📧 ${SUPPORT_INFO.email}\n💬 WhatsApp: ${SUPPORT_INFO.whatsapp}`
      : await translateText(`You've asked ${QUESTION_LIMIT} questions! To continue getting personalized investment advice, please register or sign in.\n\nBenefits of Registration:\n• Unlimited queries\n• Personalized portfolio tracking\n• Direct investment facility\n• Priority support\n\n[Register Now](${INVESTONLINE_URLS.register}) | [Sign In](${INVESTONLINE_URLS.login})\n\nOr contact our team:\n📞 ${SUPPORT_INFO.phone}\n📧 ${SUPPORT_INFO.email}\n💬 WhatsApp: ${SUPPORT_INFO.whatsapp}`, language);

    return {
      reply: limitMessage,
      questionLimitReached: true,
    };
  }

  // Check if investment-related
  if (!isInvestmentRelated(message)) {
    const nonInvestmentMessage = language === 'en'
      ? "I'm specialized in helping with mutual fund investments, SIPs, account opening, KYC, nominations, and all InvestOnline.in processes. 😊\n\nI can't answer questions outside of investment and finance topics.\n\nHow can I help you with your investments today?"
      : await translateText("I'm specialized in helping with mutual fund investments, SIPs, account opening, KYC, nominations, and all InvestOnline.in processes. 😊\n\nI can't answer questions outside of investment and finance topics.\n\nHow can I help you with your investments today?", language);

    const suggestions = getContextualSuggestions('general', language, session.conversationHistory);
    
    // Track suggestions
    session.conversationHistory.push({
      role: 'user',
      content: message,
    });
    session.conversationHistory.push({
      role: 'assistant',
      content: nonInvestmentMessage,
      suggestions: suggestions,
    });

    return {
      reply: nonInvestmentMessage,
      suggestions: suggestions,
    };
  }

  // PRIORITY 1: Check knowledge base with category awareness
  const matchedIntent = matchIntentWithCategory(message);
  
  if (matchedIntent) {
    console.log(`✅ Matched intent: ${matchedIntent.intent}${matchedIntent.category ? ' (Category: ' + matchedIntent.category + ')' : ''}`);
    
    // Enhance response with CTA
    let enhancedResponse = enhanceResponseWithCTA(
      matchedIntent.response,
      matchedIntent.intent,
      matchedIntent.category,
      matchedIntent.urls
    );
    
    // Translate if needed
    if (language !== 'en') {
      enhancedResponse = await translateText(enhancedResponse, language);
    }
    
    // Get contextual suggestions (with history to avoid repetition)
    const suggestions = getContextualSuggestions(matchedIntent.intent, language, session.conversationHistory);
    
    // Add to conversation history with suggestions tracking
    session.conversationHistory.push({
      role: 'user',
      content: message,
    });
    session.conversationHistory.push({
      role: 'assistant',
      content: enhancedResponse,
      intent: matchedIntent.intent,
      suggestions: suggestions,
    });

    return {
      reply: enhancedResponse,
      suggestions: suggestions,
    };
  }

  // PRIORITY 2: Fallback to OpenAI with STRICT language enforcement
  console.log('🤖 No intent match, using OpenAI fallback...');

  try {
    // Keep last 6 messages for context
    const recentHistory = session.conversationHistory.slice(-6).map(h => ({
      role: h.role,
      content: h.content,
    }));

    // FIXED: Strengthen language instruction
    const languageNames = {
      'en': 'English',
      'hi': 'Hindi (हिन्दी)',
      'mr': 'Marathi (मराठी)',
      'gu': 'Gujarati (ગુજરાતી)',
      'ta': 'Tamil (தமிழ்)'
    };
    
    const selectedLanguage = languageNames[language] || 'English';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are InvestOnline Buddy, an AI assistant for InvestOnline.in - India's leading mutual fund investment platform.

STRICT RULES:
1. **InvestOnline ONLY**: Mention ONLY InvestOnline.in, its services, and Indian mutual funds. NEVER mention competitors.
2. **Indian Funds ONLY**: When giving examples, use ONLY Indian mutual fund schemes (e.g., ICICI Prudential, Axis, HDFC, SBI, Aditya Birla, etc.). NEVER mention foreign funds.
3. **No Generic Advice**: Don't say "consult financial advisor" - say "contact InvestOnline advisors at ${SUPPORT_INFO.phone} or WhatsApp ${SUPPORT_INFO.whatsapp}"
4. **Always Add CTAs**: Every response MUST include relevant links:
   - Top Funds: ${INVESTONLINE_URLS.topFunds}
   - Large Cap: ${INVESTONLINE_URLS.largeCap}
   - Mid Cap: ${INVESTONLINE_URLS.midCap}
   - Small Cap: ${INVESTONLINE_URLS.smallCap}
   - ELSS: ${INVESTONLINE_URLS.elss}
   - Compare Funds: ${INVESTONLINE_URLS.compareFunds}
   - SIP Calculator: ${INVESTONLINE_URLS.sipCalculator}
   - Calculators: ${INVESTONLINE_URLS.calculators}
   - Magazine: ${INVESTONLINE_URLS.magazine}
   - Register: ${INVESTONLINE_URLS.register}

5. **Response Format**:
   - Use markdown: **bold**, [links](url)
   - Add emojis appropriately
   - End with CTA like: **[View Top Funds →](url)** or **[Try Calculator →](url)**
   - For fund recommendations, direct to InvestOnline's curated lists

6. **CRITICAL LANGUAGE RULE - MUST FOLLOW STRICTLY**:
   ⚠️ User has deliberately selected: **${selectedLanguage}**
   
   🔒 MANDATORY REQUIREMENTS:
   - You MUST respond 100% in ${selectedLanguage}
   - DO NOT auto-detect language from user's query
   - DO NOT switch languages based on what language the user asks in
   - The SELECTED language (${selectedLanguage}) ALWAYS wins, NOT the query language
   
   📝 EXAMPLES TO FOLLOW:
   - If user selected Hindi and asks "what is sip?" → Respond in Hindi: "SIP एक व्यवस्थित निवेश योजना है..."
   - If user selected English and asks "sip kya hai?" → Respond in English: "SIP is a Systematic Investment Plan..."
   - If user selected Gujarati and asks "registration benefits" → Respond in Gujarati
   
   ⚡ ONLY EXCEPTIONS (keep in English):
   - URLs and markdown links
   - Brand names: "InvestOnline"
   - Financial abbreviations: "SIP", "KYC", "NAV", "ELSS", "AUM"
   - Numbers and percentages

7. **Tone**: Friendly, helpful, InvestOnline-centric. Always brand as "InvestOnline advisors" not "financial advisors".
8. **Contact Info**: Phone: ${SUPPORT_INFO.phone}, WhatsApp: ${SUPPORT_INFO.whatsapp}, Email: ${SUPPORT_INFO.email}

EXAMPLE:
User selected Hindi, asks: "Best large cap funds?"
You respond: "टॉप परफॉर्मिंग Large Cap funds के लिए InvestOnline की curated list देखें! 🎯\n\nहम नियमित रूप से performance, risk, और consistency के आधार पर rankings अपडेट करते हैं। आपको detailed analysis और ratings मिलेगी।\n\n**[View Top Large Cap Funds →](${INVESTONLINE_URLS.largeCap})**\n\nपर्सनलाइज़्ड recommendations के लिए InvestOnline advisors से संपर्क करें:\n📞 ${SUPPORT_INFO.phone}\n💬 ${SUPPORT_INFO.whatsapp}"`,
        },
        ...recentHistory,
        {
          role: 'user',
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    let reply = completion.choices[0].message.content;

    // Get contextual suggestions (with history to avoid repetition)
    const suggestions = getContextualSuggestions('general', language, session.conversationHistory);

    // Add to conversation history with suggestions tracking
    session.conversationHistory.push({
      role: 'user',
      content: message,
    });
    session.conversationHistory.push({
      role: 'assistant',
      content: reply,
      suggestions: suggestions,
    });

    return {
      reply: reply,
      suggestions: suggestions,
    };

  } catch (error) {
    console.error('❌ OpenAI error:', error);
    
    const fallbackMessage = language === 'en'
      ? `I apologize, but I'm having trouble processing your request. 😔\n\nPlease contact our InvestOnline support team:\n📞 **${SUPPORT_INFO.phone}** (Toll-Free)\n💬 **WhatsApp: ${SUPPORT_INFO.whatsapp}**\n📧 **${SUPPORT_INFO.email}**\n\n**[Contact Us →](${INVESTONLINE_URLS.contact})**\n\nWe're here to help!`
      : await translateText(`I apologize, but I'm having trouble processing your request. 😔\n\nPlease contact our InvestOnline support team:\n📞 ${SUPPORT_INFO.phone} (Toll-Free)\n💬 WhatsApp: ${SUPPORT_INFO.whatsapp}\n📧 ${SUPPORT_INFO.email}\n\n[Contact Us](${INVESTONLINE_URLS.contact})\n\nWe're here to help!`, language);

    return {
      reply: fallbackMessage,
      suggestions: ['Contact Support', 'Try again', 'How to register?'],
    };
  }
}

module.exports = { handleChat };
