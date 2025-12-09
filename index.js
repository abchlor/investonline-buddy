// ====================================
// Load environment variables FIRST
// ====================================
const dotenv = require("dotenv");
dotenv.config();

// Convert ALLOWED_ORIGIN env into array
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map(v => v.trim())
  .filter(Boolean);

const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");

const { verifyRecaptcha } = require("./server/recaptcha");
const { validateSignature } = require("./server/signature");
const { createToken } = require("./server/utils");
const { handleChat } = require("./server/chat_handler");
const { initialize } = require("./server/search");

const app = express();
const PORT = process.env.PORT || 8080;

// ====================================
// CHATBOT VERSION: Pure InvestOnline Search (NO AI)
// ====================================
console.log(`🚀 Starting InvestOnline Buddy - Pure Search Version`);
console.log(`✅ Only searches InvestOnline.in | No AI fallback | No internet knowledge`);

// Initialize search module (instant - no crawling)
(async () => {
  try {
    await initialize();
    console.log(`✅ Search module ready! Chatbot will fetch pages on-demand.`);
  } catch (err) {
    console.error(`❌ Search module failed:`, err.message);
  }
})();

// ====================================
// Security Configuration
// ====================================

const SESSION_STORE = new Map();
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 hours
const CREATED_TOKENS = new Set();

// Use ALLOWED_ORIGIN array for iframe + CORS validation
const isIframeSafe = (origin) => {
  if (!origin) return false;
  return ALLOWED_ORIGIN.some(a => origin.startsWith(a));
};

// ====================================
// Middleware
// ====================================

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", ...ALLOWED_ORIGIN],
        frameSrc: ["'self'", ...ALLOWED_ORIGIN],
        frameAncestors: [...ALLOWED_ORIGIN]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// Explicitly allow iframe embedding from allowed origins
app.use((req, res, next) => {
  const origin = req.get('origin') || req.get('referer');
  if (origin && isIframeSafe(origin)) {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `frame-ancestors ${ALLOWED_ORIGIN.join(' ')}`);
  }
  next();
});

app.use(morgan("combined"));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isIframeSafe(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy: origin not allowed"));
      }
    },
    credentials: true
  })
);

app.use(express.json({ limit: "10kb" }));


// ====================================
// Health Check
// ====================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    version: "pure-search-v1",
    message: "InvestOnline Buddy is running (Pure InvestOnline.in search - No AI)"
  });
});

// ====================================
// Session Management
// ====================================

app.post("/session/start", (req, res) => {
  const sessionId = `session_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const token = createToken();

  SESSION_STORE.set(sessionId, {
    token,
    createdAt: Date.now(),
    lastAccess: Date.now()
  });

  CREATED_TOKENS.add(token);

  console.log(`✅ Session created: ${sessionId}`);

  res.json({ session_id: sessionId, token });
});

// ====================================
// Chat Endpoint
// ====================================

app.post("/chat", async (req, res) => {
  const {
    session_id,
    message,
    page,
    lang,
    token,
    signature,
    recaptcha_token
  } = req.body;

  console.log(`📩 Chat request from session: ${session_id || "anonymous"}`);

  // 1. Origin Check
  const origin = req.get("origin");
  if (!isIframeSafe(origin)) {
    console.log(`❌ Origin not allowed: ${origin}`);
    return res.status(403).json({ error: "origin_not_allowed" });
  }
  console.log(`✅ Origin check passed: ${origin}`);

  // 2. Session token check
  const sess = SESSION_STORE.get(session_id);
  if (!sess) {
    console.log(`⚠️ Session not found: ${session_id}`);
  } else if (sess.token !== token) {
    console.log(`❌ Token mismatch for session: ${session_id}`);
    return res.status(401).json({ error: "invalid_session_token" });
  } else {
    sess.lastAccess = Date.now();
    console.log(`✅ Session token valid`);
  }

  // 3. Signature verification (temporarily disabled)
  console.log(`⚠️ Signature verification disabled (temporary)`);

  // 4. reCAPTCHA verification
  if (recaptcha_token) {
    const recaptchaValid = await verifyRecaptcha(recaptcha_token);
    if (!recaptchaValid) {
      console.log(`❌ reCAPTCHA failed`);
      return res.status(403).json({ error: "recaptcha_failed" });
    }
    console.log(`✅ reCAPTCHA passed`);
  }

  // 5. Chat handler
  try {
    const result = await handleChat({
      session_id,
      message,
      page,
      lang,
      req
    });

    console.log(`✅ Chat response sent`);
    res.json(result);
  } catch (err) {
    console.error(`❌ Chat handler error:`, err);
    res.status(500).json({
      error: "internal_error",
      reply:
        "Sorry, something went wrong. Please contact support at wealth@investonline.in or call 1800-2222-65."
    });
  }
});

// ====================================
// Session Cleanup
// ====================================

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, sess] of SESSION_STORE.entries()) {
    if (now - sess.lastAccess > SESSION_TTL) {
      SESSION_STORE.delete(sessionId);
      CREATED_TOKENS.delete(sess.token);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired sessions`);
  }
}, 60 * 60 * 1000); // Every hour

// ====================================
// Start Server
// ====================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ InvestOnline Buddy running on port ${PORT}`);
  console.log("🔒 Iframe embedding allowed for:", ALLOWED_ORIGIN);
  console.log(`🔍 Only searches InvestOnline.in (no AI/internet knowledge)`);
  console.log(`📝 Uses flows.json for keyword matching`);
  console.log(`📞 Falls back to support contact if info not found`);
  console.log(`⚡ Ready to chat!`);
});
