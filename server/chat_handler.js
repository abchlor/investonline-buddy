const { getSession, setSession } = require('./session_store');
const flows = require('../flows/flows.json');
const { callOpenAI } = require('./llm');
const { matchScriptedResponse, containsInvestmentAdviceRequest } = require('./utils');

const SYSTEM_INSTRUCTIONS = `
You are InvestOnline Buddy — an official onboarding and support assistant for InvestOnline.in.

Allowed topics:
- Registration, onboarding, KYC, SIP
- Mutual fund flows supported by InvestOnline
- InvestOnline website, tools, calculators
- Blogs, articles, contact support

Website reference:
- Blogs: https://www.investonline.in/blogs
- SIP Calculator: https://www.investonline.in/sip-calculator
- Lumpsum Calculator: https://www.investonline.in/lumpsum-calculator
- Contact: https://www.investonline.in/contact-us
- Registration: https://www.investonline.in/register

Rules:
- Do NOT provide investment advice.
- Do NOT recommend funds.
- Do NOT answer outside InvestOnline scope.
- If asked an off-topic question, answer:
  "I can help only with InvestOnline-related queries. Please ask me something about our services."
`;

const BLOCKED = [
  "weather","movie","song","recipe","cricket","football",
  "bollywood","hollywood","math","joke","politics","celebrity"
];

const isIrrelevant = m =>
  BLOCKED.some(w => m.toLowerCase().includes(w));

async function handleChat({ session_id, message, page = "/", lang = "en" }) {
  const session = (await getSession(session_id)) || { turns: [] };
  session.turns.push({ role: 'user', text: message, ts: Date.now(), page });

  // A) Off-topic filter
  if (isIrrelevant(message)) {
    const reply = "I can help only with InvestOnline-related queries. Please ask me something about our services.";
    session.turns.push({ role: 'bot', text: reply });
    await setSession(session_id, session);
    return { reply, suggested: flows.quick_replies };
  }

  // B) Investment-advice blocking
  if (containsInvestmentAdviceRequest(message)) {
    const reply =
      "I can't provide specific investment advice here. Would you like to open the AI Research Assistant instead?";
    session.turns.push({ role: 'bot', text: reply });
    await setSession(session_id, session);
    return { reply, suggested: ["Open Research Assistant", "General info about SIP"] };
  }

  // C) Page-aware (optional, easy to expand)
  if (page.includes("sip") && message.toLowerCase().includes("how")) {
    const reply =
      "You're on the SIP page. SIP allows monthly investing. Want help calculating an amount or starting a SIP?";
    session.turns.push({ role: "bot", text: reply });
    await setSession(session_id, session);
    return { reply, suggested: ["Open SIP Calculator", "Benefits of SIP"] };
  }

  // D) Scripted response (flows + site-wide search)
  const scripted = matchScriptedResponse(message, flows);
  if (scripted) {
    const reply = scripted.response;
    const suggested = scripted.suggested;

    session.turns.push({ role: 'bot', text: reply });
    await setSession(session_id, session);

    return { reply, suggested };
  }

  // E) LLM fallback (domain-restricted)
  const context = session.turns.slice(-6)
    .map(t => `${t.role === "user" ? "User" : "Bot"}: ${t.text}`)
    .join("\n");

  const prompt = `
${SYSTEM_INSTRUCTIONS}

Context:
${context}

User: ${message}
Reply concisely and strictly according to the rules.
`;

  const llmResp = await callOpenAI(prompt);

  session.turns.push({ role: 'bot', text: llmResp });
  await setSession(session_id, session);

  // F) Optional: AI-generated suggestions (currently OFF)
  const suggested = flows.quick_replies;

  return { reply: llmResp, suggested };
}

module.exports = { handleChat };
