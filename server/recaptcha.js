const axios = require('axios');

// Main function to verify Google Recaptcha tokens
async function verifyRecaptcha(token) {
  // If Recaptcha isn't configured yet, allow the request
  if (!process.env.RECAPTCHA_SECRET_KEY) {
    return { success: true, score: 1 };
  }

  if (!token) {
    return { success: false, score: 0 };
  }

  try {
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: token
        }
      }
    );

    return response.data;
  } catch (err) {
    return { success: false, score: 0, error: err.message };
  }
}

module.exports = { verifyRecaptcha };
