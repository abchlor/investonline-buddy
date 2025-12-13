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
  login: 'https://www.investonline.in/features/register-with-pan-card', // ✅ FIXED: Same as register (no separate login URL)
  topFunds: 'https://www.investonline.in/mutual-funds/top-performing-funds',
  // ✅ EQUITY FUNDS - All Categories
  largeCap: 'https://www.investonline.in/mutual-funds/top-performing-funds/31/equity-large-cap-fund',
  midCap: 'https://www.investonline.in/mutual-funds/top-performing-funds/32/equity-mid-cap-fund',
  smallCap: 'https://www.investonline.in/mutual-funds/top-performing-funds/33/equity-small-cap-fund',
  largeMidCap: 'https://www.investonline.in/mutual-funds/top-performing-funds/61/equity-large-mid-cap-fund',
  multiCap: 'https://www.investonline.in/mutual-funds/top-performing-funds/49/equity-multi-cap-fund',
  focusedFund: 'https://www.investonline.in/mutual-funds/top-performing-funds/63/equity-focused-fund',
  valueFund: 'https://www.investonline.in/mutual-funds/top-performing-funds/62/equity-value-fund',
  contraFund: 'https://www.investonline.in/mutual-funds/top-performing-funds/36/equity-contra-fund',
  dividendYield: 'https://www.investonline.in/mutual-funds/top-performing-funds/35/equity-dividend-yield-fund',
  elss: 'https://www.investonline.in/mutual-funds/top-performing-funds/8/elss',
  // Sectoral Funds
  sectoralInfra: 'https://www.investonline.in/mutual-funds/top-performing-funds/42/equity-sectoral-fund-infrastructure',
  sectoralPharma: 'https://www.investonline.in/mutual-funds/top-performing-funds/10/equity-sectoral-fund-pharma-health-care',
  sectoralTech: 'https://www.investonline.in/mutual-funds/top-performing-funds/6/equity-sectoral-fund-technology',
  
  // ✅ HYBRID FUNDS - All Categories
  hybridAggressive: 'https://www.investonline.in/mutual-funds/top-performing-funds/12/hybrid-aggressive-hybrid-fund',
  hybridConservative: 'https://www.investonline.in/mutual-funds/top-performing-funds/14/hybrid-conservative-hybrid-fund',
  hybridBalanced: 'https://www.investonline.in/mutual-funds/top-performing-funds/75/hybrid-balanced-advantage',
  hybridDynamic: 'https://www.investonline.in/mutual-funds/top-performing-funds/74/hybrid-dynamic-asset-allocation',
  hybridEquitySavings: 'https://www.investonline.in/mutual-funds/top-performing-funds/57/hybrid-equity-savings',
  hybridMultiAsset: 'https://www.investonline.in/mutual-funds/top-performing-funds/54/hybrid-multi-asset-allocation',
  hybridArbitrage: 'https://www.investonline.in/mutual-funds/top-performing-funds/19/arbitrage-equity',
  retirementEquity: 'https://www.investonline.in/mutual-funds/top-performing-funds/87/solution-oriented-retirement-fund-equity',
  retirementDebt: 'https://www.investonline.in/mutual-funds/top-performing-funds/77/solution-oriented-retirement-fund-debt',
  
  // ✅ DEBT FUNDS - All Categories
  liquidFund: 'https://www.investonline.in/mutual-funds/top-performing-funds/24/liquid-fund',
  ultraShortDuration: 'https://www.investonline.in/mutual-funds/top-performing-funds/17/ultra-short-duration-fund',
  lowDuration: 'https://www.investonline.in/mutual-funds/top-performing-funds/66/low-duration-fund',
  moneyMarket: 'https://www.investonline.in/mutual-funds/top-performing-funds/67/money-market-fund',
  shortDuration: 'https://www.investonline.in/mutual-funds/top-performing-funds/16/short-duration-fund',
  mediumDuration: 'https://www.investonline.in/mutual-funds/top-performing-funds/45/medium-duration-fund',
  longDuration: 'https://www.investonline.in/mutual-funds/top-performing-funds/18/long-duration-fund',
  dynamicBond: 'https://www.investonline.in/mutual-funds/top-performing-funds/71/dynamic-bond',
  creditRisk: 'https://www.investonline.in/mutual-funds/top-performing-funds/70/credit-risk-fund',
  bankingPSU: 'https://www.investonline.in/mutual-funds/top-performing-funds/69/banking-and-psu-fund',
  floaterFund: 'https://www.investonline.in/mutual-funds/top-performing-funds/28/floater-fund',
  internalMonthly: 'https://www.investonline.in/mutual-funds/top-performing-funds/20/internal-funds-monthly',
  
  // ✅ OTHER CATEGORIES
  fofsEquity: 'https://www.investonline.in/mutual-funds/top-performing-funds/81/fofs-domestic-equity-oriented',
  fixedMaturity: 'https://www.investonline.in/mutual-funds/top-performing-funds/21/fixed-maturity-plans',
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
    // EQUITY FUNDS
    'large cap': ['large cap', 'largecap', 'blue chip', 'large-cap', 'big cap'],
    'mid cap': ['mid cap', 'midcap', 'mid-cap', 'medium cap'],
    'small cap': ['small cap', 'smallcap', 'small-cap'],
    'large mid cap': ['large mid cap', 'large and mid cap', 'large & mid cap', 'largemidcap'],
    'multi cap': ['multi cap', 'multicap', 'multi-cap', 'diversified equity'],
    'flexi cap': ['flexi cap', 'flexicap', 'flexi-cap', 'flexible cap'],
    'focused fund': ['focused', 'focused fund', 'focus fund', 'concentrated'],
    'value fund': ['value', 'value fund', 'value investing'],
    'contra fund': ['contra', 'contra fund', 'contrarian'],
    'dividend yield': ['dividend yield', 'dividend', 'high dividend'],
    'elss': ['elss', 'tax saving', 'tax saver', '80c', 'tax benefit'],
    
    // SECTORAL FUNDS
    'sectoral infrastructure': ['infrastructure', 'infra fund', 'construction'],
    'sectoral pharma': ['pharma', 'pharmaceutical', 'healthcare', 'health care'],
    'sectoral technology': ['technology', 'tech', 'it fund', 'information technology'],
    
    // HYBRID FUNDS
    'hybrid aggressive': ['aggressive hybrid', 'balanced aggressive', 'equity oriented hybrid'],
    'hybrid conservative': ['conservative hybrid', 'debt oriented hybrid'],
    'hybrid balanced': ['balanced advantage', 'balanced hybrid', 'dynamic equity'],
    'hybrid dynamic': ['dynamic asset allocation', 'asset allocation fund'],
    'hybrid equity savings': ['equity savings', 'arbitrage equity'],
    'hybrid multi asset': ['multi asset', 'multi-asset', 'multiple asset'],
    'hybrid arbitrage': ['arbitrage', 'arbitrage fund'],
    'retirement': ['retirement', 'retirement fund', 'pension'],
    
    // DEBT FUNDS
    'liquid': ['liquid', 'liquid fund', 'overnight'],
    'ultra short': ['ultra short', 'ultra-short', 'ultra short duration'],
    'low duration': ['low duration', 'low-duration'],
    'money market': ['money market'],
    'short duration': ['short duration', 'short-duration', 'short term'],
    'medium duration': ['medium duration', 'medium-duration', 'medium term'],
    'long duration': ['long duration', 'long-duration', 'long term', 'gilt'],
    'dynamic bond': ['dynamic bond', 'income fund'],
    'credit risk': ['credit risk', 'credit opportunities'],
    'banking psu': ['banking psu', 'banking and psu', 'psu fund'],
    'floater': ['floater', 'floating rate'],
    
    // OTHER
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
// NEW v7: Translate Suggestions to Regional Languages
// ====================================
function translateSuggestions(suggestions, language) {
  if (language === 'en' || !suggestions) return suggestions;
  
  const translationMap = {
    'hi': {
      'Top Mutual Funds': 'टॉप म्यूचुअल फंड',
      'SIP Calculator': 'SIP कैलकुलेटर',
      'Compare Funds': 'फंड तुलना करें',
      'Contact Support': 'सपोर्ट से संपर्क करें',
      'How to register?': 'रजिस्टर कैसे करें?',
      'What is KYC?': 'KYC क्या है?',
      'Start SIP': 'SIP शुरू करें',
      'Start investing': 'निवेश शुरू करें',
      'Asset Allocation': 'एसेट एलोकेशन',
      'Risk Profile': 'जोखिम प्रोफ़ाइल',
      'Portfolio Review': 'पोर्टफोलियो समीक्षा',
      'Retirement Planning': 'रिटायरमेंट योजना',
      'Diversification': 'विविधीकरण',
      'Large Cap funds': 'लार्ज कैप फंड',
      'Complete KYC': 'KYC पूरा करें',
      'First SIP': 'पहला SIP',
      'Registration benefits': 'रजिस्ट्रेशन के फायदे',
      'All Calculators': 'सभी कैलकुलेटर',
      'Invest Guide Magazine': 'इन्वेस्ट गाइड मैगज़ीन',
      'Retirement calculator': 'रिटायरमेंट कैलकुलेटर',
      'Goal planning': 'लक्ष्य योजना',
      'Latest articles': 'नवीनतम लेख',
      'Investment tips': 'निवेश टिप्स',
      'Market insights': 'मार्केट इनसाइट्स',
      'Legal heir': 'कानूनी उत्तराधिकारी',
      'Top ELSS funds': 'टॉप ELSS फंड',
      'Tax benefits': 'टैक्स लाभ',
      'Documents needed': 'आवश्यक दस्तावेज़',
    },
    'mr': {
      'Top Mutual Funds': 'टॉप म्युच्युअल फंड',
      'SIP Calculator': 'SIP कॅल्क्युलेटर',
      'Compare Funds': 'फंड तुलना करा',
      'Contact Support': 'सपोर्टशी संपर्क साधा',
      'Asset Allocation': 'मालमत्ता वाटप',
      'Start SIP': 'SIP सुरू करा',
      'All Calculators': 'सर्व कॅल्क्युलेटर',
      'Invest Guide Magazine': 'इन्वेस्ट गाइड मॅगझिन',
      'Retirement Planning': 'रिटायरमेंट नियोजन',
      'Retirement calculator': 'रिटायरमेंट कॅल्क्युलेटर',
      'Legal heir': 'कायदेशीर वारस',
      'Portfolio Review': 'पोर्टफोलिओ पुनरावलोकन',
    },
    'gu': {
      'Top Mutual Funds': 'ટોપ મ્યુચ્યુઅલ ફંડ',
      'SIP Calculator': 'SIP કેલ્ક્યુલેટર',
      'Compare Funds': 'ફંડ તુલના કરો',
      'Contact Support': 'સપોર્ટનો સંપર્ક કરો',
      'Asset Allocation': 'અસેટ એલોકેશન',
      'All Calculators': 'બધા કેલ્ક્યુલેટર',
      'Invest Guide Magazine': 'ઇન્વેસ્ટ ગાઇડ મેગેઝિન',
      'Retirement Planning': 'રિટાયરમેન્ટ આયોજન',
      'Legal heir': 'કાનૂની વારસદાર',
    },
    'ta': {
      'Top Mutual Funds': 'டாப் மியூச்சுவல் ஃபண்டுகள்',
      'SIP Calculator': 'SIP கணக்கீட்டாளர்',
      'Compare Funds': 'ஃபண்டுகள் ஒப்பிடு',
      'Contact Support': 'ஆதரவைத் தொடர்பு கொள்ளவும்',
      'Asset Allocation': 'சொத்து ஒதுக்கீடு',
      'All Calculators': 'அனைத்து கணக்கீட்டாளர்கள்',
      'Invest Guide Magazine': 'இன்வெஸ்ட் கைட் பத்திரிகை',
      'Retirement Planning': 'ஓய்வூதிய திட்டமிடல்',
      'Legal heir': 'சட்ட வாரிசு',
    }
  };
  
  const map = translationMap[language] || {};
  return suggestions.map(s => map[s] || s);
}

// ====================================
// FIXED: Enhanced Response with CTAs (Only Valid URLs)
// ====================================
function enhanceResponseWithCTA(response, intent, category = null, urls = []) {
  let enhanced = response;
  
  // Add category-specific URL if available
  if (category) {
    const categoryURLMap = {
      // EQUITY FUNDS
      'large cap': ['Large Cap', INVESTONLINE_URLS.largeCap],
      'mid cap': ['Mid Cap', INVESTONLINE_URLS.midCap],
      'small cap': ['Small Cap', INVESTONLINE_URLS.smallCap],
      'large mid cap': ['Large & Mid Cap', INVESTONLINE_URLS.largeMidCap],
      'multi cap': ['Multi Cap', INVESTONLINE_URLS.multiCap],
      'focused fund': ['Focused', INVESTONLINE_URLS.focusedFund],
      'value fund': ['Value', INVESTONLINE_URLS.valueFund],
      'contra fund': ['Contra', INVESTONLINE_URLS.contraFund],
      'dividend yield': ['Dividend Yield', INVESTONLINE_URLS.dividendYield],
      'elss': ['ELSS Tax Saving', INVESTONLINE_URLS.elss],
      
      // SECTORAL FUNDS
      'sectoral infrastructure': ['Infrastructure', INVESTONLINE_URLS.sectoralInfra],
      'sectoral pharma': ['Pharma & Healthcare', INVESTONLINE_URLS.sectoralPharma],
      'sectoral technology': ['Technology', INVESTONLINE_URLS.sectoralTech],
      
      // HYBRID FUNDS
      'hybrid aggressive': ['Aggressive Hybrid', INVESTONLINE_URLS.hybridAggressive],
      'hybrid conservative': ['Conservative Hybrid', INVESTONLINE_URLS.hybridConservative],
      'hybrid balanced': ['Balanced Advantage', INVESTONLINE_URLS.hybridBalanced],
      'hybrid dynamic': ['Dynamic Asset Allocation', INVESTONLINE_URLS.hybridDynamic],
      'hybrid equity savings': ['Equity Savings', INVESTONLINE_URLS.hybridEquitySavings],
      'hybrid multi asset': ['Multi Asset Allocation', INVESTONLINE_URLS.hybridMultiAsset],
      'hybrid arbitrage': ['Arbitrage', INVESTONLINE_URLS.hybridArbitrage],
      'retirement': ['Retirement', INVESTONLINE_URLS.retirementEquity],
      
      // DEBT FUNDS
      'liquid': ['Liquid', INVESTONLINE_URLS.liquidFund],
      'ultra short': ['Ultra Short Duration', INVESTONLINE_URLS.ultraShortDuration],
      'low duration': ['Low Duration', INVESTONLINE_URLS.lowDuration],
      'money market': ['Money Market', INVESTONLINE_URLS.moneyMarket],
      'short duration': ['Short Duration', INVESTONLINE_URLS.shortDuration],
      'medium duration': ['Medium Duration', INVESTONLINE_URLS.mediumDuration],
      'long duration': ['Long Duration', INVESTONLINE_URLS.longDuration],
      'dynamic bond': ['Dynamic Bond', INVESTONLINE_URLS.dynamicBond],
      'credit risk': ['Credit Risk', INVESTONLINE_URLS.creditRisk],
      'banking psu': ['Banking & PSU', INVESTONLINE_URLS.bankingPSU],
      'floater': ['Floater', INVESTONLINE_URLS.floaterFund],
    };
    
    const categoryInfo = categoryURLMap[category];
    if (categoryInfo && !enhanced.includes(categoryInfo[1])) {
      enhanced += `\n\n**[Explore ${categoryInfo[0]} Funds →](${categoryInfo[1]})**`;
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
    
    // NEW v7: Asset Allocation & Portfolio
    'allocation', 'asset allocation', 'diversification', 'diversify',
    'portfolio mix', 'asset mix', 'rebalance', 'rebalancing',
    
    // NEW v7: Top Funds queries
    'top funds', 'top mutual funds', 'best mutual funds', 'top rated',
    
    // Hindi Keywords (Comprehensive)
    'निवेश', 'म्यूचुअल फंड', 'म्युचुअल', 'फंड', 'केवाईसी', 'रजिस्टर',
    'रजिस्ट्रेशन', 'एसआईपी', 'एसेट', 'एलोकेशन', 'आवंटन',
    'पोर्टफोलियो', 'टॉप', 'सर्वश्रेष्ठ', 'शीर्ष', 'कैलकुलेटर',
    'खाता', 'खोलना', 'ट्रैकिंग', 'सिफारिशें', 'मार्गदर्शन',
    
    // Marathi
    'गुंतवणूक', 'फंड', 'नोंदणी', 'मालमत्ता', 'वाटप', 'पोर्टफोलिओ',
    
    // Gujarati  
    'રોકાણ', 'ફંડ', 'નોંધણી', 'સંપત્તિ', 'ફાળવણી',
    
    // Tamil
    'முதலீடு', 'நிதி', 'பதிவு', 'சொத்து', 'ஒதுக்கீடு',
    
    // Hinglish
    'kaise', 'kya hai', 'chahiye', 'banao', 'shuru', 'kare',
    'registration', 'fund', 'sip', 'top', 'best', 'achhe',
    'portfolio', 'calculator', 'asset', 'allocation',
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

  // ✅ FIX v7.3: Removed isInvestmentRelated() check
  // Let flows.json be the source of truth for investment topics
  // If not found in flows.json, OpenAI fallback will handle it

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
    let suggestions = getContextualSuggestions(matchedIntent.intent, language, session.conversationHistory);
    suggestions = translateSuggestions(suggestions, language); // ✅ TRANSLATE
    
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
    let suggestions = getContextualSuggestions('general', language, session.conversationHistory);
    suggestions = translateSuggestions(suggestions, language); // ✅ TRANSLATE

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
