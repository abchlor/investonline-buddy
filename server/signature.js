const crypto = require('crypto');

// Simple placeholder signature generator
function generateSignature(data, secret = process.env.SIGNATURE_SECRET || 'default_secret') {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(data))
    .digest('hex');
}

// Simple placeholder validator
function verifySignature(data, signature, secret = process.env.SIGNATURE_SECRET || 'default_secret') {
  const expected = generateSignature(data, secret);
  return expected === signature;
}

module.exports = {
  generateSignature,
  verifySignature
};
