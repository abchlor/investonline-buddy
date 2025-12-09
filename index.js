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
// Widget Endpoint (for iframe embedding)
// ====================================

app.get("/widget", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InvestOnline Buddy</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: #f5f5f5;
    }
    #chat-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      max-width: 100%;
      background: white;
      overflow: hidden;
    }
    #chat-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px;
      text-align: center;
      font-weight: 600;
      font-size: 18px;
    }
    #chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 12px;
      word-wrap: break-word;
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .message.user {
      background: #667eea;
      color: white;
      align-self: flex-end;
      margin-left: auto;
    }
    .message.bot {
      background: #f0f0f0;
      color: #333;
      align-self: flex-start;
    }
    #chat-input-container {
      padding: 16px;
      background: white;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 8px;
    }
    #chat-input {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.3s;
    }
    #chat-input:focus {
      border-color: #667eea;
    }
    #send-button {
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 24px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, opacity 0.3s;
    }
    #send-button:hover:not(:disabled) {
      transform: scale(1.05);
    }
    #send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .typing-indicator {
      display: inline-flex;
      gap: 4px;
      padding: 12px 16px;
    }
    .typing-indicator span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #999;
      animation: typing 1.4s infinite;
    }
    .typing-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }
    .typing-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }
    @keyframes typing {
      0%, 60%, 100% {
        transform: translateY(0);
      }
      30% {
        transform: translateY(-10px);
      }
    }
  </style>
</head>
<body>
  <div id="chat-container">
    <div id="chat-header">
      💬 InvestOnline Buddy
    </div>
    <div id="chat-messages">
      <div class="message bot">
        Hi! I'm InvestOnline Buddy. I can help you with information about mutual funds, SIPs, account opening, and more. How can I assist you today?
      </div>
    </div>
    <div id="chat-input-container">
      <input 
        type="text" 
        id="chat-input" 
        placeholder="Type your message..." 
        autocomplete="off"
      />
      <button id="send-button">Send</button>
    </div>
  </div>

  <script>
    let sessionId = null;
    let sessionToken = null;
    const API_URL = window.location.origin;

    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');

    // Initialize session
    async function initSession() {
      try {
        const response = await fetch(\`\${API_URL}/session/start\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        sessionId = data.session_id;
        sessionToken = data.token;
        console.log('✅ Session initialized:', sessionId);
      } catch (error) {
        console.error('❌ Failed to initialize session:', error);
        addBotMessage('Sorry, I encountered an error connecting. Please refresh the page.');
      }
    }

    // Add message to chat
    function addMessage(text, isUser = false) {
      const messageDiv = document.createElement('div');
      messageDiv.className = \`message \${isUser ? 'user' : 'bot'}\`;
      messageDiv.textContent = text;
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addBotMessage(text) {
      addMessage(text, false);
    }

    function addUserMessage(text) {
      addMessage(text, true);
    }

    // Show typing indicator
    function showTyping() {
      const typingDiv = document.createElement('div');
      typingDiv.className = 'message bot typing-indicator';
      typingDiv.innerHTML = '<span></span><span></span><span></span>';
      typingDiv.id = 'typing-indicator';
      chatMessages.appendChild(typingDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function hideTyping() {
      const typing = document.getElementById('typing-indicator');
      if (typing) typing.remove();
    }

    // Send message
    async function sendMessage() {
      const message = chatInput.value.trim();
      if (!message) return;

      // Disable input
      chatInput.disabled = true;
      sendButton.disabled = true;

      // Add user message
      addUserMessage(message);
      chatInput.value = '';

      // Show typing
      showTyping();

      try {
        const response = await fetch(\`\${API_URL}/chat\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            token: sessionToken,
            message: message,
            page: window.location.href,
            lang: 'en'
          })
        });

        const data = await response.json();
        hideTyping();

        if (data.reply) {
          addBotMessage(data.reply);
        } else {
          addBotMessage('Sorry, I encountered an error. Please try again.');
        }
      } catch (error) {
        console.error('❌ Chat error:', error);
        hideTyping();
        addBotMessage('Sorry, something went wrong. Please try again.');
      } finally {
        // Re-enable input
        chatInput.disabled = false;
        sendButton.disabled = false;
        chatInput.focus();
      }
    }

    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    // Initialize on load
    initSession();
  </script>
</body>
</html>
  `);
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
