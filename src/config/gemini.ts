import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiApiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
  }
  return genAI;
}

function getModel(): GenerativeModel {
  const client = getGeminiClient();
  return client.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

export { getGeminiClient, getModel };
