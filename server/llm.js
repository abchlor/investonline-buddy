const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Load knowledge base from root directory
let KNOWLEDGE_BASE = "";
try {
  const knowledgePath = path.join(__dirname, "..", "knowledge_base.txt");
  KNOWLEDGE_BASE = fs.readFileSync(knowledgePath, "utf-8");
  console.log("✅ Knowledge base loaded successfully");
} catch (err) {
  console.error("❌ Failed to load knowledge_base.txt:", err.message);
  console.error("   Make sure knowledge_base.txt exists in project root");
}

/**
 * Call OpenAI with full knowledge base context
 * @param {string} userMessage - The user's question
 * @param {Array} conversationHistory - Previous messages in session
 * @param {Object} context - Additional context (page, user status, etc.)
 */
async function callOpenAI(userMessage, conversationHistory = [], context = {}) {
  const model = "gpt-4o-mini";

  // Build enhanced system prompt with knowledge base
  const systemPrompt = `You are InvestOnline Buddy, a helpful AI assistant for InvestOnline.in - a mutual fund investment platform.

YOUR ROLE:
- Help users with registration, KYC, and platform navigation
- Answer questions about mutual funds, SIPs, investment processes
- Guide users through transactions and troubleshooting
- Be warm, professional, and SEBI-compliant

IMPORTANT BOUNDARIES:
❌ DO NOT give specific fund recommendations (e.g., "Invest in XYZ fund")
❌ DO NOT predict market movements or guarantee returns
❌ DO NOT provide personalized investment advice
❌ DO NOT give tax advice (only mention tax-saving options like ELSS exist)

✅ DO explain fund categories, processes, and how the platform works
✅ DO help with registration, KYC, payments, and account issues
✅ DO provide general information about mutual fund types
✅ DO guide users to human advisors for personalized advice

KNOWLEDGE BASE:
${KNOWLEDGE_BASE}

RESPONSE GUIDELINES:
1. Keep answers concise (2-4 sentences max unless complex topic)
2. Use simple, jargon-free language
3. Include relevant contact info when needed (wealth@investonline.in, 1800-2222-65)
4. Add 😊 emoji for warmth (don't overuse)
5. For investment advice requests, say: "For personalized investment recommendations, please speak with our expert advisors at 1800-2222-65 or wealth@investonline.in. I can help you understand different fund types and how to invest!"
6. End with a follow-up question or suggested next step when appropriate

CONTEXT:
- Current page: ${context.page || "unknown"}
- User status: ${context.userStatus || "guest"}
${context.additionalInfo ? `- Additional: ${context.additionalInfo}` : ""}`;

  // Build conversation messages
  const messages = [
    { role: "system", content: systemPrompt }
  ];

  // Add conversation history (last 6 turns max to avoid token limits)
  const recentHistory = conversationHistory.slice(-6);
  messages.push(...recentHistory);

  // Add current user message
  messages.push({ role: "user", content: userMessage });

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.3, // Slightly more creative than 0.2
      max_tokens: 350,   // Increased for better responses
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    return response.choices[0].message.content.trim();

  } catch (err) {
    console.error("❌ OpenAI error:", err.message);
    
    // Provide helpful fallback based on error type
    if (err.message.includes("API key")) {
      throw new Error("AI service temporarily unavailable. Please contact support at wealth@investonline.in or 1800-2222-65.");
    }
    
    throw err;
  }
}

/**
 * Generate a quick answer for simple queries
 * Used when intent is matched but needs AI enhancement
 */
async function generateQuickAnswer(topic, userMessage) {
  const model = "gpt-4o-mini";
  
  const systemPrompt = `You are InvestOnline Buddy. Generate a brief, helpful answer about "${topic}" for InvestOnline.in platform.
Keep it to 1-2 sentences max. Be warm and professional. Include relevant contact if needed: wealth@investonline.in or 1800-2222-65.

Use this knowledge:
${KNOWLEDGE_BASE.substring(0, 2000)}`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.2,
      max_tokens: 150
    });

    return response.choices[0].message.content.trim();

  } catch (err) {
    console.error("❌ OpenAI quick answer error:", err.message);
    return null; // Return null to fall back to default response
  }
}

module.exports = { callOpenAI, generateQuickAnswer };
