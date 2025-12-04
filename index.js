app.get("/widget", (req, res) => {
  res.sendFile(__dirname + "/server/widget.html");
});


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { handleChat } = require('./server/chat_handler');
const { health } = require('./server/health');
const { initSessionStore } = require('./server/session_store');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '64kb' }));
app.use(morgan('tiny'));

const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin }));

initSessionStore(); // sets up in-memory store or redis based on env

app.post('/chat', async (req, res) => {
  try {
    const { session_id, message, page = '/', lang = 'en' } = req.body;
    if (!session_id || !message) return res.status(400).json({ error: 'session_id and message required' });
    const reply = await handleChat({ session_id, message, page, lang });
    res.json(reply);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/health', (req, res) => health(req, res));
app.post('/feedback', (req, res) => {
  // simple feedback capture - extend to store in DB
  console.log('feedback:', req.body);
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`InvestOnline Buddy running on ${PORT}`));
