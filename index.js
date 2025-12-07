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

console.log(`🚀 Starting InvestOnline Buddy...`);

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

// Capture raw body for signature verification
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

// ---- Session start ----
app.post("/session/start", async (req, res) => {
  try {
    const { session_id: requestedSessionId } = req.body || {};
    const origin = req.headers.origin || "";
    if (!origin || !allowedOrigins.some(o => origin.startsWith(o))) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    const payload = {
      session_id: requestedSessionId || `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
      created_at: Date.now()
    };

    const { token, clientKey, expiresAt } = await createSessionTokenForClient(payload);
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

// ---- Chat endpoint ----
app.post("/chat", async (req, res) => {
  try {
    // Origin validation
    const origin = req.headers.origin || req.headers.referer || "";
    if (!origin || !allowedOrigins.some(o => origin.startsWith(o))) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    // Extract headers
    const sessionToken = req.headers["x-session-token"] || req.body.session_token;
    const recaptchaToken = req.headers["x-recaptcha-token"] || req.body.recaptchaToken;

    if (!sessionToken || !recaptchaToken) {
      return res.status(401).json({ error: "missing_headers" });
    }

    // Verify reCAPTCHA
    try {
      await verifyRecaptcha(process.env.RECAPTCHA_SECRET || "", recaptchaToken);
    } catch (recaptchaErr) {
      return res.status(429).json({ error: 'recaptcha_failed' });
    }

    // Verify session token
    const tokenInfo = await verifyTokenAndPayload(sessionToken);
    if (!tokenInfo || !tokenInfo.clientKey) {
      return res.status(401).json({ error: "invalid_session_token" });
    }

    // All checks passed
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
  console.log(`✅ InvestOnline Buddy running on ${PORT}`);
  console.log(`Iframe embedding allowed for: ${allowedOrigins.join(", ")}`);
});
