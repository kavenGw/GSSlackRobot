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

export interface DrawResult {
  text?: string;
  imageBuffer?: Buffer;
}

export async function drawGemini(prompt: string): Promise<DrawResult> {
  const cfg = getConfig().gemini!;
  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const model = genAI.getGenerativeModel({
    model: cfg.imageModel,
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } as any,
  });

  const result = await model.generateContent(prompt);
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];

  const draw: DrawResult = {};
  for (const part of parts) {
    if (part.text) {
      draw.text = (draw.text ?? '') + part.text;
    }
    if ((part as any).inlineData) {
      const { data } = (part as any).inlineData;
      draw.imageBuffer = Buffer.from(data, 'base64');
    }
  }

  log.info(`Gemini Draw [${cfg.imageModel}] completed: text=${draw.text?.length ?? 0} chars, image=${draw.imageBuffer ? 'yes' : 'no'}`);
  return draw;
}
