function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
}

function matchScriptedResponse(message, flows) {
  const msg = normalize(message);

  // 1) Exact quick-intents (existing behavior preserved)
  if (flows.quick_intents) {
    for (const key of Object.keys(flows.quick_intents)) {
      if (msg.includes(normalize(key))) {
        return flows.quick_intents[key];
      }
    }
  }

  // 2) Intent-based fuzzy matching
  if (flows.intents) {
    for (const intentName in flows.intents) {
      const intent = flows.intents[intentName];
      const keywords = (intent.keywords || []).map(normalize);
      const synonyms = (intent.synonyms || []).map(normalize);
      const triggers = [...keywords, ...synonyms];

      for (const t of triggers) {
        if (msg.includes(t)) {
          return intent.response;
        }
      }
    }
  }

  // 3) Legacy onboard/document matching (keep your existing flows)
  const t = msg;

  if (/register|sign up|open account/.test(t)) return flows.onboarding.register;
  if (/kyc|ekyc|what is kyc/.test(t)) return flows.onboarding.kyc;
  if (/pan|pan card/.test(t)) return flows.documents.pan;
  if (/aadhaar|aadhar/.test(t)) return flows.documents.aadhaar;
  if (/documents|what documents/.test(t)) return flows.documents.list;
  if (/how long|time to register|how long takes/.test(t)) return flows.onboarding.time;

  return null;
}

module.exports = { containsInvestmentAdviceRequest, matchScriptedResponse };
