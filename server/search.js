const fetch = require("node-fetch");
const cheerio = require("cheerio");

// ====================================
// DOMAIN-RESTRICTED SEARCH ENGINE
// Only searches investonline.in
// ====================================

const ALLOWED_DOMAINS = [
  "investonline.in",
  "www.investonline.in",
  "beta.investonline.in"
];

// In-memory knowledge base (cache)
const knowledgeBase = new Map(); // URL -> { title, content, lastFetched, keywords }
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 200; // Max 200 pages cached

// ====================================
// URL VALIDATION
// ====================================

function isAllowedURL(url) {
  try {
    const urlObj = new URL(url);
    const isAllowed = ALLOWED_DOMAINS.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
    );
    
    if (!isAllowed) {
      console.log(`🚫 Blocked external URL: ${url}`);
    }
    
    return isAllowed;
  } catch (e) {
    return false;
  }
}

// ====================================
// PAGE CONTENT EXTRACTION
// ====================================

async function fetchAndIndexPage(url, timeoutMs = 8000) {
  if (!isAllowedURL(url)) {
    console.log(`❌ Rejected URL (not investonline.in): ${url}`);
    return null;
  }

  // Check cache
  const cached = knowledgeBase.get(url);
  if (cached && Date.now() - cached.lastFetched < CACHE_TTL) {
    console.log(`✅ Cache hit: ${url}`);
    return cached;
  }

  try {
    console.log(`🔍 Indexing: ${url}`);
    
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
    $('script, style, nav, footer, header, .advertisement, .cookie-banner, .popup, iframe, noscript').remove();

    // Extract title
    const title = $('title').text().trim() || 
                  $('h1').first().text().trim() || 
                  'Untitled';

    // Extract meta description
    const metaDescription = $('meta[name="description"]').attr('content') || 
                            $('meta[property="og:description"]').attr('content') || 
                            '';

    // Extract main content
    let content = '';
    const mainSelectors = [
      'main',
      'article',
      '.content',
      '.main-content',
      '#main-content',
      '#content',
      '.page-content',
      'body'
    ];

    for (const selector of mainSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }

    // Clean and structure content
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 8000); // Limit to 8000 chars

    // Extract keywords (simple approach)
    const keywords = extractKeywords(title + ' ' + metaDescription + ' ' + content);

    const pageData = {
      url,
      title,
      metaDescription,
      content,
      keywords,
      lastFetched: Date.now()
    };

    // Store in knowledge base
    knowledgeBase.set(url, pageData);

    // Limit cache size (LRU-like: remove oldest)
    if (knowledgeBase.size > MAX_CACHE_SIZE) {
      const oldestKey = knowledgeBase.keys().next().value;
      knowledgeBase.delete(oldestKey);
      console.log(`🗑️ Removed oldest cache entry: ${oldestKey}`);
    }

    console.log(`✅ Indexed: ${title} (${content.length} chars, ${keywords.length} keywords)`);
    
    return pageData;

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`⏱️ Timeout indexing ${url}`);
    } else {
      console.error(`❌ Error indexing ${url}:`, error.message);
    }
    return null;
  }
}

// ====================================
// KEYWORD EXTRACTION (Simple)
// ====================================

function extractKeywords(text) {
  if (!text) return [];
  
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'should', 'could', 'may', 'might', 'can', 'this', 'that',
    'these', 'those', 'it', 'its', 'they', 'their', 'them', 'we', 'us',
    'our', 'you', 'your'
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));

  // Count word frequency
  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  // Get top 20 keywords
  const topKeywords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  return topKeywords;
}

// ====================================
// SITEMAP CRAWLER
// ====================================

async function crawlSitemap(sitemapUrl) {
  if (!isAllowedURL(sitemapUrl)) {
    console.log(`❌ Invalid sitemap URL: ${sitemapUrl}`);
    return [];
  }

  try {
    console.log(`🗺️ Fetching sitemap: ${sitemapUrl}`);
    
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'InvestOnlineBot/1.0'
      },
      timeout: 10000
    });

    if (!response.ok) {
      console.log(`❌ Sitemap fetch failed: ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    // Extract URLs from sitemap
    const urls = [];
    $('url > loc').each((i, elem) => {
      const url = $(elem).text().trim();
      if (isAllowedURL(url)) {
        urls.push(url);
      }
    });

    console.log(`✅ Found ${urls.length} URLs in sitemap`);
    return urls;

  } catch (error) {
    console.error(`❌ Error crawling sitemap:`, error.message);
    return [];
  }
}

// ====================================
// SMART SEARCH: Find Relevant Pages
// ====================================

function findRelevantPages(query, topN = 3) {
  if (!query || knowledgeBase.size === 0) {
    console.log(`⚠️ No knowledge base available for search`);
    return [];
  }

  const queryKeywords = extractKeywords(query);
  console.log(`🔎 Searching for: ${query} (keywords: ${queryKeywords.join(', ')})`);

  // Score each page based on keyword matches
  const scores = [];

  knowledgeBase.forEach((pageData, url) => {
    let score = 0;

    // Check title match (high weight)
    queryKeywords.forEach(keyword => {
      if (pageData.title.toLowerCase().includes(keyword)) {
        score += 10;
      }
    });

    // Check meta description match (medium weight)
    queryKeywords.forEach(keyword => {
      if (pageData.metaDescription.toLowerCase().includes(keyword)) {
        score += 5;
      }
    });

    // Check keyword match (medium weight)
    queryKeywords.forEach(keyword => {
      if (pageData.keywords.includes(keyword)) {
        score += 3;
      }
    });

    // Check content match (low weight)
    queryKeywords.forEach(keyword => {
      if (pageData.content.toLowerCase().includes(keyword)) {
        score += 1;
      }
    });

    if (score > 0) {
      scores.push({ url, pageData, score });
    }
  });

  // Sort by score (descending) and return top N
  const topPages = scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  console.log(`✅ Found ${topPages.length} relevant pages`);
  topPages.forEach(({ url, score }) => {
    console.log(`   - ${url} (score: ${score})`);
  });

  return topPages.map(({ url, pageData }) => ({ url, ...pageData }));
}

// ====================================
// INITIALIZATION
// ====================================

async function initializeKnowledgeBase(sitemapUrl) {
  console.log(`🚀 Initializing knowledge base from sitemap...`);
  
  const urls = await crawlSitemap(sitemapUrl);
  
  if (urls.length === 0) {
    console.log(`⚠️ No URLs found in sitemap. Knowledge base will be empty.`);
    return;
  }

  // Index first 50 URLs on startup (to avoid long startup time)
  const urlsToIndex = urls.slice(0, 50);
  console.log(`📚 Indexing ${urlsToIndex.length} pages (out of ${urls.length} total)...`);

  const promises = urlsToIndex.map(url => 
    fetchAndIndexPage(url).catch(err => {
      console.error(`Failed to index ${url}:`, err.message);
      return null;
    })
  );

  await Promise.all(promises);

  console.log(`✅ Knowledge base initialized with ${knowledgeBase.size} pages`);
}

// ====================================
// EXPORTS
// ====================================

module.exports = {
  isAllowedURL,
  fetchAndIndexPage,
  crawlSitemap,
  findRelevantPages,
  initializeKnowledgeBase,
  knowledgeBase // Export for debugging
};
