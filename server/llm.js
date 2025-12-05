const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function callOpenAI(prompt, requestedModel = "gpt-4o-mini") {
  const model = "gpt-4o-mini";

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are InvestOnline Buddy." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 250
    });

    return response.choices[0].message.content.trim();

  } catch (err) {
    console.error("LLM error:", err);
    throw err;
  }
}

module.exports = { callOpenAI };
