// ---------------------------------------------------------
// 1. Block investment advice requests
// ---------------------------------------------------------
function containsInvestmentAdviceRequest(text) {
  const adviceKeywords = [
    "which fund",
    "recommend",
    "suggest a fund",
    "best mutual fund",
    "best sip",
    "what should i invest",
    "should i invest",
    "give advice",
    "portfolio advice"
  ];

  const t = text.toLowerCase();
  return adviceKeywords.some(k => t.includes(k));
}

// ---------------------------------------------------------
// 2. Normalize text for matching
// ---------------------------------------------------------
function normalize(txt) {
  return txt
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
}

// ---------------------------------------------------------
// 3. Flexible intent + site-section matcher
// ---------------------------------------------------------
function matchScriptedResponse(message, flows) {
  const msg = normalize(message);

  // A) QUICK INTENTS
  if (flows.quick_intents) {
    for (const key in flows.quick_intents) {
      const normKey = normalize(key);
      if (msg.includes(normKey)) {
        return {
          response: flows.quick_intents[key],
          suggested: flows.quick_replies || []
        };
      }
    }
  }

  // B) MAIN INTENTS (KYC, SIP, login, support, etc.)
  if (flows.intents) {
    for (const name in flows.intents) {
      const intent = flows.intents[name];
      const allKeywords = [
        ...(intent.keywords || []),
        ...(intent.synonyms || [])
      ].map(normalize);

      const matched = allKeywords.some(kw => msg.includes(kw));

      if (matched) {
        return {
          response: intent.response,
          suggested: intent.suggested || flows.quick_replies || []
        };
      }
    }
  }

  // C) SITE-LEVEL INTENTS (blogs, tools, contact)
  if (flows.site) {
    for (const name in flows.site) {
      const intent = flows.site[name];
      const allKeywords = [
        ...(intent.keywords || []),
        ...(intent.synonyms || [])
      ].map(normalize);

      if (allKeywords.some(kw => msg.includes(kw))) {
        return {
          response: intent.response,
          suggested: intent.suggested || flows.quick_replies || []
        };
      }
    }
  }

  // D) FALLBACK RULES (for common phrases not covered in intents)
  const t = msg;

  if (/register|sign up|open account/.test(t)) {
    return {
      response: flows.onboarding.register,
      suggested: flows.quick_replies
    };
  }

  if (/kyc|ekyc|what is kyc/.test(t)) {
    return {
      response: flows.onboarding.kyc,
      suggested: flows.quick_replies
    };
  }

  if (/pan|pan card/.test(t)) {
    return {
      response: flows.documents.pan,
      suggested: flows.quick_replies
    };
  }

  if (/aadhaar|aadhar/.test(t)) {
    return {
      response: flows.documents.aadhaar,
      suggested: flows.quick_replies
    };
  }

  if (/documents|what documents/.test(t)) {
    return {
      response: flows.documents.list,
      suggested: flows.quick_replies
    };
  }

  if (/how long|time to register|how long takes/.test(t)) {
    return {
      response: flows.onboarding.time,
      suggested: flows.quick_replies
    };
  }

  return null; // no intent matched → LLM fallback
}

module.exports = {
  containsInvestmentAdviceRequest,
  matchScriptedResponse
};
