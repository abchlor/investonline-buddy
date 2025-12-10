// ====================================
// Chat Handler with Multi-Language + Strict InvestOnline Focus
// Version 2 - Fixed all issues
// ====================================

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const fs = require('fs');
const path = require('path');

const QUESTION_LIMIT = 15;

// Language names
const LANGUAGE_NAMES = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  gu: 'Gujarati',
  ta: 'Tamil'
};

// Multi-language investment keywords
const INVESTMENT_KEYWORDS_MULTILANG = {
  en: [
    'mutual fund', 'sip', 'investment', 'invest', 'kyc', 'portfolio', 
    'register', 'account', 'stocks', 'equity', 'debt', 'bonds',
    'nfo', 'nav', 'aum', 'returns', 'risk', 'taxation', 'capital gains',
    'redemption', 'redeem', 'switch', 'nominee', 'nomination',
    'transmission', 'bank change', 'bank update', 'folio',
    'statement', 'certificate', 'units', 'dividend', 'growth',
    'elss', 'tax saving', 'calculator', 'goal', 'retire', 'retirement',
    'advisor', 'support', 'help', 'contact', 'query', 'pan', 'aadhaar',
    'ekyc', 'mandate', 'payment', 'transaction', 'fund', 'scheme',
    'lumpsum', 'systematic', 'top funds', 'compare', 'performance',
    'document', 'documents', 'needed', 'required', 'proof'
  ],
  hi: ['म्यूचुअल फंड', 'एसआईपी', 'निवेश', 'केवाईसी', 'रजिस्टर', 'खाता', 'डॉक्यूमेंट', 'दस्तावेज़'],
  mr: ['म्युच्युअल फंड', 'एसआयपी', 'गुंतवणूक', 'केवायसी', 'नोंदणी', 'खाते', 'कागदपत्रे'],
  gu: ['મ્યુચ્યુઅલ ફંડ', 'એસઆઈપી', 'રોકાણ', 'કેવાયસી', 'નોંધણી', 'ખાતું', 'દસ્તાવેજો'],
  ta: ['மியூச்சுவல் ஃபண்ட்', 'எஸ்ஐபி', 'முதலீடு', 'கேவைசி', 'பதிவு', 'கணக்கு', 'ஆவணங்கள்']
};

// Check if investment-related
function isInvestmentRelated(message) {
  const lowerMsg = message.toLowerCase();
  for (const lang in INVESTMENT_KEYWORDS_MULTILANG) {
    if (INVESTMENT_KEYWORDS_MULTILANG[lang].some(kw => lowerMsg.includes(kw.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

// Detect language
function detectLanguage(message) {
  const msg = message.toLowerCase();
  for (const lang in INVESTMENT_KEYWORDS_MULTILANG) {
    if (lang === 'en') continue;
    if (INVESTMENT_KEYWORDS_MULTILANG[lang].some(kw => msg.includes(kw.toLowerCase()))) {
      return lang;
    }
  }
  if (/[\u0900-\u097F]/.test(message)) return 'hi';
  if (/[\u0A80-\u0AFF]/.test(message)) return 'gu';
  if (/[\u0B80-\u0BFF]/.test(message)) return 'ta';
  return 'en';
}

// 🌐 Translate response to target language
async function translateResponse(text, targetLanguage) {
  if (targetLanguage === 'en') return text;
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator for InvestOnline.in, a mutual fund investment platform in India. 

Translate the following text to ${LANGUAGE_NAMES[targetLanguage]}.

CRITICAL RULES:
1. Keep all URLs, links, and markdown formatting intact
2. Keep technical terms like NAV, SIP, KYC, ELSS, LTCG, STCG, AUM as-is (don't translate)
3. Keep numbers, percentages, and currency symbols as-is
4. Translate naturally, not word-by-word
5. Maintain the professional, friendly tone
6. Keep emojis in place
7. For markdown links [text](url), translate only the text, not the url
8. When text says "InvestOnline" or "InvestOnline.in", keep it as-is
9. When text says "financial advisor", translate it to "InvestOnline advisor" or "InvestOnline support team"
10. When text says "contact support", translate maintaining "InvestOnline" brand

Example:
English: "Contact InvestOnline support at wealth@investonline.in"
Hindi: "InvestOnline सपोर्ट से संपर्क करें wealth@investonline.in पर"

Translate ONLY the text. Do NOT add explanations or notes.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('❌ Translation error:', error);
    return text + '\n\n_(Translation unavailable. Showing in English.)_';
  }
}

// Match intent from flows.json (MORE AGGRESSIVE MATCHING)
async function matchSimpleIntent(message, flows, language = 'en') {
  if (!flows || !flows.intents) return null;

  const lowerMsg = message.toLowerCase().trim();
  
  // Exact phrase matching first
  for (const [intentName, intent] of Object.entries(flows.intents)) {
    if (!intent.keywords) continue;

    const matched = intent.keywords.some((kw) => {
      const lowerKw = kw.toLowerCase();
      // Exact match or word boundary match
      return lowerMsg === lowerKw || 
             lowerMsg.includes(' ' + lowerKw + ' ') ||
             lowerMsg.startsWith(lowerKw + ' ') ||
             lowerMsg.endsWith(' ' + lowerKw) ||
             lowerMsg === lowerKw;
    });

    if (matched) {
      let response = intent.response;
      if (language !== 'en') {
        console.log(`🌐 Translating "${intentName}" to ${LANGUAGE_NAMES[language]}...`);
        response = await translateResponse(response, language);
      }
      
      return {
        reply: response,
        suggestions: intent.suggested || []
      };
    }
  }

  // Check site sections
  if (flows.site) {
    for (const [section, data] of Object.entries(flows.site)) {
      if (!data.keywords) continue;
      const matched = data.keywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));
      if (matched) {
        let response = data.response;
        if (language !== 'en') {
          response = await translateResponse(response, language);
        }
        return {
          reply: response,
          suggestions: data.suggested || []
        };
      }
    }
  }

  return null;
}

// Generate contextual suggestions based on conversation
function generateContextualSuggestions(conversationHistory, currentReply, language) {
  const suggestions = [];
  const recentTopics = new Set();
  
  // Analyze recent conversation
  conversationHistory.slice(-3).forEach(msg => {
    const lower = (msg.content || msg).toLowerCase();
    if (lower.includes('kyc')) recentTopics.add('kyc');
    if (lower.includes('sip')) recentTopics.add('sip');
    if (lower.includes('register')) recentTopics.add('register');
    if (lower.includes('fund') || lower.includes('scheme')) recentTopics.add('fund');
    if (lower.includes('document') || lower.includes('proof')) recentTopics.add('documents');
    if (lower.includes('transmission') || lower.includes('nominee')) recentTopics.add('nomination');
  });
  
  const lower = currentReply.toLowerCase();
  
  // Context-aware suggestions
  if (lower.includes('kyc') || recentTopics.has('kyc')) {
    suggestions.push('Documents needed', 'How to do e-KYC?', 'KYC status');
  } else if (lower.includes('sip') || recentTopics.has('sip')) {
    suggestions.push('SIP Calculator', 'Start SIP', 'How to pause SIP?');
  } else if (lower.includes('register') || recentTopics.has('register')) {
    suggestions.push('What is KYC?', 'Documents needed', 'Talk to Support');
  } else if (lower.includes('document') || recentTopics.has('documents')) {
    suggestions.push('What is KYC?', 'How to register?', 'Talk to Support');
  } else if (lower.includes('transmission') || lower.includes('nominee') || recentTopics.has('nomination')) {
    suggestions.push('Required Documents', 'Change Nominee', 'Talk to Support');
  } else if (lower.includes('fund') || lower.includes('scheme') || recentTopics.has('fund')) {
    suggestions.push('Compare Funds', 'SIP Calculator', 'Talk to Support');
  } else if (lower.includes('support') || lower.includes('contact') || lower.includes('help')) {
    suggestions.push('Email Support', 'Call Support', 'How to register?');
  } else {
    suggestions.push('How to register?', 'Start SIP', 'Top Funds', 'Contact Support');
  }
  
  return suggestions.slice(0, 3);
}

// 🎁 Registration benefits message (multi-language)
function getRegistrationBenefits(language = 'en') {
  const benefits = {
    en: {
      title: "🎉 **You've reached your 15 free questions!**",
      subtitle: "Register with InvestOnline.in now to unlock unlimited access:",
      benefits: [
        "✅ **Unlimited Investment Guidance** - Ask as many questions as you want",
        "✅ **Personal Portfolio Tracking** - Monitor all your investments in one place",
        "✅ **Expert Advisory Support** - Connect with certified InvestOnline advisors",
        "✅ **Smart Investment Tools** - SIP calculators, goal planners, asset allocation tools",
        "✅ **Zero Commission** - Invest directly, no hidden charges",
        "✅ **Instant KYC** - Complete registration in just 3 minutes via Aadhaar",
        "✅ **Top Fund Recommendations** - Get personalized fund suggestions",
        "✅ **Real-time Alerts** - NAV updates, SIP reminders, market insights"
      ],
      cta: "🚀 **Join 10,000+ Smart Investors Today!**",
      actions: "👉 [Register Now](https://www.investonline.in) | [Already registered? Login](https://www.investonline.in/login)",
      contact: "\n\n📞 **Need Help?**\nOur InvestOnline team is here for you!\n📧 Email: wealth@investonline.in | 📞 Phone: 1800-2222-65"
    },
    hi: {
      title: "🎉 **आपके 15 मुफ्त प्रश्न पूरे हो गए!**",
      subtitle: "InvestOnline.in पर रजिस्टर करें और अनलिमिटेड एक्सेस पाएं:",
      benefits: [
        "✅ **असीमित निवेश मार्गदर्शन** - जितने चाहें उतने सवाल पूछें",
        "✅ **व्यक्तिगत पोर्टफोलियो ट्रैकिंग** - एक जगह पर सभी निवेश देखें",
        "✅ **विशेषज्ञ सलाह समर्थन** - InvestOnline के प्रमाणित सलाहकारों से जुड़ें",
        "✅ **स्मार्ट निवेश उपकरण** - SIP कैलकुलेटर, गोल प्लानर",
        "✅ **शून्य कमीशन** - सीधे निवेश करें, कोई छिपी फीस नहीं",
        "✅ **तुरंत KYC** - आधार से सिर्फ 3 मिनट में रजिस्ट्रेशन",
        "✅ **टॉप फंड सुझाव** - व्यक्तिगत फंड सुझाव पाएं",
        "✅ **रियल-टाइम अलर्ट** - NAV अपडेट, SIP रिमाइंडर"
      ],
      cta: "🚀 **10,000+ स्मार्ट निवेशकों में शामिल हों!**",
      actions: "👉 [अभी रजिस्टर करें](https://www.investonline.in) | [पहले से रजिस्टर हैं? लॉगिन करें](https://www.investonline.in/login)",
      contact: "\n\n📞 **मदद चाहिए?**\nहमारी InvestOnline टीम आपके लिए यहाँ है!\n📧 ईमेल: wealth@investonline.in | 📞 फोन: 1800-2222-65"
    }
  };

  const content = benefits[language] || benefits.en;
  return `${content.title}\n\n${content.subtitle}\n\n${content.benefits.join('\n\n')}\n\n${content.cta}\n\n${content.actions}${content.contact}`;
}

// Main chat handler
async function handleChat({ sessionId, message, page, language = 'en', SESSION_STORE }) {
  const session = SESSION_STORE.get(sessionId);
  if (!session) {
    return { error: 'invalid_session' };
  }

  // Update session
  session.lastAccess = Date.now();
  session.questionCount = (session.questionCount || 0) + 1;
  session.conversationHistory = session.conversationHistory || [];
  session.conversationHistory.push({ role: 'user', content: message });
  session.language = language;

  console.log(`📊 Question ${session.questionCount}/${QUESTION_LIMIT} | Session: ${sessionId} | Language: ${LANGUAGE_NAMES[language]}`);

  // 🎁 Check question limit FIRST (before processing)
  if (session.questionCount > QUESTION_LIMIT) {
    console.log(`⚠️ Question limit reached for session: ${sessionId}`);
    return {
      questionLimitReached: true,
      reply: getRegistrationBenefits(language),
      suggestions: []
    };
  }

  // Detect language from message
  const detectedLang = detectLanguage(message);
  const finalLanguage = language || detectedLang;
  
  console.log(`🌐 Using language: ${LANGUAGE_NAMES[finalLanguage]} (detected: ${LANGUAGE_NAMES[detectedLang]})`);

  // Check if investment-related
  if (!isInvestmentRelated(message)) {
    const offTopicMessages = {
      en: "I'm specialized in helping with mutual fund investments, SIPs, account opening, KYC, nominations, and all InvestOnline.in processes. 😊\n\nI can't answer questions outside of investment and finance topics.\n\nHow can I help you with your investments today?",
      hi: "मैं म्यूचुअल फंड निवेश, SIP, खाता खोलना, KYC, नामांकन और InvestOnline.in की सभी प्रक्रियाओं में मदद करने में विशेषज्ञ हूं। 😊\n\nमैं निवेश और वित्त के बाहर के प्रश्नों का उत्तर नहीं दे सकता।\n\nआज मैं आपके निवेश में कैसे मदद कर सकता हूं?",
      mr: "मी म्युच्युअल फंड गुंतवणूक, SIP, खाते उघडणे, KYC, नामांकन आणि InvestOnline.in च्या सर्व प्रक्रियांमध्ये मदत करण्यात तज्ञ आहे। 😊\n\nमी गुंतवणूक आणि वित्त बाहेरील प्रश्नांची उत्तरे देऊ शकत नाही।\n\nआज मी तुमच्या गुंतवणुकीत कशी मदत करू शकतो?",
      gu: "હું મ્યુચ્યુઅલ ફંડ રોકાણ, SIP, ખાતું ખોલવું, KYC, નામાંકન અને InvestOnline.in ની તમામ પ્રક્રિયાઓમાં મદદ કરવામાં નિષ્ણાત છું। 😊\n\nહું રોકાણ અને નાણાંની બાહરના પ્રશ્નોના જવાબ આપી શકતો નથી।\n\nઆજે હું તમારા રોકાણમાં કેવી રીતે મદદ કરી શકું?",
      ta: "நான் மியூச்சுவல் ஃபண்ட் முதலீடு, SIP, கணக்கு திறத்தல், KYC, நியமனம் மற்றும் InvestOnline.in செயல்முறைகளில் உதவுவதில் நிபுணர். 😊\n\nநான் முதலீடு மற்றும் நிதிக்கு வெளியே உள்ள கேள்விகளுக்கு பதிலளிக்க முடியாது।\n\nஇன்று உங்கள் முதலீட்டில் நான் எவ்வாறு உதவ முடியும்?"
    };
    
    return {
      reply: offTopicMessages[finalLanguage] || offTopicMessages.en,
      suggestions: ['How to register?', 'What is SIP?', 'Contact Support']
    };
  }

  // Load flows.json
  const flowsPath = path.join(__dirname, '..', 'flows', 'flows.json');
  const flows = JSON.parse(fs.readFileSync(flowsPath, 'utf8'));

  // 🌐 PRIORITY 1: Try to match intent from flows.json
  const intentResult = await matchSimpleIntent(message, flows, finalLanguage);
  
  if (intentResult) {
    console.log(`✅ Matched from flows.json (translated: ${finalLanguage !== 'en'})`);
    
    // Store in history
    session.conversationHistory.push({ role: 'assistant', content: intentResult.reply });
    
    const contextualSuggestions = generateContextualSuggestions(
      session.conversationHistory,
      intentResult.reply,
      finalLanguage
    );
    
    return {
      reply: intentResult.reply,
      suggestions: contextualSuggestions.length > 0 ? contextualSuggestions : intentResult.suggestions,
      questionsRemaining: QUESTION_LIMIT - session.questionCount
    };
  }

  // PRIORITY 2: OpenAI fallback with STRICT InvestOnline instructions
  try {
    console.log(`🤖 Using OpenAI fallback for: "${message}"`);
    
    const systemPrompt = `You are InvestOnline Buddy, the official AI assistant for InvestOnline.in - India's leading mutual fund investment platform.

CRITICAL RULES - MUST FOLLOW:
1. **InvestOnline-specific**: Always mention InvestOnline.in, never generic "financial advisor" or competitor names
2. **Indian context ONLY**: Only mention Indian mutual funds, SEBI, Indian tax laws, Indian banks
3. **No foreign examples**: NEVER mention US funds (Vanguard, Fidelity, etc.) - only Indian AMCs (ICICI, HDFC, SBI, Aditya Birla, etc.)
4. **Boundary setting**: For questions you can't answer (top funds, recommendations), redirect to InvestOnline.in links or support
5. **Contact info**: Always use InvestOnline contact: wealth@investonline.in, 1800-2222-65
6. **Human-like tone**: Be conversational, friendly, helpful - like a knowledgeable friend
7. **Brand consistency**: Say "InvestOnline support" or "InvestOnline advisor", never generic "financial advisor"
8. **Markdown for URLs**: Always use [text](url) format for links
9. **Language**: Respond in ${LANGUAGE_NAMES[finalLanguage]}
10. **Keep technical terms**: Don't translate NAV, SIP, KYC, ELSS, LTCG, STCG, AUM

BOUNDARY SETTING RESPONSES:
- Top funds query: "I can't recommend specific funds, but check our curated list at [InvestOnline Top Funds](https://www.investonline.in/mutual-funds/top-performing-funds). For personalized advice, talk to our InvestOnline advisors: 📞 1800-2222-65"
- Fund comparison: "Browse and compare funds at [InvestOnline Fund Compare](https://www.investonline.in/mutual-funds/compare-schemes). Need help? Our InvestOnline team: wealth@investonline.in"
- Portfolio advice: "For personalized portfolio advice, speak with our InvestOnline advisors: 📞 1800-2222-65 or 📧 wealth@investonline.in"

EXAMPLE GOOD RESPONSE:
User: "What are the best mutual funds?"
Response: "I can't recommend specific funds as it depends on your goals and risk appetite! 😊

However, InvestOnline has curated category-wise lists:
[Top Performing Funds](https://www.investonline.in/mutual-funds/top-performing-funds)

For personalized recommendations based on YOUR financial goals, speak with our InvestOnline advisors:
📞 Call: 1800-2222-65
📧 Email: wealth@investonline.in"

EXAMPLE BAD RESPONSE (DON'T DO THIS):
"Consider Vanguard 500 Index Fund... consult a financial advisor..." ❌

Now answer the user's question following ALL rules above.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...session.conversationHistory.slice(-6), // Last 3 exchanges
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 600
    });

    const aiReply = response.choices[0].message.content.trim();
    
    // Store in history
    session.conversationHistory.push({ role: 'assistant', content: aiReply });
    
    // Keep history manageable
    if (session.conversationHistory.length > 12) {
      session.conversationHistory = session.conversationHistory.slice(-12);
    }

    const contextualSuggestions = generateContextualSuggestions(
      session.conversationHistory,
      aiReply,
      finalLanguage
    );

    return {
      reply: aiReply,
      suggestions: contextualSuggestions,
      questionsRemaining: QUESTION_LIMIT - session.questionCount
    };

  } catch (error) {
    console.error('❌ OpenAI error:', error);
    
    const fallbackMessages = {
      en: `I'd be happy to help! However, I need a bit more specific information.\n\nI can assist you with mutual funds, SIPs, KYC, registration, and all InvestOnline.in processes.\n\n📞 **Quick Contact:**\n📧 Email: wealth@investonline.in\n📞 Phone: 1800-2222-65`,
      hi: `मुझे मदद करने में खुशी होगी! हालांकि, मुझे थोड़ी अधिक विशिष्ट जानकारी चाहिए।\n\nमैं म्यूचुअल फंड, SIP, KYC, रजिस्ट्रेशन और InvestOnline.in की सभी प्रक्रियाओं में मदद कर सकता हूं।\n\n📞 **संपर्क:**\n📧 ईमेल: wealth@investonline.in\n📞 फोन: 1800-2222-65`
    };

    return {
      reply: fallbackMessages[finalLanguage] || fallbackMessages.en,
      suggestions: ['How to register?', 'What is KYC?', 'Start SIP', 'Contact Support'],
      questionsRemaining: QUESTION_LIMIT - session.questionCount
    };
  }
}

module.exports = { handleChat };
