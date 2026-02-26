import { getModel } from '../config/gemini.js';

async function generatePostSummary(title: string, messages: string[]): Promise<string> {
  const model = getModel();

  const messagesText = messages.join('\n');

  const prompt = `Summarize the following discussion about "${title}":

${messagesText}

Provide a concise 2-3 sentence summary of the main points and overall sentiment.`;

  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timed out after 30s')), 30000)
    ),
  ]);
  const response = result.response;
  return response.text();
}

export { generatePostSummary };
