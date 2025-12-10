// ====================================
// Chat Handler with Dynamic Translation
// ====================================

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const QUESTION_LIMIT = 15;

// Language names
const LANGUAGE_NAMES = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  gu: 'Gujarati',
  ta: 'Tamil'
};

// Multi-language investment keywords (same as before)
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
    'lumpsum', 'systematic', 'top funds', 'compare', 'performance'
  ],
  hi: ['म्यूचुअल फंड', 'एसआईपी', 'निवेश', 'केवाईसी', /* ... */],
  mr: ['म्युच्युअल फंड', 'एसआयपी', 'गुंतवणूक', 'केवायसी', /* ... */],
  gu: ['મ્યુચ્યુઅલ ફંડ', 'એસઆઈપી', 'રોકાણ', 'કેવાયસી', /* ... */],
  ta: ['மியூச்சுவல் ஃபண்ட்', 'எஸ்ஐபி', 'முதலீடு', 'கேவைசி', /* ... */]
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

// 🌐 NEW: Translate response to target language
async function translateResponse(text, targetLanguage) {
  if (targetLanguage === 'en') return text; // No translation needed
  
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
2. Keep technical terms like NAV, SIP, KYC, ELSS, LTCG, STCG as-is (don't translate)
3. Keep numbers, percentages, and currency symbols as-is
4. Translate naturally, not word-by-word
5. Maintain the professional, friendly tone
6. Keep emojis in place
7. For markdown links [text](url), translate only the text, not the url

Example:
English: "Visit [InvestOnline](https://www.investonline.in) for details"
Hindi: "[InvestOnline पर जाएं](https://www.investonline.in) विवरण के लिए"

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
    // Fallback: return original English text with note
    return text + '\n\n_(Translation unavailable. Showing in English.)_';
  }
}

// Match intent from flows.json
async function matchSimpleIntent(message, flows, language = 'en') {
  if (!flows || !flows.intents) return null;

  const lowerMsg = message.toLowerCase();
  
  for (const [intentName, intent] of Object.entries(flows.intents)) {
    if (!intent.keywords) continue;

    const matched = intent.keywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));

    if (matched) {
      // 🌐 Translate response if not English
      let response = intent.response;
      if (language !== 'en') {
        console.log(`🌐 Translating response to ${LANGUAGE_NAMES[language]}...`);
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

// Generate smart suggestions
function generateSmartSuggestions(conversationHistory, currentReply) {
  const suggestions = [];
  const recentTopics = new Set();
  
  conversationHistory.slice(-3).forEach(msg => {
    const lower = msg.toLowerCase();
    if (lower.includes('kyc')) recentTopics.add('kyc');
    if (lower.includes('sip')) recentTopics.add('sip');
    if (lower.includes('register')) recentTopics.add('register');
    if (lower.includes('fund')) recentTopics.add('fund');
  });
  
  const lower = currentReply.toLowerCase();
  
  if (lower.includes('kyc') || recentTopics.has('kyc')) {
    suggestions.push('How to do e-KYC?', 'Documents needed', 'KYC status');
  } else if (lower.includes('sip') || recentTopics.has('sip')) {
    suggestions.push('SIP Calculator', 'Top SIP funds', 'Start SIP');
  } else if (lower.includes('register') || recentTopics.has('register')) {
    suggestions.push('What is KYC?', 'Documents needed', 'How long to register?');
  } else if (lower.includes('fund') || recentTopics.has('fund')) {
    suggestions.push('Top Funds', 'Compare funds', 'SIP Calculator');
  } else {
    suggestions.push('How to register?', 'Start SIP', 'Top Funds', 'Contact Support');
  }
  
  return suggestions.slice(0, 3);
}

// 🎁 NEW: Registration benefits message
function getRegistrationBenefits(language = 'en') {
  const benefits = {
    en: {
      title: "🎉 **You've reached your 15 free questions!**",
      subtitle: "Register now to unlock unlimited access and exclusive benefits:",
      benefits: [
        "✅ **Unlimited Investment Guidance** - Ask as many questions as you want",
        "✅ **Personal Portfolio Tracking** - Monitor all your investments in one place",
        "✅ **Expert Advisory Support** - Connect with certified investment advisors",
        "✅ **Smart Investment Tools** - Access SIP calculators, goal planners, asset allocation tools",
        "✅ **Zero Commission** - Invest directly, no hidden charges",
        "✅ **Instant KYC** - Complete registration in just 3 minutes via Aadhaar",
        "✅ **Top Fund Recommendations** - Get personalized fund suggestions based on your goals",
        "✅ **Real-time Alerts** - NAV updates, SIP reminders, market insights"
      ],
      cta: "🚀 **Join 10,000+ Smart Investors Today!**",
      actions: "👉 [Register Now](https://www.investonline.in) | [Already have an account? Login](https://www.investonline.in/login)",
      contact: "\n\n📞 **Need Help?**\nOur team is here for you!\nEmail: wealth@investonline.in | Phone: 1800-2222-65"
    },
    hi: {
      title: "🎉 **आपके 15 मुफ्त प्रश्न पूरे हो गए!**",
      subtitle: "अनलिमिटेड एक्सेस और विशेष लाभों के लिए अभी रजिस्टर करें:",
      benefits: [
        "✅ **असीमित निवेश मार्गदर्शन** - जितने चाहें उतने सवाल पूछें",
        "✅ **व्यक्तिगत पोर्टफोलियो ट्रैकिंग** - एक जगह पर सभी निवेश देखें",
        "✅ **विशेषज्ञ सलाह समर्थन** - प्रमाणित निवेश सलाहकारों से जुड़ें",
        "✅ **स्मार्ट निवेश उपकरण** - SIP कैलकुलेटर, गोल प्लानर, एसेट आवंटन",
        "✅ **शून्य कमीशन** - सीधे निवेश करें, कोई छिपी फीस नहीं",
        "✅ **तुरंत KYC** - आधार से सिर्फ 3 मिनट में रजिस्ट्रेशन पूरा करें",
        "✅ **टॉप फंड सुझाव** - आपके लक्ष्यों के आधार पर फंड सुझाव पाएं",
        "✅ **रियल-टाइम अलर्ट** - NAV अपडेट, SIP रिमाइंडर, बाजार जानकारी"
      ],
      cta: "🚀 **10,000+ स्मार्ट निवेशकों में शामिल हों!**",
      actions: "👉 [अभी रजिस्टर करें](https://www.investonline.in) | [पहले से खाता है? लॉगिन करें](https://www.investonline.in/login)",
      contact: "\n\n📞 **मदद चाहिए?**\nहमारी टीम आपके लिए यहाँ है!\nईमेल: wealth@investonline.in | फोन: 1800-2222-65"
    },
    mr: {
      title: "🎉 **तुमचे 15 मोफत प्रश्न पूर्ण झाले!**",
      subtitle: "अनलिमिटेड ऍक्सेस आणि विशेष फायद्यांसाठी आता नोंदणी करा:",
      benefits: [
        "✅ **असीमित गुंतवणूक मार्गदर्शन** - तुम्हाला हवे तितके प्रश्न विचारा",
        "✅ **वैयक्तिक पोर्टफोलिओ ट्रॅकिंग** - एका ठिकाणी सर्व गुंतवणूक पहा",
        "✅ **तज्ञ सल्ला समर्थन** - प्रमाणित गुंतवणूक सल्लागारांशी जुडा",
        "✅ **स्मार्ट गुंतवणूक साधने** - SIP कॅल्क्युलेटर, गोल प्लॅनर, मालमत्ता वाटप",
        "✅ **शून्य कमिशन** - थेट गुंतवणूक करा, कोणतेही लपलेले शुल्क नाही",
        "✅ **त्वरित KYC** - आधारद्वारे फक्त 3 मिनिटात नोंदणी पूर्ण करा",
        "✅ **टॉप फंड शिफारसी** - तुमच्या ध्येयांवर आधारित फंड सूचना मिळवा",
        "✅ **रिअल-टाइम अलर्ट** - NAV अपडेट, SIP स्मरणपत्रे, बाजार माहिती"
      ],
      cta: "🚀 **10,000+ स्मार्ट गुंतवणूकदारांमध्ये सामील व्हा!**",
      actions: "👉 [आता नोंदणी करा](https://www.investonline.in) | [आधीच खाते आहे? लॉगिन करा](https://www.investonline.in/login)",
      contact: "\n\n📞 **मदत हवी आहे?**\nआमची टीम तुमच्यासाठी येथे आहे!\nईमेल: wealth@investonline.in | फोन: 1800-2222-65"
    },
    gu: {
      title: "🎉 **તમારા 15 મફત પ્રશ્નો પૂર્ણ થયા!**",
      subtitle: "અનલિમિટેડ ઍક્સેસ અને વિશેષ લાભો માટે હવે નોંધણી કરો:",
      benefits: [
        "✅ **અમર્યાદિત રોકાણ માર્ગદર્શન** - તમને જોઈએ તેટલા પ્રશ્નો પૂછો",
        "✅ **વ્યક્તિગત પોર્ટફોલિયો ટ્રેકિંગ** - એક જગ્યાએ તમામ રોકાણ જુઓ",
        "✅ **નિષ્ણાત સલાહ સહાય** - પ્રમાણિત રોકાણ સલાહકારો સાથે જોડાઓ",
        "✅ **સ્માર્ટ રોકાણ સાધનો** - SIP કેલ્ક્યુલેટર, લક્ષ્ય આયોજક, સંપત્તિ ફાળવણી",
        "✅ **શૂન્ય કમિશન** - સીધું રોકાણ કરો, કોઈ છુપાયેલ શુલ્ક નથી",
        "✅ **તાત્કાલિક KYC** - આધાર દ્વારા માત્ર 3 મિનિટમાં નોંધણી પૂર્ણ કરો",
        "✅ **ટોચના ફંડ ભલામણો** - તમારા લક્ષ્યોના આધારે ફંડ સૂચનો મેળવો",
        "✅ **રિઅલ-ટાઇમ ચેતવણીઓ** - NAV અપડેટ્સ, SIP રીમાઇન્ડર, બજાર માહિતી"
      ],
      cta: "🚀 **10,000+ સ્માર્ટ રોકાણકારોમાં જોડાઓ!**",
      actions: "👉 [હવે નોંધણી કરો](https://www.investonline.in) | [પહેલેથી ખાતું છે? લૉગિન કરો](https://www.investonline.in/login)",
      contact: "\n\n📞 **મદદ જોઈએ છે?**\nઅમારી ટીમ તમારા માટે અહીં છે!\nઈમેલ: wealth@investonline.in | ફોન: 1800-2222-65"
    },
    ta: {
      title: "🎉 **உங்கள் 15 இலவச கேள்விகள் முடிந்தன!**",
      subtitle: "வரம்பற்ற அணுகல் மற்றும் சிறப்பு நன்மைகளுக்கு இப்போது பதிவு செய்யுங்கள்:",
      benefits: [
        "✅ **வரம்பற்ற முதலீட்டு வழிகாட்டுதல்** - நீங்கள் விரும்பும் அளவு கேள்விகள் கேளுங்கள்",
        "✅ **தனிப்பட்ட போர்ட்ஃபோலியோ கண்காணிப்பு** - ஒரே இடத்தில் அனைத்து முதலீடுகளையும் பார்க்கவும்",
        "✅ **நிபுணர் ஆலோசனை ஆதரவு** - சான்றளிக்கப்பட்ட முதலீட்டு ஆலோசகர்களுடன் இணையுங்கள்",
        "✅ **ஸ்மார்ட் முதலீட்டு கருவிகள்** - SIP கணிப்பான், இலக்கு திட்டமிடல், சொத்து ஒதுக்கீடு",
        "✅ **பூஜ்ஜியம் கமிஷன்** - நேரடியாக முதலீடு செய்யுங்கள், மறைக்கப்பட்ட கட்டணம் இல்லை",
        "✅ **உடனடி KYC** - ஆதார் மூலம் வெறும் 3 நிமிடத்தில் பதிவு முடிக்கவும்",
        "✅ **சிறந்த ஃபண்ட் பரிந்துரைகள்** - உங்கள் இலக்குகளின் அடிப்படையில் ஃபண்ட் பரிந்துரைகளைப் பெறுங்கள்",
        "✅ **நிகழ்நேர எச்சரிக்கைகள்** - NAV புதுப்பிப்புகள், SIP நினைவூட்டல்கள், சந்தை தகவல்கள்"
      ],
      cta: "🚀 **10,000+ ஸ்மார்ட் முதலீட்டாளர்களுடன் இணையுங்கள்!**",
      actions: "👉 [இப்போது பதிவு செய்யுங்கள்](https://www.investonline.in) | [ஏற்கனவே கணக்கு உள்ளதா? உள்நுழையவும்](https://www.investonline.in/login)",
      contact: "\n\n📞 **உதவி தேவையா?**\nஎங்கள் குழு உங்களுக்காக இங்கே உள்ளது!\nமின்னஞ்சல்: wealth@investonline.in | தொலைபேசி: 1800-2222-65"
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
  session.conversationHistory.push(message);
  session.language = language; // Store user's language preference

  console.log(`📊 Question ${session.questionCount}/${QUESTION_LIMIT} | Language: ${LANGUAGE_NAMES[language]}`);

  // 🎁 Check question limit with benefits
  if (session.questionCount > QUESTION_LIMIT) {
    return {
      questionLimitReached: true,
      reply: getRegistrationBenefits(language),
      suggestions: []
    };
  }

  // Detect language from message (if not explicitly set)
  const detectedLang = detectLanguage(message);
  const finalLanguage = language || detectedLang;
  
  console.log(`🌐 Using language: ${LANGUAGE_NAMES[finalLanguage]}`);

  // Check if investment-related
  if (!isInvestmentRelated(message)) {
    const offTopicMessages = {
      en: "I'm specialized in helping with mutual fund investments, SIPs, account opening, KYC, nominations, and all investment-related processes on InvestOnline.in. 😊\n\nI can't answer questions outside of investment and finance topics.\n\nHow can I help you with your investments today?",
      hi: "मैं म्यूचुअल फंड निवेश, एसआईपी, खाता खोलना, केवाईसी, नामांकन और इन्वेस्टऑनलाइन पर सभी निवेश संबंधी प्रक्रियाओं में मदद करने में विशेषज्ञ हूं। 😊\n\nमैं निवेश और वित्त विषयों के बाहर के प्रश्नों का उत्तर नहीं दे सकता।\n\nआज मैं आपके निवेश में कैसे मदद कर सकता हूं?",
      mr: "मी म्युच्युअल फंड गुंतवणूक, एसआयपी, खाते उघडणे, केवायसी, नामांकन आणि इन्व्हेस्टऑनलाइनवरील सर्व गुंतवणूक प्रक्रियांमध्ये मदत करण्यात तज्ञ आहे। 😊\n\nमी गुंतवणूक आणि वित्त विषयांच्या बाहेरील प्रश्नांची उत्तरे देऊ शकत नाही।\n\nआज मी तुमच्या गुंतवणुकीत कशी मदत करू शकतो?",
      gu: "હું મ્યુચ્યુઅલ ફંડ રોકાણ, એસઆઈપી, ખાતું ખોલવું, કેવાયસી, નામાંકન અને ઇન્વેસ્ટઓનલાઇન પર તમામ રોકાણ સંબંધિત પ્રક્રિયાઓમાં મદદ કરવામાં નિષ્ણાત છું। 😊\n\nહું રોકાણ અને નાણાકીય વિષયોની બાહરના પ્રશ્નોના જવાબ આપી શકતો નથી।\n\nઆજે હું તમારા રોકાણમાં કેવી રીતે મદદ કરી શકું?",
      ta: "நான் மியூச்சுவல் ஃபண்ட் முதலீடு, எஸ்ஐபி, கணக்கு திறத்தல், கேவைசி, நியமனம் மற்றும் இன்வெஸ்ட்ஆன்லைனில் அனைத்து முதலீடு தொடர்பான செயல்முறைகளில் உதவுவதில் நிபுணர். 😊\n\nநான் முதலீடு மற்றும் நிதி தலைப்புகளுக்கு வெளியே உள்ள கேள்விகளுக்கு பதிலளிக்க முடியாது।\n\nஇன்று உங்கள் முதலீட்டில் நான் எவ்வாறு உதவ முடியும்?"
    };
    
    return {
      reply: offTopicMessages[finalLanguage] || offTopicMessages.en,
      suggestions: ['How to register?', 'What is SIP?', 'Contact Support']
    };
  }

  // Load flows.json
  const flows = require('../flows/flows.json');

  // 🌐 Try to match intent with translation
  const intentResult = await matchSimpleIntent(message, flows, finalLanguage);
  
  if (intentResult) {
    const smartSuggestions = generateSmartSuggestions(
      session.conversationHistory,
      intentResult.reply
    );
    
    return {
      reply: intentResult.reply,
      suggestions: smartSuggestions.length > 0 ? smartSuggestions : intentResult.suggestions
    };
  }

  // Fallback: Use OpenAI with translation
  try {
    const fallbackPrompt = `You are InvestOnline Buddy, helping with mutual fund investments. 
Answer in ${LANGUAGE_NAMES[finalLanguage]}.
Keep URLs intact.
Question: ${message}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: fallbackPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return {
      reply: response.choices[0].message.content.trim(),
      suggestions: ['How to register?', 'What is KYC?', 'Start SIP', 'Top Funds']
    };
  } catch (error) {
    console.error('❌ OpenAI error:', error);
    
    const fallbackMessages = {
      en: `I'd be happy to help! However, I need a bit more specific information.\n\nI can assist you with mutual funds, SIPs, KYC, registration, and all investment processes.\n\n📞 **Quick Contact:**\nEmail: wealth@investonline.in\nPhone: 1800-2222-65`,
      hi: `मुझे मदद करने में खुशी होगी! हालांकि, मुझे थोड़ी अधिक विशिष्ट जानकारी चाहिए।\n\nमैं म्यूचुअल फंड, एसआईपी, केवाईसी, पंजीकरण और सभी निवेश प्रक्रियाओं में आपकी सहायता कर सकता हूं।\n\n📞 **संपर्क:**\nईमेल: wealth@investonline.in\nफोन: 1800-2222-65`,
      mr: `मला मदत करण्यात आनंद होईल! तथापि, मला थोडी अधिक विशिष्ट माहिती हवी आहे।\n\nमी म्युच्युअल फंड, एसआयपी, केवायसी, नोंदणी आणि सर्व गुंतवणूक प्रक्रियांमध्ये तुम्हाला मदत करू शकतो।\n\n📞 **संपर्क:**\nईमेल: wealth@investonline.in\nफोन: 1800-2222-65`,
      gu: `મને મદદ કરવામાં આનંદ થશે! જો કે, મારે થોડી વધુ ચોક્કસ માહિતીની જરૂર છે।\n\nહું મ્યુચ્યુઅલ ફંડ, એસઆઈપી, કેવાયસી, નોંધણી અને તમામ રોકાણ પ્રક્રિયાઓમાં તમને મદદ કરી શકું છું।\n\n📞 **સંપર્ક:**\nઈમેલ: wealth@investonline.in\nફોન: 1800-2222-65`,
      ta: `நான் உதவ மகிழ்ச்சியாக இருக்கிறேன்! இருப்பினும், எனக்கு இன்னும் சில குறிப்பிட்ட தகவல் தேவை।\n\nநான் மியூச்சுவல் ஃபண்ட், எஸ்ஐபி, கேவைசி, பதிவு மற்றும் அனைத்து முதலீட்டு செயல்முறைகளிலும் உங்களுக்கு உதவ முடியும்।\n\n📞 **தொடர்பு:**\nமின்னஞ்சல்: wealth@investonline.in\nதொலைபேசி: 1800-2222-65`
    };

    return {
      reply: fallbackMessages[finalLanguage] || fallbackMessages.en,
      suggestions: ['How to register?', 'What is KYC?', 'Start SIP', 'Top Funds']
    };
  }
}

module.exports = { handleChat };
