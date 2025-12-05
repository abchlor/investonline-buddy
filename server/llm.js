const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Safe LLM call
 * Forces model to "gpt-4o-mini" regardless of caller input
 */
async function callOpenAI(prompt, requestedModel = "gpt-4o-mini") {
  // hard enforcement — ignore requestedModel if it's not mini
  const model = "gpt-4o-mini";

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are InvestOnline Buddy." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,   // stable, low-hallucination
      max_tokens: 350      // keeps costs predictable
    });

    return response.choices[0].message.content.trim();

  } catch (err) {
    console.error("LLM error:", err);
    return "Sorry, I'm having trouble right now. Please try again.";
  }
}

module.exports = { callOpenAI };
