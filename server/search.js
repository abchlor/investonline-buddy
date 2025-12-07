const fetch = require("node-fetch");
const cheerio = require("cheerio");

// ====================================
// LIGHTWEIGHT DOMAIN-RESTRICTED SEARCH
// On-demand indexing only (no startup crawling)
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
// STATIC PAGE LIST (Add your key pages here)
// ====================================

const KEY_PAGES = [
  "https://investonline.in/",
  "https://investonline.in/about",
  "https://investonline.in/services",
  "https://investonline.in/pms",
  "https://investonline.in/mutual-funds",
  "https://investonline.in/contact",
  // Add more important pages here
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
    $('script, style, nav, footer, header, .advertisement, iframe').remove();

    // Extract content
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    
    // Get main content
    let content = '';
    const selectors = ['main', 'article', '.content', '#main-content', 'body'];
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
      .slice(0, 5000); // Limit to 5000 chars

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
// SIMPLE KEYWORD SEARCH
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

    // Score based on keyword matches
    queryWords.forEach(word => {
      // Title match (high score)
      if (titleLower.includes(word)) score += 10;
      
      // Content match (low score)
      const matches = (contentLower.match(new RegExp(word, 'g')) || []).length;
      score += matches;
    });

    if (score > 0) {
      // Extract relevant snippet
      const snippetStart = contentLower.indexOf(queryWords[0]);
      const snippet = snippetStart >= 0 
        ? page.content.slice(Math.max(0, snippetStart - 100), snippetStart + 200) + '...'
        : page.content.slice(0, 200) + '...';

      results.push({
        url: page.url,
        title: page.title,
        snippet,
        score
      });
    }
  }

  // Sort by score
  return results.sort((a, b) => b.score - a.score);
}

// ====================================
// MAIN SEARCH FUNCTION
// ====================================

async function searchKnowledge(query, maxResults = 3) {
  console.log(`🔎 Searching for: "${query}"`);

  if (!query || query.trim().length === 0) {
    return [];
  }

  // Fetch key pages on-demand (with delay between requests)
  const fetchedPages = [];
  
  for (let i = 0; i < Math.min(KEY_PAGES.length, 10); i++) {
    const pageData = await fetchPageContent(KEY_PAGES[i]);
    if (pageData) {
      fetchedPages.push(pageData);
    }
    
    // Small delay to avoid overwhelming the server
    if (i < KEY_PAGES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
    }
  }

  // Search the fetched pages
  const results = searchContent(query, fetchedPages);
  
  console.log(`✅ Found ${results.length} results`);
  return results.slice(0, maxResults);
}

// ====================================
// NO INITIALIZATION NEEDED!
// ====================================

function initialize() {
  console.log(`✅ Search module loaded. Ready for queries.`);
  console.log(`📚 Will search across ${KEY_PAGES.length} key pages on-demand.`);
  return Promise.resolve(); // Returns immediately
}

// ====================================
// EXPORTS
// ====================================

module.exports = {
  searchKnowledge,
  initialize,
  isAllowedURL,
  pageCache // For debugging
};
