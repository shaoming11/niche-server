import { getModel } from '../config/gemini.js';

async function generatePostSummary(title: string, messages: string[]): Promise<string> {
  const model = getModel();

  const messagesText = messages.join('\n');

  const prompt = `Summarize the following discussion about "${title}":

${messagesText}

Provide a concise 2-3 sentence summary of the main points and overall sentiment.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

export { generatePostSummary };
