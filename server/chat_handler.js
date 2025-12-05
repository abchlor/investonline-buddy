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

// helper: parse LLM lines "Question? | Button Label"
function parseSuggestionLines(raw) {
  if (!raw) return [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const labels = [];
  for (const ln of lines) {
    const parts = ln.split('|');
    if (parts.length >= 2) {
      labels.push(parts[1].trim());
    } else {
      // fallback: use the whole line as label (safe)
      labels.push(ln);
    }
  }
  return labels.slice(0, 3);
}

// Generate 3 action-chip labels using a tiny LLM prompt (gpt-4o-mini)
async function generateActionChips(replyText) {
  const prompt = `Generate up to 3 short follow-up suggestions strictly related to InvestOnline features and pages based on this reply:

"${replyText}"

Return ONLY lines in this exact format:
Question? | Button Label

Examples:
How do I complete e-KYC? | Complete e-KYC
Which documents are needed? | Required Documents

Do NOT include general finance topics or external sites.`;

  // callOpenAI enforces gpt-4o-mini in your llm.js
  try {
    const raw = await callOpenAI(prompt);
    const labels = parseSuggestionLines(raw);
    return labels;
  } catch (e) {
    console.error("Suggestion LLM error:", e);
    return [];
  }
}

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

  // C) Page-aware (simple)
  if (page.includes("sip") && message.toLowerCase().includes("how")) {
    const reply =
      "You're on the SIP page. SIP allows monthly investing. Want help calculating an amount or starting a SIP?";
    session.turns.push({ role: "bot", text: reply });
    await setSession(session_id, session);

    // generate chips
    const chips = await generateActionChips(reply);
    const suggested = chips.length ? chips : ["Open SIP Calculator", "Benefits of SIP"];
    return { reply, suggested };
  }

  // D) Scripted response (flows + site-wide search)
  const scripted = matchScriptedResponse(message, flows);
  if (scripted) {
    const reply = scripted.response;
    session.turns.push({ role: 'bot', text: reply });
    await setSession(session_id, session);

    // Generate action chips (LLM). If it fails, use scripted suggestions.
    const chips = await generateActionChips(reply);
    const suggested = chips.length ? chips : (scripted.suggested || flows.quick_replies);
    return { reply, suggested };
  }

  // E) LLM fallback (domain-restricted) — full answer + suggestions
  const context = session.turns.slice(-6)
    .map(t => `${t.role === "user" ? "User" : "Bot"}: ${t.text}`)
    .join("\n");

  const prompt = `
${SYSTEM_INSTRUCTIONS}

Context:
${context}

User: ${message}

Reply concisely and strictly according to the rules.`;

  const llmResp = await callOpenAI(prompt);

  session.turns.push({ role: 'bot', text: llmResp });
  await setSession(session_id, session);

  // generate action chips for the LLM reply
  const chips = await generateActionChips(llmResp);
  const suggested = chips.length ? chips : flows.quick_replies;

  return { reply: llmResp, suggested };
}

module.exports = { handleChat };
