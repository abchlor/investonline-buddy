const { GoogleGenerativeAI } = require("@google/generative-ai");
const { searchKnowledge } = require("./search");

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// System prompt for InvestOnline chatbot
const SYSTEM_PROMPT = `You are InvestOnline Buddy, a helpful financial assistant for InvestOnline.in.

Your role:
- Answer questions about InvestOnline's services (PMS, mutual funds, stocks, SIPs, KYC, etc.)
- Provide accurate information based on the search results from investonline.in
- Be professional, friendly, and concise
- Keep responses under 150 words
- Format responses with HTML tags (<br>, <a>, <strong>, etc.)
- Always cite source URLs when using information from search results

Guidelines:
- If search results contain relevant information, use it to answer
- If information is not in search results, use your general knowledge about finance
- Be helpful and guide users to the right pages on investonline.in
- For contact/support queries, provide email and phone from the website
- Suggest 3-5 follow-up questions at the end

Important:
- Do not make up URLs or page links
- Do not provide specific investment advice
- For complex queries, encourage users to contact support`;

/**
 * Get smart response with search integration
 */
async function getSmartResponse(userQuery, flows) {
  try {
    // Step 1: Search the knowledge base
    console.log(`🔍 Searching for: "${userQuery}"`);
    let searchResults = [];
    
    try {
      searchResults = await searchKnowledge(userQuery, 3);
      console.log(`📚 Found ${searchResults.length} relevant pages`);
    } catch (searchErr) {
      console.error(`⚠️ Search failed:`, searchErr.message);
      // Continue without search results
    }

    // Step 2: Build context from search results
    let context = "";
    if (searchResults && searchResults.length > 0) {
      context = "\n\nRELEVANT INFORMATION FROM INVESTONLINE.IN:\n\n";
      searchResults.forEach((result, idx) => {
        context += `[${idx + 1}] ${result.title}\n`;
        context += `URL: ${result.url}\n`;
        context += `Content: ${result.snippet}\n\n`;
      });
    }

    // Step 3: Get flow definitions (fallback knowledge)
    let flowContext = "";
    if (flows && flows.intents) {
      const relevantIntents = Object.keys(flows.intents).slice(0, 5);
      if (relevantIntents.length > 0) {
        flowContext += "\n\nAVAILABLE TOPICS:\n";
        relevantIntents.forEach(intent => {
          const def = flows.intents[intent];
          if (def && def.response) {
            flowContext += `- ${intent}: ${def.response.slice(0, 100)}...\n`;
          }
        });
      }
    }

    // Step 4: Build the full prompt
    const fullPrompt = `${SYSTEM_PROMPT}

${context}

${flowContext}

User Question: ${userQuery}

Provide a helpful HTML-formatted response with links. Keep it under 150 words.`;

    // Step 5: Call Gemini API
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.7,
      }
    });

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    let reply = response.text();

    // Step 6: Format the response
    reply = formatResponse(reply);

    // Step 7: Add source citations if search results were used
    if (searchResults.length > 0) {
      reply += `<br><br><small style="color: #666;">Sources: `;
      searchResults.forEach((result, idx) => {
        reply += `<a href="${result.url}" target="_blank" rel="noopener noreferrer">${idx + 1}</a>`;
        if (idx < searchResults.length - 1) reply += ", ";
      });
      reply += `</small>`;
    }

    // Step 8: Generate suggested questions
    const suggested = generateSuggestions(userQuery, flows, searchResults);

    return {
      reply,
      suggested,
      sources: searchResults.map(r => ({ title: r.title, url: r.url }))
    };

  } catch (error) {
    console.error("❌ Error in getSmartResponse:", error.message);
    throw error; // Let chat_handler handle the fallback
  }
}

/**
 * Format response text with HTML
 */
function formatResponse(text) {
  if (!text) return text;
  
  // Convert markdown-style links to HTML
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Convert bare URLs to links (if not already linked)
  text = text.replace(/(?<!href=")(https?:\/\/[^\s<]+)(?!")/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Convert double newlines to <br>
  text = text.replace(/\n\n/g, '<br><br>');
  text = text.replace(/\n/g, '<br>');
  
  return text;
}

/**
 * Generate suggested follow-up questions
 */
function generateSuggestions(query, flows, searchResults) {
  const suggestions = [];
  
  // Add suggestions from search results
  if (searchResults && searchResults.length > 0) {
    searchResults.forEach(result => {
      if (result.title && result.title.length > 5 && result.title.length < 50) {
        suggestions.push(`Learn more about ${result.title}`);
      }
    });
  }
  
  // Add generic financial suggestions
  const genericSuggestions = [
    "What is KYC?",
    "How to start a SIP?",
    "Best mutual funds",
    "PMS services",
    "Calculate SIP returns",
    "How to register?",
    "Talk to Support"
  ];
  
  // Fill remaining slots with generic suggestions
  genericSuggestions.forEach(s => {
    if (suggestions.length < 5 && !suggestions.includes(s)) {
      suggestions.push(s);
    }
  });
  
  return suggestions.slice(0, 5);
}

module.exports = {
  getSmartResponse
};
