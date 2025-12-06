const fetch = require("node-fetch");
const cheerio = require("cheerio");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = "gpt-4o-mini"; // Cost-effective and fast

// Cache for scraped content (1 hour TTL)
const contentCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ✅ Whitelist: Only InvestOnline.in domains
const ALLOWED_DOMAINS = [
  "investonline.in",
  "www.investonline.in",
  "beta.investonline.in"
];

function isAllowedURL(url) {
  try {
    const urlObj = new URL(url);
    return ALLOWED_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`));
  } catch (e) {
    return false;
  }
}

// ✅ Fetch and extract content from InvestOnline.in pages
async function fetchPageContent(url) {
  if (!isAllowedURL(url)) {
    console.log(`❌ Blocked URL (not investonline.in): ${url}`);
    return null;
  }

  // Check cache
  const cached = contentCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`✅ Cache hit: ${url}`);
    return cached.content;
  }

  try {
    console.log(`🔍 Fetching: ${url}`);
    const response = await fetch(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'InvestOnlineBot/1.0'
      }
    });

    if (!response.ok) {
      console.log(`❌ Fetch failed (${response.status}): ${url}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, nav, footer, header, .advertisement, .cookie-banner').remove();

    // Extract main content
    let content = '';
    
    // Try to find main content area (adjust selectors based on your site structure)
    const mainSelectors = [
      'main',
      'article',
      '.content',
      '.main-content',
      '#content',
      'body'
    ];

    for (const selector of mainSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }

    // Clean up whitespace
    content = content
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // Limit to 8000 chars

    // Cache the result
    contentCache.set(url, {
      content,
      timestamp: Date.now()
    });

    console.log(`✅ Fetched ${content.length} chars from ${url}`);
    return content;

  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error.message);
    return null;
  }
}

// ✅ Extract relevant URLs from flows.json based on user query
function findRelevantURLs(query, flows) {
  const urls = [];
  const lowerQuery = query.toLowerCase();

  // Search intents
  if (flows.intents) {
    for (const [key, def] of Object.entries(flows.intents)) {
      const keywords = [...(def.keywords || []), ...(def.synonyms || [])];
      const matched = keywords.some(kw => lowerQuery.includes(kw.toLowerCase()));
      
      if (matched && def.response) {
        // Extract URLs from response
        const urlMatches = def.response.match(/https?:\/\/[^\s<]+/g);
        if (urlMatches) {
          urls.push(...urlMatches.filter(isAllowedURL));
        }
      }
    }
  }

  // Search site section
  if (flows.site) {
    for (const [key, def] of Object.entries(flows.site)) {
      const keywords = [...(def.keywords || []), ...(def.synonyms || [])];
      const matched = keywords.some(kw => lowerQuery.includes(kw.toLowerCase()));
      
      if (matched && def.response) {
        const urlMatches = def.response.match(/https?:\/\/[^\s<]+/g);
        if (urlMatches) {
          urls.push(...urlMatches.filter(isAllowedURL));
        }
      }
    }
  }

  // Remove duplicates
  return [...new Set(urls)].slice(0, 3); // Max 3 URLs to fetch
}

// ✅ Call GPT-4o-mini with context
async function callGPT(userQuery, context, flows) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set in environment variables");
  }

  const systemPrompt = `You are InvestOnline Buddy, a helpful assistant for InvestOnline.in - India's leading mutual fund investment platform.

**Your Role:**
- Help users with mutual funds, SIPs, KYC, registration, calculators, and investment queries
- Provide accurate information based on InvestOnline.in content
- Be friendly, concise, and professional
- Use emojis sparingly (max 2-3 per response)
- Format responses with bullet points and clear structure
- Always include relevant URLs from InvestOnline.in when available

**Important Rules:**
1. ONLY use information from InvestOnline.in (provided in context)
2. Do NOT make up information or use external sources
3. If you don't know something, say: "I don't have that information. Contact support: wealth@investonline.in"
4. Keep responses under 300 words
5. Include 3-5 follow-up question suggestions at the end (format: SUGGESTED: [question1] | [question2] | [question3])

**InvestOnline.in Content (Context):**
${context || "No specific page content available. Use general knowledge about InvestOnline services."}

**Support Info:**
- Email: wealth@investonline.in
- Phone: 1800-2222-65
- Website: https://www.investonline.in`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userQuery }
  ];

  try {
    console.log(`🤖 Calling GPT-4o-mini for query: "${userQuery}"`);
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
        top_p: 1,
        frequency_penalty: 0.3,
        presence_penalty: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenAI API error (${response.status}):`, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const botReply = data.choices[0].message.content.trim();

    console.log(`✅ GPT response: ${botReply.slice(0, 100)}...`);

    // Extract suggestions from response
    let reply = botReply;
    let suggested = [];
    
    const suggestedMatch = botReply.match(/SUGGESTED:\s*(.+?)$/i);
    if (suggestedMatch) {
      const suggestedText = suggestedMatch[1];
      suggested = suggestedText
        .split('|')
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 50)
        .slice(0, 5);
      
      // Remove SUGGESTED section from reply
      reply = botReply.replace(/SUGGESTED:\s*.+$/i, '').trim();
    }

    // Convert plain URLs to clickable links
    reply = reply.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    return { reply, suggested };

  } catch (error) {
    console.error("❌ GPT call failed:", error);
    throw error;
  }
}

// ✅ Main function: Smart response with RAG
async function getSmartResponse(userQuery, flows) {
  try {
    // Find relevant URLs from flows.json
    const relevantURLs = findRelevantURLs(userQuery, flows);
    console.log(`📚 Found ${relevantURLs.length} relevant URLs`);

    // Fetch content from URLs (parallel)
    let context = "";
    if (relevantURLs.length > 0) {
      const contentPromises = relevantURLs.map(url => fetchPageContent(url));
      const contents = await Promise.all(contentPromises);
      
      relevantURLs.forEach((url, idx) => {
        if (contents[idx]) {
          context += `\n\n=== Content from ${url} ===\n${contents[idx]}\n`;
        }
      });
    }

    // Call GPT with context
    const result = await callGPT(userQuery, context, flows);
    return result;

  } catch (error) {
    console.error("❌ Smart response failed:", error);
    throw error;
  }
}

module.exports = {
  getSmartResponse,
  fetchPageContent,
  callGPT
};
