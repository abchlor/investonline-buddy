const fetch = require("node-fetch");
const cheerio = require("cheerio");

// ====================================
// PURE INVESTONLINE SEARCH (NO AI FALLBACK)
// Domain-restricted, on-demand indexing only
// ====================================

const ALLOWED_DOMAINS = [
  "investonline.in",
  "www.investonline.in",
  "beta.investonline.in"
];

// Simple cache (only stores what user searches for)
const pageCache = new Map(); // URL -> { title, content, lastFetched }
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 50; // Small cache - only 50 pages

// ====================================
// KEY PAGES TO SEARCH
// Add all important InvestOnline.in pages here
// ====================================

const KEY_PAGES = [
  // Main pages
  "https://www.investonline.in/",
  "https://www.investonline.in/contact-us",
  "https://www.investonline.in/about-abchlor-investment-advisors-pvt-ltd",
  "https://www.investonline.in/faq",
  
  // Mutual Funds
  "https://www.investonline.in/mutual-funds/funds-explorer",
  "https://www.investonline.in/mutual-funds/ready-to-go-portfolio",
  "https://www.investonline.in/mutual-funds/do-it-yourself-portfolio",
  "https://www.investonline.in/mutual-funds/lightning-sip",
  "https://www.investonline.in/mutual-funds/top-up-sip",
  "https://www.investonline.in/mutual-funds/category-returns",
  
  // PMS
  "https://www.investonline.in/pms",
  
  // Insurance
  "https://www.investonline.in/insurance/life-insurance",
  "https://www.investonline.in/insurance/general-insurance",
  
  // Features & Calculators
  "https://www.investonline.in/features/all-features",
  "https://www.investonline.in/features/financial-calculators",
  "https://www.investonline.in/financial-calculators/sip-calculator",
  "https://www.investonline.in/financial-calculators/emi-calculator",
  "https://www.investonline.in/financial-calculators/retirement-calculator",
  "https://www.investonline.in/financial-calculators/goal-planner",
  
  // Markets
  "https://www.investonline.in/markets/equity-market-insights",
  
  // Resources
  "https://www.investonline.in/blog/",
  "https://www.investonline.in/magazine/investguide",
  "https://www.investonline.in/money-heart-beat/weekend-read",
  
  // Services
  "https://www.investonline.in/partner",
  "https://www.investonline.in/services",
  
  // KYC & Registration (if applicable)
  "https://www.investonline.in/kyc",
  "https://www.investonline.in/registration"
];

// ====================================
// URL VALIDATION
// ====================================

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

// ====================================
// FETCH PAGE CONTENT (On-demand)
// ====================================

async function fetchPageContent(url, timeoutMs = 5000) {
  if (!isAllowedURL(url)) {
    console.log(`❌ Rejected URL: ${url}`);
    return null;
  }

  // Check cache first
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.lastFetched < CACHE_TTL) {
    console.log(`✅ Cache hit: ${url}`);
    return cached;
  }

  try {
    console.log(`🔍 Fetching: ${url}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'InvestOnlineBot/1.0',
        'Accept': 'text/html'
      }
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`❌ Fetch failed (${response.status}): ${url}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Clean HTML
    $('script, style, nav, footer, header, .advertisement, iframe, noscript').remove();

    // Extract content
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    
    // Get main content
    let content = '';
    const selectors = ['main', 'article', '.content', '#main-content', '#content', '.main-content', 'body'];
    for (const sel of selectors) {
      const elem = $(sel);
      if (elem.length > 0) {
        content = elem.text();
        break;
      }
    }

    // Clean text
    content = content
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // Limit to 8000 chars

    const pageData = {
      url,
      title,
      metaDesc,
      content,
      lastFetched: Date.now()
    };

    // Store in cache
    pageCache.set(url, pageData);

    // Manage cache size
    if (pageCache.size > MAX_CACHE_SIZE) {
      const firstKey = pageCache.keys().next().value;
      pageCache.delete(firstKey);
    }

    console.log(`✅ Fetched: ${title} (${content.length} chars)`);
    return pageData;

  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error.message);
    return null;
  }
}

// ====================================
// KEYWORD SEARCH
// ====================================

function searchContent(query, pages) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  const results = [];

  for (const page of pages) {
    if (!page || !page.content) continue;

    let score = 0;
    const titleLower = page.title.toLowerCase();
    const contentLower = page.content.toLowerCase();
    const metaLower = (page.metaDesc || '').toLowerCase();

    // Score based on keyword matches
    queryWords.forEach(word => {
      // Title match (highest score)
      if (titleLower.includes(word)) score += 15;
      
      // Meta description match (high score)
      if (metaLower.includes(word)) score += 10;
      
      // Content match (lower score)
      const matches = (contentLower.match(new RegExp(word, 'g')) || []).length;
      score += Math.min(matches, 10); // Cap at 10 to avoid spam
    });

    if (score > 0) {
      // Extract relevant snippet
      let snippet = '';
      const firstWord = queryWords[0];
      const snippetStart = contentLower.indexOf(firstWord);
      
      if (snippetStart >= 0) {
        snippet = page.content.slice(Math.max(0, snippetStart - 100), snippetStart + 300).trim() + '...';
      } else {
        snippet = page.content.slice(0, 250).trim() + '...';
      }

      results.push({
        url: page.url,
        title: page.title,
        snippet,
        score
      });
    }
  }

  // Sort by score (highest first)
  return results.sort((a, b) => b.score - a.score);
}

// ====================================
// MAIN SEARCH FUNCTION
// ====================================

async function searchKnowledge(query, maxResults = 5) {
  console.log(`🔎 Searching InvestOnline.in for: "${query}"`);

  if (!query || query.trim().length === 0) {
    return [];
  }

  // Fetch key pages on-demand (with delay between requests)
  const fetchedPages = [];
  
  for (let i = 0; i < Math.min(KEY_PAGES.length, 15); i++) {
    const pageData = await fetchPageContent(KEY_PAGES[i]);
    if (pageData) {
      fetchedPages.push(pageData);
    }
    
    // Small delay to avoid overwhelming the server
    if (i < KEY_PAGES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
    }
  }

  console.log(`📚 Fetched ${fetchedPages.length} pages from InvestOnline.in`);

  // Search the fetched pages
  const results = searchContent(query, fetchedPages);
  
  console.log(`✅ Found ${results.length} relevant results`);
  return results.slice(0, maxResults);
}

// ====================================
// INITIALIZATION (No startup crawling!)
// ====================================

function initialize() {
  console.log(`✅ Pure InvestOnline search module loaded`);
  console.log(`📚 Will search ${KEY_PAGES.length} key pages on-demand`);
  console.log(`🚫 No AI fallback - Only InvestOnline.in content`);
  return Promise.resolve(); // Returns immediately
}

// ====================================
// EXPORTS
// ====================================

module.exports = {
  searchKnowledge,
  initialize,
  isAllowedURL,
  pageCache, // For debugging
  KEY_PAGES  // Export for reference
};

