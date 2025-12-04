const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function callOpenAI(prompt) {
  try {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini', // change to available model in your plan; or gpt-4o if available
      messages: [{ role: 'system', content: 'You are InvestOnline Buddy, a helpful onboarding assistant. Keep answers short and follow compliance rules.'}, { role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.12
    });
    // adapt to client response shape
    const text = resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
    return (text || "Sorry, I couldn't process that. Please try again.");
  } catch (err) {
    console.error('OpenAI error', err?.message || err);
    return "Sorry, I'm temporarily unable to answer that. Please try again later or choose one of the suggested options.";
  }
}

module.exports = { callOpenAI };
