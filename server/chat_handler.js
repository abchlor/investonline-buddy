const { getSession, setSession } = require('./session_store');
const flows = require('../flows/flows.json');
const { callOpenAI } = require('./llm');
const { matchScriptedResponse, containsInvestmentAdviceRequest } = require('./utils');

async function handleChat({ session_id, message, page, lang }) {
  const session = (await getSession(session_id)) || { turns: [] };
  session.turns.push({ role: 'user', text: message, ts: Date.now(), page });

  // safety: if user asks for investment advice, redirect to Research Assistant
  if (containsInvestmentAdviceRequest(message)) {
    const redirectText = "I can't provide specific investment advice here. For personalised recommendations, please use our AI Research Assistant or connect with our financial advisor. Would you like me to open the Research Assistant?";
    session.turns.push({ role: 'bot', text: redirectText });
    await setSession(session_id, session);
    return { reply: redirectText, suggested: ["Open Research Assistant", "General info about SIP"] };
  }

  // 1) Try deterministic/scripted response (exact intent or keyword maps)
  const scripted = matchScriptedResponse(message, flows);
  if (scripted) {
    session.turns.push({ role: 'bot', text: scripted });
    await setSession(session_id, session);
    return { reply: scripted, suggested: flows.quick_replies || [] };
  }

  // 2) LLM fallback (short context)
  const context = session.turns.slice(-6).map(t => `${t.role === 'user' ? 'User' : 'Bot'}: ${t.text}`).join('\n');
  const prompt = `You are InvestOnline Buddy — an onboarding assistant. Use the following context to answer concisely and follow onboarding rules. Do NOT give investment advice. If the user asks for investment advice, say you must redirect.\n\nContext:\n${context}\n\nUser: ${message}\n\nReply:`;
  const llmResp = await callOpenAI(prompt);

  // push, save
  session.turns.push({ role: 'bot', text: llmResp });
  await setSession(session_id, session);

  return { reply: llmResp, suggested: flows.quick_replies || [] };
}

module.exports = { handleChat };
