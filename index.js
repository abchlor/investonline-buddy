require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const { handleChat } = require("./server/chat_handler");
const { health } = require("./server/health");
const { initSessionStore } = require("./server/session_store");

const app = express();

// ---- Basic security with IFRAME support ----
app.use(
  helmet({
    contentSecurityPolicy: false,  // Disable default CSP
    frameguard: false              // Disable X-Frame-Options
  })
);

// Custom CSP and frame-ancestors headers
app.use((req, res, next) => {
  // Allow iframe embedding from your domains
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://beta.investonline.in https://www.investonline.in https://investonline.in"
  );
  
  // Fallback for older browsers
  res.removeHeader('X-Frame-Options');
  
  next();
});

app.use(express.json({ limit: "64kb" }));
app.use(morgan("tiny"));

// ---- CORS ----
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

console.log("Allowed origins:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or same-origin)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,  // Important for cookies/sessions
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// ---- Session store ----
initSessionStore();

// ---- Serve widget ----
app.get("/widget", (req, res) => {
  res.sendFile(path.join(__dirname, "server", "widget.html"));
});

// ---- Chat API ----
app.post("/chat", async (req, res) => {
  try {
    const { session_id, message, page = "/", lang = "en" } = req.body;

    if (!session_id || !message) {
      return res.status(400).json({ error: "session_id and message required" });
    }

    const reply = await handleChat({ session_id, message, page, lang });
    res.json(reply);
  } catch (err) {
    console.error("Chat Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ---- Health ----
app.get("/health", (req, res) => health(req, res));

// ---- Feedback ----
app.post("/feedback", (req, res) => {
  console.log("User Feedback:", req.body);
  res.json({ status: "ok" });
});

// ---- Start server ----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`InvestOnline Buddy running on ${PORT}`);
  console.log(`Iframe embedding allowed for: ${allowedOrigins.join(', ')}`);
});
