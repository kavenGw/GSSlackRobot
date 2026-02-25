import { GoogleGenerativeAI, type Content } from '@google/generative-ai';
import { getConfig } from '../config/index.js';
import { log } from '../utils/logger.js';

const chatHistories = new Map<string, Content[]>();

export async function askGemini(prompt: string, threadTs: string): Promise<string> {
  const cfg = getConfig().gemini!;
  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const model = genAI.getGenerativeModel({ model: cfg.model });

  const history = chatHistories.get(threadTs) ?? [];
  const chat = model.startChat({ history });

  const result = await chat.sendMessage(prompt);
  const text = result.response.text();

  chatHistories.set(threadTs, [
    ...history,
    { role: 'user', parts: [{ text: prompt }] },
    { role: 'model', parts: [{ text }] },
  ]);

  log.info(`Gemini [${cfg.model}] replied ${text.length} chars`);
  return text;
}
