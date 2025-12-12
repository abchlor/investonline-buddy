// ====================================
// InvestOnline Buddy - Main Server
// Pure InvestOnline Search Version
// FIXED v7: Language change clears chat, Asset Allocation, Top Funds
// ====================================

require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");

const { verifyRecaptcha } = require("./server/recaptcha");
const { createSessionTokenForClient } = require("./server/utils");
const { handleChat } = require("./server/chat_handler");
const { initialize } = require("./server/search");

const app = express();
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const isIframeSafe = (origin) =>
  !origin || ALLOWED_ORIGIN.some((allowed) => origin.includes(allowed));

// ====================================
// Security & Middleware
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
        frameAncestors: [...ALLOWED_ORIGIN],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use((req, res, next) => {
  const origin = req.get("origin") || req.get("referer");
  if (origin && isIframeSafe(origin)) {
    res.removeHeader("X-Frame-Options");
    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors ${ALLOWED_ORIGIN.join(" ")}`
    );
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
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

// ====================================
// Initialize Search Module
// ====================================

console.log("🚀 Starting InvestOnline Buddy v7 - Pure Search Version");
console.log("📌 Searching only InvestOnline.in");
console.log("⚠️ No AI fallback, No internet knowledge");

initialize()
  .then(() => console.log("✅ Search module initialized"))
  .catch((err) => console.error("❌ Search init failed:", err));

// ====================================
// Session Management
// ====================================

const SESSION_STORE = new Map();
const CREATED_TOKENS = new Set();
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12 hours

// ====================================
// Health Check
// ====================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "InvestOnline Buddy v7 - Pure Search Version",
    version: "7.0.0",
    searchDomains: [
      "https://www.investonline.in",
      "https://beta.investonline.in",
      "https://investonline.in",
    ],
    features: [
      "Pure InvestOnline.in search only",
      "No AI fallback",
      "No internet knowledge",
      "Uses flows.json for keyword matching",
      "Fallback: Contact support if info not found",
      "NEW: Asset Allocation support",
      "NEW: Top Funds queries",
      "FIXED: Language change clears chat",
    ],
    support: {
      email: "wealth@investonline.in",
      phone_toll_free: "1800-2222-65",
      phone_direct: "+91-22-4071-3333",
    },
  });
});

// ====================================
// Session Endpoint
// ====================================

app.post("/session/start", async (req, res) => {
  try {
    const sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const { token, clientKey, expiresAt } = await createSessionTokenForClient({
      sessionId,
      createdAt: Date.now(),
    });

    SESSION_STORE.set(sessionId, {
      token,
      clientKey,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      expiresAt,
      questionCount: 0,
      conversationHistory: [],
      language: "en",
    });

    CREATED_TOKENS.add(token);

    console.log(`✅ Session created: ${sessionId}`);

    res.json({
      session_id: sessionId,
      token,
      client_key: clientKey,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error("❌ Session creation error:", error);
    res.status(500).json({
      error: "session_creation_failed",
      message: error.message,
    });
  }
});

// ====================================
// Chat Endpoint
// ====================================

app.post("/chat", async (req, res) => {
  const { session_id, token, message, page, lang = "en" } = req.body;

  // Origin check
  const origin = req.get("origin") || req.get("referer");
  if (!isIframeSafe(origin)) {
    return res.status(403).json({ error: "forbidden_origin" });
  }

  // Session validation
  const session = SESSION_STORE.get(session_id);
  if (!session) {
    return res.status(401).json({ error: "invalid_session" });
  }

  if (session.token !== token) {
    return res.status(401).json({ error: "invalid_token" });
  }

  if (Date.now() > session.expiresAt) {
    SESSION_STORE.delete(session_id);
    return res.status(401).json({ error: "session_expired" });
  }

  try {
    const result = await handleChat({
      sessionId: session_id,
      message,
      page,
      language: lang,
      SESSION_STORE,
    });

    res.json(result);
  } catch (error) {
    console.error("❌ Chat error:", error);
    res.status(500).json({
      error: "chat_failed",
      message:
        "Sorry, I encountered an error. Please contact support at wealth@investonline.in or call 1800-2222-65.",
    });
  }
});

// ====================================
// Lead Capture Endpoint
// ====================================

app.post("/lead/capture", async (req, res) => {
  const { session_id, name, phone, email, comments } = req.body;

  // Validation
  if (!session_id || !name || !phone) {
    return res.status(400).json({
      error: "validation_failed",
      message: "Name and phone are required",
    });
  }

  // Basic phone validation (10 digits for India)
  const phoneRegex = /^[6-9]\d{9}$/;
  if (!phoneRegex.test(phone.replace(/\D/g, ""))) {
    return res.status(400).json({
      error: "validation_failed",
      message: "Invalid phone number",
    });
  }

  // Email validation (if provided)
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "validation_failed",
        message: "Invalid email address",
      });
    }
  }

  try {
    const lead = {
      session_id,
      name,
      phone,
      email: email || null,
      comments: comments || null,
      timestamp: new Date().toISOString(),
      source: "chatbot_widget",
    };

    // TODO: Store in database (MongoDB, MySQL, etc.)
    // For now, log to console
    console.log("📞 New Lead Captured:", JSON.stringify(lead, null, 2));

    // TODO: Send email notification to sales team
    // TODO: Add to CRM system
    // TODO: Send SMS/Email confirmation to user

    res.json({
      success: true,
      message: "Thank you! Our team will contact you soon.",
    });
  } catch (error) {
    console.error("❌ Lead capture error:", error);
    res.status(500).json({
      error: "lead_capture_failed",
      message: "Failed to submit details. Please try again.",
    });
  }
});

// ====================================
// Widget Endpoint - v7 COMPLETE FIX
// Fixed: Language change clears chat, No duplication
// ====================================

app.get("/widget", (req, res) => {
  res.send(String.raw`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InvestOnline Buddy v7</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    html, body {
      height: 100%;
      overflow: hidden;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    
    body {
      display: flex;
      flex-direction: column;
      background: #f8f9fa;
    }
    
    #chat-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100%;
      background: white;
      position: relative;
    }
    
    /* FIXED: Sticky header that never scrolls */
    #chat-header {
      background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%);
      color: white;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      min-height: 68px;
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
      color: #FF6B35;
      font-size: 16px;
      flex-shrink: 0;
    }
    
    #chat-header-text { flex: 1; }
    #chat-header-title { font-weight: 600; font-size: 16px; }
    #chat-header-subtitle { font-size: 11px; opacity: 0.9; }
    
    #language-selector {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      flex-shrink: 0;
    }
    
    #language-selector option {
      background: #FF6B35;
      color: white;
    }
    
    /* FIXED: Messages area with proper spacing for fixed header */
    #chat-messages {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #f8f9fa;
      margin-top: 68px;
      margin-bottom: 80px;
    }
    
    .message {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      line-height: 1.5;
      animation: slideIn 0.3s ease-out;
      word-wrap: break-word;
    }
    
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .message.user {
      background: #FF6B35;
      color: white;
      align-self: flex-end;
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
    
    .message.bot p { margin: 0 0 8px 0; line-height: 1.6; }
    .message.bot p:last-child { margin-bottom: 0; }
    .message.bot ul { margin: 8px 0; padding-left: 20px; list-style: disc; }
    .message.bot li { margin: 4px 0; line-height: 1.5; }
    .message.bot h4 {
      color: #FF6B35;
      font-size: 15px;
      font-weight: 600;
      margin: 10px 0 6px 0;
      padding-bottom: 4px;
      border-bottom: 2px solid #FF6B35;
    }
    .message.bot strong {
      color: #FF6B35;
      font-weight: 600;
    }
    .message.bot a {
      color: #FF6B35;
      text-decoration: none;
      font-weight: 500;
      border-bottom: 1px solid #FF6B35;
      transition: all 0.2s;
    }
    .message.bot a:hover {
      color: #F7931E;
      border-bottom-color: #F7931E;
    }
    
    .quick-replies {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 0;
      max-width: 100%;
    }
    
    .quick-reply-btn {
      padding: 7px 12px;
      background: white;
      border: 2px solid #FF6B35;
      color: #FF6B35;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .quick-reply-btn:hover {
      background: #FF6B35;
      color: white;
      transform: translateY(-2px);
      box-shadow: 0 2px 8px rgba(255, 107, 53, 0.3);
    }
    
    /* FIXED: Input container at bottom */
    #chat-input-container {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 16px;
      background: white;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 8px;
      z-index: 999;
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
    
    #chat-input:focus { border-color: #FF6B35; }
    
    #voice-button {
      padding: 12px 16px;
      background: white;
      border: 2px solid #FF6B35;
      color: #FF6B35;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;
      min-width: 48px;
      flex-shrink: 0;
    }
    
    #voice-button:hover:not(:disabled) {
      background: #FF6B35;
      color: white;
    }
    
    #voice-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    #voice-button.recording {
      background: #e74c3c;
      border-color: #e74c3c;
      color: white;
      animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    
    #send-button {
      padding: 12px 24px;
      background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%);
      color: white;
      border: none;
      border-radius: 24px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    
    #send-button:hover:not(:disabled) {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
    }
    
    #send-button:disabled { opacity: 0.5; cursor: not-allowed; }
    
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
    }
    
    .typing-indicator span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #FF6B35;
      animation: typing 1.4s infinite;
    }
    
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
      30% { transform: translateY(-10px); opacity: 1; }
    }
    
    .lead-form {
      background: white;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      max-width: 90%;
      align-self: flex-start;
    }
    
    .lead-form h4 {
      color: #FF6B35;
      margin-bottom: 12px;
      font-size: 16px;
    }
    
    .lead-form input, .lead-form textarea {
      width: 100%;
      padding: 10px;
      margin: 8px 0;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
    }
    
    .lead-form input:focus, .lead-form textarea:focus {
      outline: none;
      border-color: #FF6B35;
    }
    
    .lead-form button {
      width: 100%;
      padding: 12px;
      background: #FF6B35;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
    }
    
    .lead-form button:hover {
      background: #F7931E;
    }
  </style>
</head>
<body>
  <div id="chat-container">
    <div id="chat-header">
      <div id="chat-header-logo">IO</div>
      <div id="chat-header-text">
        <div id="chat-header-title">InvestOnline Buddy v7</div>
        <div id="chat-header-subtitle">Your Investment Assistant</div>
      </div>
      <select id="language-selector">
        <option value="en">English</option>
        <option value="hi">हिंदी</option>
        <option value="mr">मराठी</option>
        <option value="gu">ગુજરાતી</option>
        <option value="ta">தமிழ்</option>
      </select>
    </div>
    <div id="chat-messages">
      <!-- Initial welcome message will be inserted here -->
    </div>
    <div id="chat-input-container">
      <input type="text" id="chat-input" placeholder="Type your message..." autocomplete="off" />
      <button id="voice-button" title="Voice Input">🎤</button>
      <button id="send-button">Send</button>
    </div>
  </div>

  <script>
    var sessionId = null;
    var sessionToken = null;
    var currentLanguage = 'en';
    var isRecording = false;
    var recognition = null;
    var API_URL = window.location.origin;
    var chatMessages = document.getElementById('chat-messages');
    var chatInput = document.getElementById('chat-input');
    var sendButton = document.getElementById('send-button');
    var voiceButton = document.getElementById('voice-button');
    var languageSelector = document.getElementById('language-selector');

    // Cookie utilities
    function setCookie(name, value, days) {
      var expires = "";
      if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
      }
      document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Strict";
    }

    function getCookie(name) {
      var nameEQ = name + "=";
      var ca = document.cookie.split(';');
      for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
      }
      return null;
    }

    // Voice input initialization
    function initVoiceInput() {
      if (window.location.protocol !== 'https:') {
        console.warn('⚠️ Voice input requires HTTPS');
        voiceButton.style.display = 'none';
        return;
      }

      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('⚠️ Voice input not supported');
        voiceButton.title = 'Voice input not supported';
        voiceButton.style.opacity = '0.5';
        voiceButton.disabled = true;
        return;
      }

      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = function(event) {
        var transcript = event.results[0][0].transcript;
        chatInput.value = transcript;
        isRecording = false;
        voiceButton.classList.remove('recording');
        voiceButton.textContent = '🎤';
        
        setTimeout(function() {
          if (chatInput.value) sendMessage();
        }, 500);
      };

      recognition.onerror = function(event) {
        console.error('Voice error:', event.error);
        isRecording = false;
        voiceButton.classList.remove('recording');
        voiceButton.textContent = '🎤';
        
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          alert('Microphone access denied. Please enable in browser settings.');
        } else if (event.error === 'no-speech') {
          alert('No speech detected. Please try again.');
        }
      };

      recognition.onend = function() {
        isRecording = false;
        voiceButton.classList.remove('recording');
        voiceButton.textContent = '🎤';
      };
      
      console.log('✅ Voice input initialized');
    }

    function toggleVoiceInput() {
      if (!recognition) {
        alert('Voice input not available in this browser.');
        return;
      }

      if (isRecording) {
        recognition.stop();
      } else {
        try {
          recognition.lang = currentLanguage === 'en' ? 'en-US' : 
                           currentLanguage === 'hi' ? 'hi-IN' :
                           currentLanguage === 'mr' ? 'mr-IN' :
                           currentLanguage === 'gu' ? 'gu-IN' :
                           currentLanguage === 'ta' ? 'ta-IN' : 'en-US';
          recognition.start();
          isRecording = true;
          voiceButton.classList.add('recording');
          voiceButton.textContent = '⏺';
        } catch (error) {
          console.error('Voice start error:', error);
          alert('Could not start voice input.');
        }
      }
    }

    // Enhanced markdown parsing
    function addMessage(text, isUser) {
      var messageDiv = document.createElement('div');
      messageDiv.className = 'message ' + (isUser ? 'user' : 'bot');
      
      if (isUser) {
        messageDiv.textContent = text;
      } else {
        var html = text
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/^• (.+)$/gm, '<li>$1</li>')
          .split('\n')
          .filter(function(line) { return line.trim(); })
          .map(function(line) {
            var trimmed = line.trim();
            if (trimmed.startsWith('<li>')) return trimmed;
            if (/^(.+):$/.test(trimmed) && !trimmed.includes('<a')) {
              return '<h4>' + trimmed.replace(/:$/, '') + '</h4>';
            }
            return '<p>' + trimmed + '</p>';
          })
          .join('');
        
        html = html.replace(/(<li>.*?<\/li>)+/g, function(match) {
          return '<ul>' + match + '</ul>';
        });
        
        messageDiv.innerHTML = html;
      }
      
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function addQuickReplies(suggestions) {
      var existing = document.getElementById('quick-replies');
      if (existing) existing.remove();
      if (!suggestions || !suggestions.length) return;

      var div = document.createElement('div');
      div.id = 'quick-replies';
      div.className = 'quick-replies';

      suggestions.forEach(function(text) {
        var btn = document.createElement('button');
        btn.className = 'quick-reply-btn';
        btn.textContent = text;
        btn.onclick = function() {
          chatInput.value = text;
          sendMessage();
        };
        div.appendChild(btn);
      });

      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showLeadForm() {
      var formDiv = document.createElement('div');
      formDiv.className = 'lead-form';
      formDiv.innerHTML = '<h4>📞 Request Callback</h4>' +
        '<p style="font-size: 13px; color: #666; margin-bottom: 10px;">Our team will contact you soon!</p>' +
        '<input type="text" id="lead-name" placeholder="Your Name *" required>' +
        '<input type="tel" id="lead-phone" placeholder="Phone Number *" required>' +
        '<input type="email" id="lead-email" placeholder="Email (optional)">' +
        '<textarea id="lead-comments" placeholder="Comments (optional)" rows="3"></textarea>' +
        '<button onclick="submitLead()">Submit Request</button>';
      
      chatMessages.appendChild(formDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function submitLead() {
      var name = document.getElementById('lead-name').value.trim();
      var phone = document.getElementById('lead-phone').value.trim();
      var email = document.getElementById('lead-email').value.trim();
      var comments = document.getElementById('lead-comments').value.trim();

      if (!name || !phone) {
        alert('Please enter your name and phone number');
        return;
      }

      fetch(API_URL + '/lead/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          name: name,
          phone: phone,
          email: email,
          comments: comments
        })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.success) {
          addMessage('✅ ' + data.message + '\n\nMeanwhile, feel free to continue asking questions!', false);
          document.querySelector('.lead-form').remove();
        } else {
          alert(data.message || 'Failed to submit.');
        }
      })
      .catch(function(err) {
        console.error('Lead error:', err);
        alert('Network error. Please try again.');
      });
    }

    function showTyping() {
      var existing = document.getElementById('typing');
      if (existing) return;  // FIXED: Prevent duplicate typing indicators
      
      var div = document.createElement('div');
      div.className = 'message bot typing-indicator';
      div.innerHTML = '<span></span><span></span><span></span>';
      div.id = 'typing';
      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function hideTyping() {
      var typing = document.getElementById('typing');
      if (typing) typing.remove();
    }

    // ✅ CRITICAL FIX v7: Show welcome message in selected language
    function showWelcomeMessage(lang) {
      var welcomeMessages = {
        'en': '<strong>Welcome to InvestOnline! 👋</strong><br><br>I\'m your investment assistant. I can help you with:<br>• Mutual fund investments<br>• SIP & calculators<br>• Account opening & KYC<br>• Portfolio tracking<br>• <strong>Asset Allocation</strong><br>• <strong>Top Funds recommendations</strong><br>• Expert guidance<br><br>How can I assist you today?',
        'hi': '<strong>InvestOnline में आपका स्वागत है! 👋</strong><br><br>मैं आपका निवेश सहायक हूं। मैं आपकी मदद कर सकता हूं:<br>• म्यूचुअल फंड निवेश<br>• SIP और कैलकुलेटर<br>• खाता खोलना और KYC<br>• पोर्टफोलियो ट्रैकिंग<br>• <strong>एसेट एलोकेशन</strong><br>• <strong>टॉप फंड सिफारिशें</strong><br>• विशेषज्ञ मार्गदर्शन<br><br>आज मैं आपकी कैसे मदद कर सकता हूं?',
        'mr': '<strong>InvestOnline मध्ये आपले स्वागत आहे! 👋</strong><br><br>मी तुमचा गुंतवणूक सहाय्यक आहे। मी तुम्हाला मदत करू शकतो:<br>• म्युच्युअल फंड गुंतवणूक<br>• SIP आणि कॅल्क्युलेटर<br>• खाते उघडणे आणि KYC<br>• पोर्टफोलिओ ट्रॅकिंग<br>• <strong>मालमत्ता वाटप</strong><br>• <strong>टॉप फंड शिफारसी</strong><br>• तज्ञ मार्गदर्शन<br><br>आज मी तुम्हाला कशी मदत करू शकतो?',
        'gu': '<strong>InvestOnline માં તમારું સ્વાગત છે! 👋</strong><br><br>હું તમારો રોકાણ સહાયક છું। હું તમને મદદ કરી શકું છું:<br>• મ્યુચ્યુઅલ ફંડ રોકાણો<br>• SIP અને કેલ્ક્યુલેટર<br>• ખાતું ખોલવું અને KYC<br>• પોર્ટફોલિયો ટ્રેકિંગ<br>• <strong>સંપત્તિ ફાળવણી</strong><br>• <strong>ટોપ ફંડ ભલામણો</strong><br>• નિષ્ણાત માર્ગદર્શન<br><br>આજે હું તમને કેવી રીતે મદદ કરી શકું?',
        'ta': '<strong>InvestOnline இல் உங்களை வரவேற்கிறோம்! 👋</strong><br><br>நான் உங்கள் முதலீட்டு உதவியாளர். நான் உங்களுக்கு உதவ முடியும்:<br>• மியூச்சுவல் ஃபண்ட் முதலீடுகள்<br>• SIP மற்றும் கால்குலேட்டர்கள்<br>• கணக்கு திறப்பு மற்றும் KYC<br>• போர்ட்ஃபோலியோ கண்காணிப்பு<br>• <strong>சொத்து ஒதுக்கீடு</strong><br>• <strong>சிறந்த நிதி பரிந்துரைகள்</strong><br>• நிபுணர் வழிகாட்டுதல்<br><br>இன்று நான் உங்களுக்கு எவ்வாறு உதவ முடியும்?'
      };
      
      // Add welcome message
      var welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'message bot';
      welcomeDiv.innerHTML = welcomeMessages[lang] || welcomeMessages['en'];
      chatMessages.appendChild(welcomeDiv);
      
      // FIXED v7: Add translated quick reply buttons with new features
      var quickReplies = {
        'en': [
          '🎯 How to register?',
          '📝 What is KYC?',
          '💰 How to start SIP?',
          '📊 SIP Calculator',
          '💼 Asset Allocation',
          '🏆 Top Mutual Funds'
        ],
        'hi': [
          '🎯 रजिस्टर कैसे करें?',
          '📝 KYC क्या है?',
          '💰 SIP कैसे शुरू करें?',
          '📊 SIP कैलकुलेटर',
          '💼 एसेट एलोकेशन',
          '🏆 टॉप म्यूचुअल फंड'
        ],
        'mr': [
          '🎯 नोंदणी कशी करावी?',
          '📝 KYC म्हणजे काय?',
          '💰 SIP कसे सुरू करावे?',
          '📊 SIP कॅल्क्युलेटर',
          '💼 मालमत्ता वाटप',
          '🏆 टॉप म्युच्युअल फंड'
        ],
        'gu': [
          '🎯 નોંધણી કેવી રીતે કરવી?',
          '📝 KYC શું છે?',
          '💰 SIP કેવી રીતે શરૂ કરવું?',
          '📊 SIP કેલ્ક્યુલેટર',
          '💼 સંપત્તિ ફાળવણી',
          '🏆 ટોપ મ્યુચ્યુઅલ ફંડ'
        ],
        'ta': [
          '🎯 பதிவு எப்படி செய்வது?',
          '📝 KYC என்றால் என்ன?',
          '💰 SIP எப்படி தொடங்குவது?',
          '📊 SIP கால்குலேட்டர்',
          '💼 சொத்து ஒதுக்கீடு',
          '🏆 சிறந்த மியூச்சுவல் ஃபண்டுகள்'
        ]
      };
      
      setTimeout(function() {
        addQuickReplies(quickReplies[lang] || quickReplies['en']);
      }, 500);
      
      console.log('✅ Welcome message v7 shown in:', lang);
    }

    function initSession() {
      var savedSessionId = getCookie('io_session_id');
      var savedToken = getCookie('io_session_token');

      if (savedSessionId && savedToken) {
        sessionId = savedSessionId;
        sessionToken = savedToken;
        console.log('✅ Session restored');
        showWelcomeMessage(currentLanguage);
        return;
      }

      console.log('📡 Creating session...');
      fetch(API_URL + '/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      .then(function(res) {
        if (!res.ok) throw new Error('Session failed');
        return res.json();
      })
      .then(function(data) {
        sessionId = data.session_id;
        sessionToken = data.token;
        
        setCookie('io_session_id', sessionId, 7);
        setCookie('io_session_token', sessionToken, 7);
        
        console.log('✅ Session created');
        showWelcomeMessage(currentLanguage);
      })
      .catch(function(err) {
        console.error('❌ Session error:', err);
        addMessage('Connection error. Please refresh.', false);
      });
    }

    function sendMessage() {
      var msg = chatInput.value.trim();
      if (!msg) return;

      if (!sessionId) {
        addMessage('Connecting...', false);
        initSession();
        setTimeout(function() {
          if (sessionId && msg) {
            chatInput.value = msg;
            sendMessage();
          }
        }, 1500);
        return;
      }

      var qr = document.getElementById('quick-replies');
      if (qr) qr.remove();

      chatInput.disabled = true;
      sendButton.disabled = true;
      
      addMessage(msg, true);
      chatInput.value = '';
      showTyping();

      fetch(API_URL + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          token: sessionToken,
          message: msg,
          page: window.location.href,
          lang: currentLanguage
        })
      })
      .then(function(res) {
        if (!res.ok) throw new Error('Chat failed');
        return res.json();
      })
      .then(function(data) {
        hideTyping();

        if (data.questionLimitReached) {
          addMessage(data.reply, false);
          showLeadForm();
          return;
        }

        if (data.reply) {
          addMessage(data.reply, false);
          
          if (data.suggestions && data.suggestions.length > 0) {
            addQuickReplies(data.suggestions);
          }
        } else {
          addMessage('Sorry, please try again.', false);
        }
      })
      .catch(function(err) {
        console.error('❌ Chat error:', err);
        hideTyping();
        addMessage('Error. Please try again.', false);
      })
      .finally(function() {
        chatInput.disabled = false;
        sendButton.disabled = false;
        chatInput.focus();
      });
    }

    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') sendMessage();
    });
    voiceButton.addEventListener('click', toggleVoiceInput);
    
    // ✅ CRITICAL FIX v7: Language change clears chat and shows welcome
    languageSelector.addEventListener('change', function() {
      var newLang = this.value;
      console.log('🌐 Language changed from', currentLanguage, 'to', newLang);
      currentLanguage = newLang;
      
      // Clear chat history completely
      chatMessages.innerHTML = '';
      
      // Remove quick replies
      var qr = document.getElementById('quick-replies');
      if (qr) qr.remove();
      
      // Show welcome message in new language
      showWelcomeMessage(newLang);
      
      console.log('✅ Chat cleared and welcome shown in:', newLang);
    });

    window.submitLead = submitLead;

    // Initialize on load
    initVoiceInput();
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
  const expired = [];

  SESSION_STORE.forEach((session, sessionId) => {
    if (now > session.expiresAt) {
      expired.push(sessionId);
    }
  });

  expired.forEach((sessionId) => {
    const session = SESSION_STORE.get(sessionId);
    if (session) CREATED_TOKENS.delete(session.token);
    SESSION_STORE.delete(sessionId);
  });

  if (expired.length > 0) {
    console.log(`🧹 Cleaned ${expired.length} expired sessions`);
  }
}, 60 * 60 * 1000);

// ====================================
// Start Server
// ====================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ InvestOnline Buddy v7 running on ${PORT}`);
  console.log(`📊 Session TTL: ${SESSION_TTL / (60 * 60 * 1000)} hours`);
  console.log(`🔒 CORS origins: ${ALLOWED_ORIGIN.join(", ")}`);
  console.log(`🆕 v7 fixes: Language change clears chat, Asset Allocation, Top Funds`);
});
