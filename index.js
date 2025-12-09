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
const { createSessionTokenForClient } = require("./server/utils");
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

app.post("/session/start", async (req, res) => {
  try {
    const sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    
    // Use the proper function from utils
    const { token, clientKey, expiresAt } = await createSessionTokenForClient({
      sessionId,
      createdAt: Date.now()
    });

    SESSION_STORE.set(sessionId, {
      token,
      clientKey,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      expiresAt
    });

    CREATED_TOKENS.add(token);

    console.log(`✅ Session created: ${sessionId}`);

    res.json({ 
      session_id: sessionId, 
      token,
      client_key: clientKey,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error('❌ Session creation error:', error);
    res.status(500).json({ 
      error: 'session_creation_failed',
      message: error.message 
    });
  }
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
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: #f8f9fa;
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
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      color: white;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    #chat-header-logo {
      width: 36px;
      height: 36px;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: #e74c3c;
      font-size: 16px;
    }
    #chat-header-text {
      flex: 1;
    }
    #chat-header-title {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 2px;
    }
    #chat-header-subtitle {
      font-size: 11px;
      opacity: 0.9;
    }
    #chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f8f9fa;
    }
    .message {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 12px;
      word-wrap: break-word;
      animation: slideIn 0.3s ease-out;
      line-height: 1.6;
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
      background: #e74c3c;
      color: white;
      align-self: flex-end;
      margin-left: auto;
      border-bottom-right-radius: 4px;
    }
    .message.bot {
      background: white;
      color: #2c3e50;
      align-self: flex-start;
      border: 1px solid #e0e0e0;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .message.bot p {
      margin: 0 0 12px 0;
      line-height: 1.6;
    }
    .message.bot p:last-child {
      margin-bottom: 0;
    }
    .message.bot a {
      color: #e74c3c;
      text-decoration: none;
      font-weight: 500;
      border-bottom: 1px solid #e74c3c;
      transition: all 0.2s;
    }
    .message.bot a:hover {
      color: #c0392b;
      border-bottom-color: #c0392b;
    }
    .message.bot ul, .message.bot ol {
      margin: 8px 0;
      padding-left: 20px;
    }
    .message.bot li {
      margin: 4px 0;
    }
    .message.bot strong {
      color: #e74c3c;
    }
    .quick-replies {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 0;
      animation: slideIn 0.3s ease-out;
      align-self: flex-start;
      max-width: 100%;
    }
    .quick-reply-btn {
      padding: 8px 14px;
      background: white;
      border: 2px solid #e74c3c;
      color: #e74c3c;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .quick-reply-btn:hover {
      background: #e74c3c;
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 2px 8px rgba(231, 76, 60, 0.3);
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
      font-family: inherit;
      outline: none;
      transition: border-color 0.3s;
    }
    #chat-input:focus {
      border-color: #e74c3c;
    }
    #send-button {
      padding: 12px 24px;
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      color: white;
      border: none;
      border-radius: 24px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: transform 0.2s, opacity 0.3s, box-shadow 0.2s;
    }
    #send-button:hover:not(:disabled) {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3);
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
      background: #e74c3c;
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
        opacity: 0.5;
      }
      30% {
        transform: translateY(-10px);
        opacity: 1;
      }
    }
  </style>
</head>
<body>
  <div id="chat-container">
    <div id="chat-header">
      <div id="chat-header-logo">IO</div>
      <div id="chat-header-text">
        <div id="chat-header-title">InvestOnline Buddy</div>
        <div id="chat-header-subtitle">Your Investment Assistant</div>
      </div>
    </div>
    <div id="chat-messages">
      <div class="message bot">
        <p>Hi! I'm InvestOnline Buddy. 👋</p>
        <p>I can help you with information about mutual funds, SIPs, account opening, and more. How can I assist you today?</p>
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
      
      if (isUser) {
        messageDiv.textContent = text;
      } else {
        // Format bot messages with proper paragraphs and links
        const formatted = text
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
          .split('\n')
          .filter(line => line.trim())
          .map(line => \`<p>\${line.trim()}</p>\`)
          .join('');
        messageDiv.innerHTML = formatted;
      }
      
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addBotMessage(text) {
      addMessage(text, false);
    }

    function addUserMessage(text) {
      addMessage(text, true);
    }

    // Quick reply buttons
    function addQuickReplies(suggestions) {
      // Remove existing quick replies
      const existing = document.getElementById('quick-replies');
      if (existing) existing.remove();

      if (!suggestions || suggestions.length === 0) return;

      const quickRepliesDiv = document.createElement('div');
      quickRepliesDiv.id = 'quick-replies';
      quickRepliesDiv.className = 'quick-replies';

      suggestions.forEach(suggestion => {
        const button = document.createElement('button');
        button.className = 'quick-reply-btn';
        button.textContent = suggestion;
        button.onclick = () => {
          chatInput.value = suggestion;
          sendMessage();
        };
        quickRepliesDiv.appendChild(button);
      });

      chatMessages.appendChild(quickRepliesDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
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

      // Remove quick replies when user sends a message
      const quickReplies = document.getElementById('quick-replies');
      if (quickReplies) quickReplies.remove();

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
          
          // Add contextual quick replies based on response
          const lowerReply = data.reply.toLowerCase();
          if (lowerReply.includes('register') || lowerReply.includes('account')) {
            addQuickReplies(['What is KYC?', 'Required documents', 'Contact support']);
          } else if (lowerReply.includes('sip')) {
            addQuickReplies(['SIP Calculator', 'Top Mutual Funds', 'Minimum SIP amount']);
          } else if (lowerReply.includes('kyc')) {
            addQuickReplies(['How to register?', 'Required documents', 'Talk to advisor']);
          } else if (lowerReply.includes('fund')) {
            addQuickReplies(['SIP Calculator', 'How to start SIP?', 'Top Mutual Funds']);
          } else {
            addQuickReplies(['How to register?', 'Start SIP', 'Contact support']);
          }
        } else {
          addBotMessage('Sorry, I encountered an error. Please try again.');
          addQuickReplies(['How to register?', 'Contact support']);
        }
      } catch (error) {
        console.error('❌ Chat error:', error);
        hideTyping();
        addBotMessage('Sorry, something went wrong. Please try again.');
        addQuickReplies(['Contact support', 'Try again']);
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
    
    // Show initial quick replies after a short delay
    setTimeout(() => {
      addQuickReplies([
        '🎯 How to register?',
        '📝 What is KYC?',
        '💰 How to start SIP?',
        '📊 SIP Calculator',
        '🏆 Top Mutual Funds',
        '📞 Contact Support'
      ]);
    }, 800);
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
