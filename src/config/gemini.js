const { GoogleGenerativeAI } = require('@google/generative-ai');

const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI = null;

function getGeminiClient() {
  if (!geminiApiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
  }
  return genAI;
}

function getModel() {
  const client = getGeminiClient();
  return client.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

module.exports = { getGeminiClient, getModel };
