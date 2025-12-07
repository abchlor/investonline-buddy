const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { findRelevantPages, fetchAndIndexPage } = require("./search");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = "gpt-4o-mini";

const contentCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

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

async function fetchPageContent(url, timeoutMs = 5000) {
  if (!isAllowedURL(url)) {
    console.log(`❌ Blocked URL (not investonline.in): ${url}`);
    return null;
  }
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
    $('script, style, nav, footer, header, .advertisement, .cookie-banner, .popup, iframe').remove();
    let content = '';
    const mainSelectors = ['main', 'article', '.content', '.main-content', '#content', '.page-content', 'body'];
    for (const selector of mainSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }
    const title = $('title').text() || $('h1').first().text() || '';
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 4000);
    const fullContent = `Page Title: ${title}\n\nPage Content: ${content}`;
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

// Find URLs from flows.json (hardcoded intents)
function findRelevantURLsFromFlows(query, flows) {
  const urls = new Set();
  const lowerQuery = query.toLowerCase();
  const extractURLs = (text) => {
    if (!text) return [];
    const matches = text.match(/https?:\/\/[^\s<>"]+/g);
    return matches ? matches.filter(isAllowedURL) : [];
  };
  if (flows.intents) {
    for (const [key, def] of Object.entries(flows.intents)) {
      const keywords = [...(def.keywords || []), ...(def.synonyms || [])];
      const matched = keywords.some(kw => lowerQuery.includes(kw.toLowerCase()));
      if (matched && def.response) {
        extractURLs(def.response).forEach(url => urls.add(url));
      }
    }
  }
  if (flows.site) {
    for (const [key, def] of Object.entries(flows.site)) {
      const keywords = [...(def.keywords || []), ...(def.synonyms || [])];
      const matched = keywords.some(kw => lowerQuery.includes(kw.toLowerCase()));
      if (matched && def.response) {
        extractURLs(def.response).forEach(url => urls.add(url));
      }
    }
  }
  const uniqueURLs = [...urls].slice(0, 1);
  console.log(`📚 Found ${uniqueURLs.length} URLs from flows.json`);
  return uniqueURLs;
}

// HYBRID SEARCH: flows.json + AI search
async function findRelevantPages_Hybrid(query, flows) {
  // Step 1: Try flows.json first (fast, controlled)
  const flowURLs = findRelevantURLsFromFlows(query, flows);
  
  if (flowURLs.length > 0) {
    console.log(`✅ Using flows.json URLs (priority)`);
    return flowURLs;
  }
  
  // Step 2: Use AI search (slower but comprehensive)
  console.log(`🔍 No flows.json match, using AI search...`);
  const aiPages = findRelevantPages(query, 1); // Get top 1 page
  
  if (aiPages.length > 0) {
    console.log(`✅ AI search found ${aiPages.length} relevant pages`);
    return aiPages.map(page => page.url);
  }
  
  console.log(`⚠️ No relevant pages found`);
  return [];
}

async function callGPT(userQuery, context, flows, relevantURLs = [], timeoutMs = 12000) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  
  const systemPrompt = `You are InvestOnline Buddy, a helpful assistant for InvestOnline.in - India's mutual fund investment platform.

**Your Role:**
- Help with mutual funds, SIPs, KYC, registration, calculators, and investment queries
- Provide accurate, concise information from InvestOnline.in content ONLY
- Be friendly and professional
- Use simple formatting with bullet points
- Use 1 emoji per response

**CRITICAL RESTRICTIONS:**
- ONLY use information from the Context section below (from investonline.in)
- NEVER use external web sources or general knowledge
- If Context is empty, say: "I don't have specific information on that. Please visit www.investonline.in or contact support."

**Response Formatting Rules:**
1. DO NOT use markdown headings (no ###, ##, #)
2. DO NOT use *** or ___ separators
3. Keep responses SHORT and concise (under 150 words)
4. Use bullet points (•) for lists
5. Single line breaks only

**Link Formatting Rules:**
1. ONLY include "Read more" links if you have a VALID URL from the Relevant URLs list below
2. Use format: [Read more](URL) - where URL must be from investonline.in
3. If no relevant URL is available, DO NOT include any "Read more" link
4. Place link at the END of response

**Critical Rules:**
1. ONLY use information from InvestOnline.in (provided in Context)
2. Keep responses under 150 words
3. Be concise and direct
4. End with: SUGGESTED: question1 | question2 | question3 | question4

**Context from InvestOnline.in:**
${context ? context.slice(0, 2000) : "No specific page content available. Cannot answer this query - direct user to website or support."}

**Relevant URLs (ONLY use these for links):**
${relevantURLs.length > 0 ? relevantURLs.map(url => `- ${url}`).join('\n') : 'NONE - Do not include any "Read more" links'}

**Contact Info (if needed):**
Email: wealth@investonline.in
Phone: 1800-2222-65
Website: https://www.investonline.in`;

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
        max_tokens: 300,
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
    if (suggested.length === 0) {
      suggested = ["What is KYC?", "How to start SIP?", "Top funds", "SIP Calculator", "Talk to Support"];
    }
    reply = formatReply(reply, relevantURLs);
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

function formatReply(text, relevantURLs = []) {
  if (!text) return text;
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<strong>$1</strong>');
  text = text.replace(/^[\-*_]{3,}$/gm, '');
  text = text.replace(/\*{2,3}([^*]+)\*{2,3}/g, '<strong>$1</strong>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (match, linkText, url) => {
    const isValid = relevantURLs.some(validUrl => url.includes(validUrl) || validUrl.includes(url)) || 
                    ALLOWED_DOMAINS.some(domain => url.includes(domain));
    if (isValid) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="read-more">${linkText}</a>`;
    } else {
      console.warn(`⚠️ Removed invalid link: ${url}`);
      return linkText;
    }
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/^[•-]\s+(.+)$/gm, '<div class="bullet-item">• $1</div>');
  text = text.replace(/^\d+\.\s+(.+)$/gm, '<div class="numbered-item">$&</div>');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/\n\n/g, '<br>');
  text = text.replace(/\n/g, '<br>');
  text = text.replace(/Email:\s*([^\s<]+)/g, '<div class="contact-info">📧 Email: <a href="mailto:$1">$1</a></div>');
  text = text.replace(/Phone:\s*([\d\-+]+)/g, '<div class="contact-info">📞 Phone: <a href="tel:$1">$1</a></div>');
  text = text.replace(/(<br>\s*){2,}/g, '<br>');
  return text;
}

async function getSmartResponse(userQuery, flows) {
  const startTime = Date.now();
  try {
    // HYBRID SEARCH: flows.json (priority) + AI search (fallback)
    const relevantURLs = await findRelevantPages_Hybrid(userQuery, flows);
    
    let context = "";
    if (relevantURLs.length > 0) {
      try {
        // Fetch from indexed knowledge base or web
        const pageData = await fetchAndIndexPage(relevantURLs[0], 5000);
        
        if (pageData && pageData.content) {
          context = `=== Source: ${pageData.url} ===\nTitle: ${pageData.title}\n\nContent: ${pageData.content}`;
        }
      } catch (err) {
        console.error(`Failed to fetch ${relevantURLs[0]}:`, err.message);
      }
    }
    
    const result = await callGPT(userQuery, context, flows, relevantURLs, 12000);
    const elapsed = Date.now() - startTime;
    console.log(`⏱️ Total response time: ${elapsed}ms`);
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
