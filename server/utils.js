// ---------------------------------------------------------------------------
// 1. Detect Investment Advice Requests (kept from your original code)
// ---------------------------------------------------------------------------
function containsInvestmentAdviceRequest(text) {
  const advKeywords = [
    "recommend",
    "which fund",
    "advice",
    "suggest a fund",
    "which sip",
    "what should i invest",
    "best fund",
    "should i invest"
  ];
  const t = text.toLowerCase();
  return advKeywords.some(k => t.includes(k));
}

// ---------------------------------------------------------------------------
// 2. Helpers for normalizing text
// ---------------------------------------------------------------------------
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// 3. Improved fuzzy intent matcher (new logic)
// ---------------------------------------------------------------------------
function matchScriptedResponse(message, flows) {
  const msg = normalize(message);

  // ---- (A) Quick intents (simple keyword matches)
  if (flows.quick_intents) {
    for (const key of Object.keys(flows.quick_intents)) {
      if (msg.includes(normalize(key))) {
        return flows.quick_intents[key];
      }
    }
  }

  // ---- (B) Fuzzy intents with keywords + synonyms
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

  // -----------------------------------------------------------------------
  // (C) Legacy fallback rules (keeps your existing flows working)
  // -----------------------------------------------------------------------
  const t = msg;

  // Registration cycle
  if (/register|sign up|open account/.test(t)) return flows.onboarding?.register;

  // KYC variations
  if (/kyc|ekyc|what is kyc/.test(t)) return flows.onboarding?.kyc;

  // PAN
  if (/pan|pan card/.test(t)) return flows.documents?.pan;

  // Aadhaar
  if (/aadhaar|aadhar/.test(t)) return flows.documents?.aadhaar;

  // Document list
  if (/documents|what documents/.test(t)) return flows.documents?.list;

  // Time to register
  if (/how long|time to register|how long takes/.test(t)) return flows.onboarding?.time;

  return null;
}

// ---------------------------------------------------------------------------
// 4. Export both functions
// ---------------------------------------------------------------------------
module.exports = {
  containsInvestmentAdviceRequest,
  matchScriptedResponse
};
