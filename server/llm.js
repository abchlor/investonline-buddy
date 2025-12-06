const fetch = require("node-fetch");
const cheerio = require("cheerio");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = "gpt-4o-mini";

// Cache for scraped content (1 hour TTL)
const contentCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Whitelist: Only InvestOnline.in domains
const ALLOWED_DOMAINS = [
  "investonline.in",
  "www.investonline.in",
  "beta.investonline.in"
];

function isAllowedURL(url) {
  try {
    const urlObj = new URL(url);
    return ALLOWED_DOMAINS.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
    );
  } catch (e) {
    return false;
  }
}

// Fetch page content with timeout
async function fetchPageContent(url, timeoutMs = 8000) {
  if (!isAllowedURL(url)) {
    console.log(`❌ Blocked URL (not investonline.in): ${url}`);
    return null;
  }

  // Check cache
  const cached = contentCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`✅ Cache hit for: ${url}`);
    return cached.content;
  }

  try {
    console.log(`🔍 Fetching content from: ${url}`);
    
    // Add timeout using AbortController
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'InvestOnlineBot/1.0',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`❌ Fetch failed (${response.status}): ${url}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, nav, footer, header, .advertisement, .cookie-banner, .popup, iframe').remove();

    // Extract main content
    let content = '';
    const mainSelectors = ['main', 'article', '.content', '.main-content', '#content', '.page-content', 'body'];

    for (const selector of mainSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }

    // Extract title
    const title = $('title').text() || $('h1').first().text() || '';

    // Clean up
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 6000); // Reduced to 6000 chars for faster processing

    const fullContent = `Page Title: ${title}\n\nPage Content: ${content}`;

    // Cache
    contentCache.set(url, {
      content: fullContent,
      timestamp: Date.now()
    });

    console.log(`✅ Fetched ${fullContent.length} chars from: ${url}`);
    return fullContent;

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`⏱️ Timeout fetching ${url}`);
    } else {
      console.error(`❌ Error fetching ${url}:`, error.message);
    }
    return null;
  }
}

// Extract relevant URLs from flows.json
function findRelevantURLs(query, flows) {
  const urls = new Set();
  const lowerQuery = query.toLowerCase();

  const extractURLs = (text) => {
    if (!text) return [];
    const matches = text.match(/https?:\/\/[^\s<>"]+/g);
    return matches ? matches.filter(isAllowedURL) : [];
  };

  // Search intents
  if (flows.intents) {
    for (const [key, def] of Object.entries(flows.intents)) {
      const keywords = [...(def.keywords || []), ...(def.synonyms || [])];
      const matched = keywords.some(kw => lowerQuery.includes(kw.toLowerCase()));
      
      if (matched && def.response) {
        extractURLs(def.response).forEach(url => urls.add(url));
      }
    }
  }

  // Search site section
  if (flows.site) {
    for (const [key, def] of Object.entries(flows.site)) {
      const keywords = [...(def.keywords || []), ...(def.synonyms || [])];
      const matched = keywords.some(kw => lowerQuery.includes(kw.toLowerCase()));
      
      if (matched && def.response) {
        extractURLs(def.response).forEach(url => urls.add(url));
      }
    }
  }

  const uniqueURLs = [...urls].slice(0, 2); // Reduced to 2 URLs max for faster processing
  console.log(`📚 Found ${uniqueURLs.length} relevant URLs`);
  return uniqueURLs;
}

// Call GPT with timeout
async function callGPT(userQuery, context, flows, timeoutMs = 20000) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const systemPrompt = `You are InvestOnline Buddy, a helpful assistant for InvestOnline.in - India's mutual fund investment platform.

**Your Role:**
- Help with mutual funds, SIPs, KYC, registration, calculators, and investment queries
- Provide accurate information from InvestOnline.in content
- Be concise, friendly, and professional
- Use 1-2 emojis per response
- Format with bullet points for lists
- Include relevant URLs

**Critical Rules:**
1. ONLY use information from InvestOnline.in (provided in Context below)
2. Do NOT make up information
3. Keep responses under 200 words
4. For URLs, use EXACT format: <a href="URL" target="_blank" rel="noopener noreferrer">text</a>
5. End with: SUGGESTED: question1 | question2 | question3 | question4

**Context from InvestOnline.in:**
${context || "No page content available. Use general knowledge about InvestOnline services: mutual funds, SIPs, KYC, registration, calculators."}

**Contact Info:**
- Email: wealth@investonline.in
- Phone: 1800-2222-65
- Website: https://www.investonline.in`;

  try {
    console.log(`🤖 Calling GPT-4o-mini...`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery }
        ],
        temperature: 0.7,
        max_tokens: 400, // Reduced for faster response
        top_p: 1,
        frequency_penalty: 0.3,
        presence_penalty: 0.3
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`❌ OpenAI error (${response.status}):`, errorData.error?.message || 'Unknown');
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const botReply = data.choices[0].message.content.trim();
    
    console.log(`✅ GPT response (${botReply.length} chars)`);

    // Extract suggestions
    let reply = botReply;
    let suggested = [];
    
    const suggestedMatch = botReply.match(/SUGGESTED:\s*(.+?)$/i);
    if (suggestedMatch) {
      suggested = suggestedMatch[1]
        .split('|')
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 60)
        .slice(0, 5);
      
      reply = botReply.replace(/SUGGESTED:\s*.+$/i, '').trim();
    }

    // Default suggestions if none provided
    if (suggested.length === 0) {
      suggested = ["What is KYC?", "How to start SIP?", "Top funds", "SIP Calculator", "Talk to Support"];
    }

    // Convert plain URLs to proper HTML links (fix malformed links)
    reply = reply.replace(/href="([^"]+)\)"/g, 'href="$1"'); // Fix trailing )
    reply = reply.replace(/(https?:\/\/[^\s<>")\]]+)(?!<\/a>)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    return { reply, suggested };

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error("⏱️ GPT timeout");
      throw new Error("Response timeout");
    }
    console.error("❌ GPT error:", error.message);
    throw error;
  }
}

// Main function with timeouts
async function getSmartResponse(userQuery, flows) {
  try {
    // Step 1: Find URLs (fast)
    const relevantURLs = findRelevantURLs(userQuery, flows);

    // Step 2: Fetch content (parallel, with timeout)
    let context = "";
    if (relevantURLs.length > 0) {
      const fetchPromises = relevantURLs.map(url => 
        fetchPageContent(url, 8000).catch(err => {
          console.error(`Failed to fetch ${url}:`, err.message);
          return null;
        })
      );
      
      const contents = await Promise.all(fetchPromises);
      
      relevantURLs.forEach((url, idx) => {
        if (contents[idx]) {
          context += `\n\n=== Source: ${url} ===\n${contents[idx]}\n`;
        }
      });
    }

    // Step 3: Call GPT (with timeout)
    const result = await callGPT(userQuery, context, flows, 20000);
    return result;

  } catch (error) {
    console.error("❌ Smart response failed:", error.message);
    throw error;
  }
}

module.exports = {
  getSmartResponse,
  fetchPageContent,
  callGPT,
  isAllowedURL
};
