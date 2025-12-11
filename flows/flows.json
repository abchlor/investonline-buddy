// ====================================
// chat_handler_WITH_TRANSLATION.js
// COMPLETE FIX: Smart Intent Matching + Contextual Suggestions + Category Filtering
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
  register: 'https://www.investonline.in/registration',
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
};

// Contact info
const SUPPORT_INFO = {
  phone: '1800-2222-65',
  phoneDirect: '+91-22-4071-3333',
  email: 'wealth@investonline.in',
  whatsapp: '+91-9820119909',
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
// FIXED: Context-Aware Smart Suggestions
// ====================================
function getContextualSuggestions(intent, language = 'en') {
  const suggestionMap = {
    // SIP related
    'sip': ['How to start SIP?', 'SIP Calculator', 'Types of SIP', 'Top SIP funds'],
    'sip_calculator': ['Start SIP now', 'What is Top-up SIP?', 'SIP vs Lumpsum'],
    'step_up_sip': ['SIP Calculator', 'How to modify SIP?', 'Best SIP funds'],
    
    // Fund categories
    'large_cap': ['Mid Cap funds', 'Compare funds', 'Top Large Cap funds', 'SIP in Large Cap'],
    'mid_cap': ['Large Cap funds', 'Small Cap funds', 'Top performing funds'],
    'small_cap': ['Mid Cap funds', 'Risk in Small Cap', 'SIP in Small Cap'],
    'elss': ['Tax benefits', 'Lock-in period', 'ELSS Calculator', 'Top ELSS funds'],
    
    // Investment concepts
    'nav': ['Expense Ratio', 'Exit Load', 'How to invest?'],
    'expense_ratio': ['NAV', 'Compare funds', 'Low cost funds'],
    'exit_load': ['NAV', 'Lock-in period', 'Redemption process'],
    
    // Account & KYC
    'kyc': ['How to register?', 'KYC status check', 'Documents needed'],
    'registration': ['Complete KYC', 'Start investing', 'First SIP'],
    'documents_needed': ['Complete KYC', 'Upload documents', 'KYC status'],
    
    // Top funds
    'top_funds': ['Compare funds', 'Large Cap funds', 'SIP Calculator', 'Start investing'],
    
    // Calculators
    'retirement_calculator': ['SIP Calculator', 'Asset Allocation', 'Goal Planning'],
    'asset_allocation': ['Risk Profile', 'Portfolio Review', 'Retirement Planning'],
    
    // Magazine
    'invest_guide': ['Latest articles', 'Investment tips', 'Market insights'],
  };

  // Get suggestions for this intent
  let suggestions = suggestionMap[intent] || [
    'Top Mutual Funds',
    'SIP Calculator', 
    'How to register?',
    'Contact Support'
  ];

  // Translate if not English
  if (language !== 'en') {
    // Return English suggestions - will be translated by frontend or kept as is
    // For now, keep English suggestions for consistency
  }

  return suggestions;
}

// ====================================
// FIXED: Enhanced Response with CTAs
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
  } else if ((intent === 'retirement_calculator' || intent === 'asset_allocation') && !enhanced.includes(INVESTONLINE_URLS.calculators)) {
    enhanced += `\n\n**[Try Calculator →](${INVESTONLINE_URLS.calculators})**`;
  } else if (intent === 'invest_guide' && !enhanced.includes(INVESTONLINE_URLS.magazine)) {
    enhanced += `\n\n**[Read Invest Guide →](${INVESTONLINE_URLS.magazine})**`;
  } else if (intent === 'compare_funds' && !enhanced.includes(INVESTONLINE_URLS.compareFunds)) {
    enhanced += `\n\n**[Compare Funds →](${INVESTONLINE_URLS.compareFunds})**`;
  }
  
  // If no CTA added yet and URLs provided in flows.json, add first URL
  if (!enhanced.match(/\[.*→\]/) && urls && urls.length > 0) {
    enhanced += `\n\n**[Learn More →](${urls[0]})**`;
  }
  
  return enhanced;
}

// ====================================
// Translation function
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
    
    // Account & KYC
    'account', 'kyc', 'register', 'login', 'profile', 'nominee',
    'bank', 'mandate', 'ekyc', 'aadhar', 'pan', 'document',
    
    // Queries
    'how to', 'what is', 'which fund', 'best fund', 'top fund',
    'compare', 'calculator', 'status', 'track', 'statement',
    
    // Issues
    'payment', 'failed', 'pending', 'rejected', 'error', 'problem',
    'help', 'support', 'contact',
    
    // Hinglish/Hindi
    'निवेश', 'म्यूचुअल फंड', 'केवाईसी', 'रजिस्टर',
  ];

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

  // Initialize conversation history
  if (!session.conversationHistory) {
    session.conversationHistory = [];
  }

  // Increment question count
  session.questionCount = (session.questionCount || 0) + 1;
  session.language = language;

  // Check question limit
  if (session.questionCount > QUESTION_LIMIT) {
    const limitMessage = language === 'en' 
      ? `🎯 You've asked ${QUESTION_LIMIT} questions! To continue getting personalized investment advice, please register or sign in.\n\n**Benefits of Registration:**\n• Unlimited queries\n• Personalized portfolio tracking\n• Direct investment facility\n• Priority support\n\n**[Register Now →](${INVESTONLINE_URLS.register})** | **[Sign In →](${INVESTONLINE_URLS.login})**\n\nOr contact our team:\n📞 ${SUPPORT_INFO.phone}\n📧 ${SUPPORT_INFO.email}`
      : await translateText(`You've asked ${QUESTION_LIMIT} questions! To continue getting personalized investment advice, please register or sign in.\n\nBenefits of Registration:\n• Unlimited queries\n• Personalized portfolio tracking\n• Direct investment facility\n• Priority support\n\n[Register Now](${INVESTONLINE_URLS.register}) | [Sign In](${INVESTONLINE_URLS.login})\n\nOr contact our team:\n📞 ${SUPPORT_INFO.phone}\n📧 ${SUPPORT_INFO.email}`, language);

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

    return {
      reply: nonInvestmentMessage,
      suggestions: getContextualSuggestions('general', language),
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
    
    // Get contextual suggestions
    const suggestions = getContextualSuggestions(matchedIntent.intent, language);
    
    // Add to conversation history
    session.conversationHistory.push({
      role: 'user',
      content: message,
    });
    session.conversationHistory.push({
      role: 'assistant',
      content: enhancedResponse,
    });

    return {
      reply: enhancedResponse,
      suggestions: suggestions,
    };
  }

  // PRIORITY 2: Fallback to OpenAI with strict InvestOnline context
  console.log('🤖 No intent match, using OpenAI fallback...');

  try {
    // Keep last 6 messages for context
    const recentHistory = session.conversationHistory.slice(-6);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are InvestOnline Buddy, an AI assistant for InvestOnline.in - India's leading mutual fund investment platform.

STRICT RULES:
1. **InvestOnline ONLY**: Mention ONLY InvestOnline.in, its services, and Indian mutual funds. NEVER mention competitors.
2. **Indian Funds ONLY**: When giving examples, use ONLY Indian mutual fund schemes (e.g., ICICI Prudential, Axis, HDFC, SBI, Aditya Birla, etc.). NEVER mention foreign funds.
3. **No Generic Advice**: Don't say "consult financial advisor" - say "contact InvestOnline advisors at ${SUPPORT_INFO.phone} or ${SUPPORT_INFO.email}"
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

6. **Language**: Respond in ${language === 'en' ? 'English' : language === 'hi' ? 'Hindi' : language === 'mr' ? 'Marathi' : language === 'gu' ? 'Gujarati' : 'Tamil'} but keep URLs, brand names, and financial terms in English.

7. **Tone**: Friendly, helpful, InvestOnline-centric. Always brand as "InvestOnline advisors" not "financial advisors".

EXAMPLE:
User: "Best large cap funds?"
You: "For top performing Large Cap funds, check InvestOnline's curated list! 🎯\n\nWe regularly update our rankings based on performance, risk, and consistency. You'll find detailed analysis and ratings.\n\n**[View Top Large Cap Funds →](${INVESTONLINE_URLS.largeCap})**\n\nFor personalized recommendations, contact InvestOnline advisors:\n📞 ${SUPPORT_INFO.phone}\n📧 ${SUPPORT_INFO.email}"`,
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

    // Add to conversation history
    session.conversationHistory.push({
      role: 'user',
      content: message,
    });
    session.conversationHistory.push({
      role: 'assistant',
      content: reply,
    });

    // Get contextual suggestions
    const suggestions = getContextualSuggestions('general', language);

    return {
      reply: reply,
      suggestions: suggestions,
    };

  } catch (error) {
    console.error('❌ OpenAI error:', error);
    
    const fallbackMessage = language === 'en'
      ? `I apologize, but I'm having trouble processing your request. 😔\n\nPlease contact our InvestOnline support team:\n📞 **${SUPPORT_INFO.phone}** (Toll-Free)\n📧 **${SUPPORT_INFO.email}**\n\n**[Contact Us →](${INVESTONLINE_URLS.contact})**\n\nWe're here to help!`
      : await translateText(`I apologize, but I'm having trouble processing your request. 😔\n\nPlease contact our InvestOnline support team:\n📞 ${SUPPORT_INFO.phone} (Toll-Free)\n📧 ${SUPPORT_INFO.email}\n\n[Contact Us](${INVESTONLINE_URLS.contact})\n\nWe're here to help!`, language);

    return {
      reply: fallbackMessage,
      suggestions: ['Contact Support', 'Try again', 'How to register?'],
    };
  }
}

module.exports = { handleChat };
