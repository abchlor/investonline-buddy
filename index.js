
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
        // CRITICAL FIX: allow your sites to embed the widget iframe
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

// -------------------- CORS (supports multiple domain origins) --------------------
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

console.log("ALLOWED_ORIGIN ENV RAW:", process.env.ALLOWED_ORIGIN);
console.log("Parsed allowedOrigins:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow server-to-server, curl, postman

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"))
