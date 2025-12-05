require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const { handleChat } = require("./server/chat_handler");
const { health } = require("./server/health");
const { initSessionStore } = require("./server/session_store");

const {
  verifySignature,
  verifyRecaptcha,
  rateLimitMiddleware,
  detectAutomationMiddleware
} = require("./server/utils");

const crypto = require("crypto");

const app = express();

// ---- Basic security with IFRAME support (keep your existing headers) ----
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

// parse bodies (keep your original 64kb limit)
app.use(express.json({ limit: "64kb" }));
app.use(morgan("tiny"));

// ---- CORS (preserve your allowed origin logic) ----
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
      "X-Requested-With"
    ]
  })
);

// ---- Session store init ----
initSessionStore();

// ---- Security middlewares (Strict option A) ----
app.use(rateLimitMiddleware()); // IP-based
app.use(detectAutomationMiddleware()); // payload heuristics

// Origin enforcement middleware (strict)
function originEnforce(req, res, next) {
  const origin = req.headers.origin || req.headers.referer || "";
  if (!origin) {
    // In strict mode, require origin
    return res.status(403).json({ error: "Missing origin header" });
  }
  const ok = allowedOrigins.some((o) => origin.startsWith(o));
  if (!ok) return res.status(403).json({ error: "Origin not allowed" });
  next();
}

// Signed request + recaptcha check (strict)
async function signedAndRecaptchaCheck(req, res, next) {
  const HMAC_SECRET = process.env.HMAC_SECRET || "";
  const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || "";

  const signature = req.headers["x-signature"];
  const timestamp = req.headers["x-timestamp"];
  const recaptchaToken = req.headers["x-recaptcha-token"] || req.body.recaptchaToken;

  if (!signature || !timestamp) {
    return res.status(401).json({ error: "Missing signature headers" });
  }
  if (!recaptchaToken) {
    return res.status(401).json({ error: "Missing recaptcha token" });
  }
  // Verify signature
  const validSig = verifySignature(HMAC_SECRET, timestamp, req.body, signature);
  if (!validSig) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Verify recaptcha (strict) - throws on failure
  try {
    const score = await verifyRecaptcha(RECAPTCHA_SECRET, recaptchaToken);
    if (score < 0.5) {
      return res.status(429).json({ error: "Bot detection failed" });
    }
  } catch (e) {
    console.error("Recaptcha verify error", e);
    return res.status(500).json({ error: "Recaptcha verification error" });
  }

  next();
}

// ---- Serve widget (preserve) ----
app.get("/widget", (req, res) => {
  res.sendFile(path.join(__dirname, "server", "widget.html"));
});

// ---- Chat API (preserve route path, apply strict middlewares) ----
app.post("/chat", originEnforce, signedAndRecaptchaCheck, async (req, res) => {
  try {
    // keep your existing input names for compatibility
    const { session_id, message, page = "/", lang = "en" } = req.body;

    if (!session_id || !message) {
      return res.status(400).json({ error: "session_id and message required" });
    }

    const reply = await handleChat({ session_id, message, page, lang, req });
    return res.json(reply);
  } catch (err) {
    console.error("Chat Error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ---- Health (preserve) ----
app.get("/health", (req, res) => health(req, res));

// ---- Feedback (preserve) ----
app.post("/feedback", (req, res) => {
  console.log("User Feedback:", req.body);
  res.json({ status: "ok" });
});

// ---- Start server ----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`InvestOnline Buddy running on ${PORT}`);
  console.log(`Iframe embedding allowed for: ${allowedOrigins.join(", ")}`);
});
