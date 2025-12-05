const { getSession, setSession } = require('./session_store');
const flows = require('../flows/flows.json');
const { callOpenAI } = require('./llm');
const { matchScriptedResponse, containsInvestmentAdviceRequest } = require('./utils');

// Strict system guardrails for InvestOnline
const SYSTEM_INSTRUCTIONS = `
You are InvestOnline Buddy — an official onboarding and support assistant for InvestOnline.in.

You MUST stay within this scope:
- InvestOnline website, app, login, account creation
- KYC, SIP, onboarding process, documentation
- Mutual fund processes supported by InvestOnline only
- FAQs, forms, service features, portal/app navigation

If user asks ANYTHING outside this scope, reply exactly:
"I can help only with InvestOnline-related queries. Please ask me something about our services."

Do NOT:
- give investment advice
- recommend specific mutual funds
- generate content unrelated to InvestOnline
- answer personal finance questions outside InvestOnline processes
- guess facts; answer only what InvestOnline supports
`;

// Off-topic keyword filter
const BLOCKED_KEYWORDS = [
  "weather","movie","song","recipe","cooking","football","cricket",
  "bollywood","hollywood","music","math","joke","riddle","politics",
  "celebrity","sports","news","random","science","geography","history"
];

function isIrrelevant(text) {
  const m = text.toLowerCase();
  return BLOCKED_KEYWORDS.some(w => m.includes(w));
}

async function handleChat({ session_id, message, page, lang }) {
  const session = (await getSession(session_id)) || { turns: [] };
  session.turns.push({ role: 'user', text: message, ts: Date.now(), page });

  // 0) Off-topic suppression BEFORE anything else
  if (isIrrelevant(message)) {
    const fallback = "I can help only with InvestOnline-related queries. Please ask me something about our services.";
    session.turns.push({ role: 'bot', text: fallback });
    await setSession(session_id, session);
    return { reply: fallback, suggested: flows.quick_replies || [] };
  }

  // 1) Safety: Investment advice check
  if (containsInvestmentAdviceRequest(message)) {
    const redirectText =
      "I can't provide specific investment advice here. For personalised recommendations, please use our AI Research Assistant or connect with our financial advisor. Would you like me to open the Research Assistant?";
    session.turns.push({ role: 'bot', text: redirectText });
    await setSession(session_id, session);
    return {
      reply: redirectText,
      suggested: ["Open Research Assistant", "General info about SIP"]
    };
  }

  // 2) Deterministic scripted responses (your flows.json)
  const scripted = matchScriptedResponse(message, flows);
  if (scripted) {
    session.turns.push({ role: 'bot', text: scripted });
    await setSession(session_id, session);
    return { reply: scripted, suggested: flows.quick_replies || [] };
  }

  // 3) LLM fallback (short, controlled context)
  const context = session.turns
    .slice(-6)
    .map(t => `${t.role === 'user' ? 'User' : 'Bot'}: ${t.text}`)
    .join('\n');

  const prompt =
`${SYSTEM_INSTRUCTIONS}

Context:
${context}

User: ${message}

Reply:`;

  // 4) Call LLM (mini model enforced)
  const llmResp = await callOpenAI(prompt, "gpt-4o-mini");

  // Save and return
  session.turns.push({ role: 'bot', text: llmResp });
  await setSession(session_id, session);

  return {
    reply: llmResp,
    suggested: flows.quick_replies || []
  };
}

module.exports = { handleChat };
