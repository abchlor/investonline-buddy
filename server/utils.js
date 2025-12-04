function containsInvestmentAdviceRequest(text) {
  const advKeywords = ['recommend', 'which fund', 'advice', 'suggest a fund', 'which sip', 'what should i invest', 'best fund', 'should i invest'];
  const t = text.toLowerCase();
  return advKeywords.some(k => t.includes(k));
}

function matchScriptedResponse(text, flows) {
  const t = text.toLowerCase().trim();
  // 1. exact matches for quick intents
  if (/register|sign up|open account/.test(t)) return flows.onboarding.register;
  if (/kyc|what is kyc/.test(t)) return flows.onboarding.kyc;
  if (/pan|pan card/.test(t)) return flows.documents.pan;
  if (/aadhaar|aadhar/.test(t)) return flows.documents.aadhaar;
  if (/documents|what documents/.test(t)) return flows.documents.list;
  if (/how long|time to register|how long takes/.test(t)) return flows.onboarding.time;
  // fallback: check for keywords in each flow entry
  for (const k of Object.keys(flows.quick_intents || {})) {
    if (t.includes(k)) return flows.quick_intents[k];
  }
  return null;
}

module.exports = { containsInvestmentAdviceRequest, matchScriptedResponse };
