
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { handleChat } = require('./server/chat_handler');
const { health } = require('./server/health');
const { initSessionStore } = require('./server/session_store');

const app = express();

// -------------------- SECURITY / CSP / UTILS --------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "https:"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "connect-src": [
          "'self'",
          "https://investonline-buddy.onrender.com"
        ],
        "frame-ancestors": [
          "'self'",
          "https://www.investonline.in",
          "https://beta.investonline.in"
        ]
      }
    }
  })
);

app.use(express.json({ limit: '64kb' }));
app.use(morgan('tiny'));

// -------------------- CORS --------------------
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

console.log("ALLOWED_ORIGIN ENV RAW:", process.env.ALLOWED_ORIGIN);
console.log("Parsed allowedOrigins:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    }
  })
);

// -------------------- SESSION STORE --------------------
initSessionStore();

// -------------------- SERVE WIDGET FRONTEND --------------------
app.get("/widget", (req, res) => {
  res.sendFile(path.join(__dirname, "server", "widget.html"));
});

// -------------------- CHAT ROUTE --------------------
app.post('/chat', async (req, res) => {
  try {
    const { session_id, message, page = '/', lang = 'en' } = req.body;

    if (!session_id || !message) {
      return res.status(400).json({ error: 'session_id and message required' });
    }

    const reply = await handleChat({ session_id, message, page, lang });
    res.json(reply);

  } catch (err) {
    console.error("❌ Chat Error:", err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// -------------------- HEALTH CHECK --------------------
app.get('/health', (req, res) => health(req, res));

// -------------------- FEEDBACK --------------------
app.post('/feedback', (req, res) => {
  console.log('📩 User Feedback:', req.body);
  res.json({ status: 'ok' });
});

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, ()
});

