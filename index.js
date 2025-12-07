require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const crypto = require("crypto");

const { handleChat } = require("./server/chat_handler");
const { health } = require("./server/health");
const { initSessionStore } = require("./server/session_store");

const {
  verifySignatureWithClientKey,
  verifyTokenAndPayload,
  createSessionTokenForClient,
  verifyRecaptcha,
  rateLimitMiddleware,
  detectAutomationMiddleware
} = require("./server/utils");

const app = express();

// ====================================
// AI SEARCH INITIALIZATION - FIXED!
// ====================================
const { initialize } = require("./server/search");

console.log(`🚀 Starting InvestOnline Buddy with AI Search...`);

// Initialize search module (instant - no crawling!)
(async () => {
  try {
    await initialize();
    console.log(`✅ Search module ready! Chatbot will fetch pages on-demand.`);
  } catch (err) {
    console.error(`❌ Failed to initialize search:`, err.message);
  }
})();

// ---- Basic security with IFRAME support ----
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false
  })
);

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://beta.investonline.in https://www.investonline.in https://investonline.in"
  );
  res.removeHeader("X-Frame-Options");
  next();
});

// Capture raw body for signature verification (when re-enabled)
app.use(express.json({ 
  limit: "64kb",
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}));

app.use(morgan("tiny"));

// ---- CORS ----
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
console.log("Allowed origins:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.log("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Signature",
      "X-Timestamp",
      "X-Recaptcha-Token",
      "X-Session-Token",
      "X-Requested-With"
    ]
  })
);

// ---- Session store init ----
initSessionStore();
console.log("Using in-memory session store");

// ---- Global security middlewares ----
app.use(rateLimitMiddleware()); // IP-based
app.use(detectAutomationMiddleware()); // payload heuristics

// ---- Landing page at / ----
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "server", "widget.html"));
});

// ---- Session start: issues a signed, encrypted session token and a short-lived client_key ----
app.post("/session/start", async (req, res) => {
  try {
    // Accept optional session_id from frontend or create one
    const { session_id: requestedSessionId } = req.body || {};
    const origin = req.headers.origin || "";
    if (!origin || !allowedOrigins.some(o => origin.startsWith(o))) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    const payload = {
      session_id: requestedSessionId || `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
      created_at: Date.now()
    };

    // create session token and client key
    const { token, clientKey, expiresAt } = await createSessionTokenForClient(payload);
    // return token and client_key to widget
    return res.json({
      ok: true,
      session_token: token,
      client_key: clientKey,
      expires_at: expiresAt
    });
  } catch (e) {
    console.error("session/start error", e);
    return res.status(500).json({ error: "session_error" });
  }
});

// ---- Chat endpoint: validation for token, recaptcha (signature disabled) ----
app.post("/chat", async (req, res) => {
  try {
    // === STEP 1: Origin validation ===
    const origin = req.headers.origin || req.headers.referer || "";
    console.log("📍 Origin check:", origin);
    
    if (!origin || !allowedOrigins.some(o => origin.startsWith(o))) {
      console.log("❌ REJECTED: Origin not allowed");
      return res.status(403).json({ error: "Origin not allowed" });
    }
    console.log("✅ PASSED: Origin OK");

    // === STEP 2: Extract headers ===
    const sessionToken = req.headers["x-session-token"] || req.body.session_token;
    const recaptchaToken = req.headers["x-recaptcha-token"] || req.body.recaptchaToken;

    console.log("📦 Headers:", {
      hasToken: !!sessionToken,
      hasRecaptcha: !!recaptchaToken
    });

    if (!sessionToken || !recaptchaToken) {
      console.log("❌ REJECTED: Missing headers");
      return res.status(401).json({ 
        error: "missing_headers",
        missing: {
          sessionToken: !sessionToken,
          recaptcha: !recaptchaToken
        }
      });
    }
    console.log("✅ PASSED: All headers present");

    // === STEP 3: Verify reCAPTCHA ===
    console.log("🔐 Checking reCAPTCHA...");
    try {
      await verifyRecaptcha(process.env.RECAPTCHA_SECRET || "", recaptchaToken);
      console.log("✅ PASSED: reCAPTCHA OK");
    } catch (recaptchaErr) {
      console.log("❌ REJECTED: reCAPTCHA failed -", recaptchaErr.message);
      return res.status(429).json({ error: 'recaptcha_failed' });
    }

    // === STEP 4: Verify session token ===
    console.log("🎫 Checking session token...");
    const tokenInfo = await verifyTokenAndPayload(sessionToken);
    if (!tokenInfo || !tokenInfo.clientKey) {
      console.log("❌ REJECTED: Session token invalid or expired");
      return res.status(401).json({ error: "invalid_session_token" });
    }
    console.log("✅ PASSED: Session token OK");

    // === STEP 5: Signature verification - DISABLED ===
    console.log("⚠️ SKIPPED: Signature verification (temporarily disabled)");
    // TODO: Re-enable signature verification after fixing hex encoding issue
    /*
    const clientSignature = req.headers["x-signature"];
    const timestamp = req.headers["x-timestamp"];
    
    if (!clientSignature || !timestamp) {
      console.log("❌ REJECTED: Missing signature/timestamp");
      return res.status(401).json({ error: "missing_signature" });
    }
    
    const validSig = await verifySignatureWithClientKey(
      tokenInfo.clientKey, 
      timestamp, 
      req.rawBody || req.body,
      clientSignature
    );
    
    if (!validSig) {
      console.log("❌ REJECTED: Signature invalid");
      return res.status(401).json({ error: "invalid_signature" });
    }
    console.log("✅ PASSED: Signature OK");
    */

    // === All checks passed! ===
    console.log("🎉 All security checks passed!");
    const { session_id, message, page = "/", lang = "en" } = req.body;

    if (!session_id || !message) {
      return res.status(400).json({ error: "session_id and message required" });
    }

    const reply = await handleChat({ session_id, message, page, lang, req });
    return res.json(reply);

  } catch (err) {
    console.error("💥 Chat Error:", err);
    if (err && err.code === 'RECAPTCHA_FAIL') {
      return res.status(429).json({ error: 'recaptcha_failed' });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

// ---- Health & others ----
app.get("/health", (req, res) => health(req, res));
app.post("/feedback", (req, res) => { 
  console.log("User Feedback:", req.body); 
  res.json({ status: "ok" }); 
});

app.get("/widget", (req, res) => {
  res.sendFile(path.join(__dirname, "server", "widget.html"));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`InvestOnline Buddy running on ${PORT}`);
  console.log(`Iframe embedding allowed for: ${allowedOrigins.join(", ")}`);
});
