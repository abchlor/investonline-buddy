// ---------------------------
// 1. Detect investment advice
// ---------------------------
function containsInvestmentAdviceRequest(text) {
  const advKeywords = [
    "recommend", "which fund", "advice", "suggest a fund",
    "which sip", "what should i invest", "best fund", "should i invest"
  ];
  const t = text.toLowerCase();
  return advKeywords.some(k => t.includes(k));
}

// ---------------------------
// 2. Normalizer
// ---------------------------
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
}

// ---------------------------
// 3. Fuzzy intent + site search
// ---------------------------
function matchScriptedResponse(message, flows) {
  const msg = normalize(message);

  // A) quick intents
  if (flows.quick_intents) {
    for (const key in flows.quick_intents) {
      if (msg.includes(normalize(key))) {
        return {
          response: flows.quick_intents[key],
          suggested: flows.quick_replies || []
        };
      }
    }
  }

  // B) intents (KYC, SIP, login, support etc.)
  if (flows.intents) {
    for (const name in flows.intents) {
      const intent = flows.intents[name];
      const keywords = [...(intent.keywords || []), ...(intent.synonyms || [])].map(normalize);

      if (keywords.some(k => msg.includes(k))) {
        return {
          response: intent.response,
          suggested: intent.suggested || flows.quick_replies || []
        };
      }
    }
  }

  // C) site-wide search (blogs, calculators, contact)
  if (flows.site) {
    for (const name in flows.site) {
      const intent = flows.site[name];
      const keywords = [...(intent.keywords || []), ...(intent.synonyms || [])].map(normalize);

      if (keywords.some(k => msg.includes(k))) {
        return {
          response: intent.response,
          suggested: intent.suggested || flows.quick_replies || []
        };
      }
    }
  }

  // D) legacy fallback
  const t = msg;

  if (/register|sign up|open account/.test(t))
    return { response: flows.onboarding.register, suggested: flows.quick_replies };

  if (/kyc|ekyc|what is kyc/.test(t))
    return { response: flows.onboarding.kyc, suggested: flows.quick_replies };

  if (/pan|pan card/.test(t))
    return { response: flows.documents.pan, suggested: flows.quick_replies };

  if (/aadhaar|aadhar/.test(t))
    return { response: flows.documents.aadhaar, suggested: flows.quick_replies };

  if (/documents|what documents/.test(t))
    return { response: flows.documents.list, suggested: flows.quick_replies };

  if (/how long|time to register|how long takes/.test(t))
    return { response: flows.onboarding.time, suggested: flows.quick_replies };

  return null;
}

module.exports = {
  containsInvestmentAdviceRequest,
  matchScriptedResponse
};
