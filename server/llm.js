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
      .slice(0, 6000);

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

  const uniqueURLs = [...urls].slice(0, 2);
  console.log(`📚 Found ${uniqueURLs.length} relevant URLs`);
  return uniqueURLs;
}

// Call GPT with timeout
async function callGPT(userQuery, context, flows, relevantURLs = [], timeoutMs = 20000) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const systemPrompt = `You are InvestOnline Buddy, a helpful assistant for InvestOnline.in - India's mutual fund investment platform.

**Your Role:**
- Help with mutual funds, SIPs, KYC, registration, calculators, and investment queries
- Provide accurate information from InvestOnline.in content
- Be concise, friendly, and professional
- Use proper formatting with headings, bullet points, and numbered lists
- Use 1-2 emojis per response for warmth

**Response Formatting Rules:**
1. Use **bold** for important terms (wrap in **text**)
2. Use bullet points (•) or numbered lists for steps
3. Break content into clear sections with line breaks
4. Keep paragraphs short (2-3 sentences max)
5. Add spacing between sections for readability

**Link Formatting Rules:**
1. NEVER write bare URLs in your response
2. NEVER use HTML tags in your response (no <a>, <href>, etc.)
3. Instead, use this format: [Read more](URL)
4. Example: For KYC info, write: [Complete KYC online](https://www.investonline.in/kyc)
5. Place "Read more" links at the END of relevant sections

**Critical Rules:**
1. ONLY use information from InvestOnline.in (provided in Context)
2. Do NOT make up information
3. Keep responses under 250 words
4. End with: SUGGESTED: question1 | question2 | question3 | question4

**Context from InvestOnline.in:**
${context || "No page content available. Use general knowledge about InvestOnline services."}

**Relevant Page URLs (use these for "Read more" links):**
${relevantURLs.length > 0 ? relevantURLs.join('\n') : 'No specific URLs available'}

**Contact Info:**
Email: wealth@investonline.in
Phone: 1800-2222-65`;

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
        max_tokens: 500,
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

    // ✅ FORMAT THE RESPONSE
    reply = formatReply(reply);

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

// Format GPT's reply with proper HTML structure
function formatReply(text) {
  if (!text) return text;

  // Convert markdown-style links [text](url) to HTML
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="read-more">$1</a>');

  // Convert **bold** to <strong>
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Convert bullet points
  text = text.replace(/^[•\-]\s+(.+)$/gm, '<div class="bullet-item">• $1</div>');

  // Convert numbered lists
  text = text.replace(/^\d+\.\s+(.+)$/gm, '<div class="numbered-item">$&</div>');

  // Add line breaks between paragraphs (double newlines)
  text = text.replace(/\n\n/g, '<br><br>');

  // Single newlines become <br>
  text = text.replace(/\n/g, '<br>');

  // Wrap contact info nicely
  text = text.replace(/Email:\s*([^\s<]+)/g, '<div class="contact-info">📧 Email: <a href="mailto:$1">$1</a></div>');
  text = text.replace(/Phone:\s*([\d\-+]+)/g, '<div class="contact-info">📞 Phone: <a href="tel:$1">$1</a></div>');

  return text;
}

// Main function with timeouts
async function getSmartResponse(userQuery, flows) {
  try {
    // Step 1: Find URLs
    const relevantURLs = findRelevantURLs(userQuery, flows);

    // Step 2: Fetch content
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

    // Step 3: Call GPT
    const result = await callGPT(userQuery, context, flows, relevantURLs, 20000);
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
