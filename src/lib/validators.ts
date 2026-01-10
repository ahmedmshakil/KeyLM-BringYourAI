import { z } from 'zod';

export const providerSchema = z.enum(['openai', 'gemini', 'anthropic']);

export const keyCreateSchema = z.object({
  key: z.string().min(8)
});

export const threadCreateSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
  settings: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(8192).optional()
    })
    .optional()
});

export const messageCreateSchema = z.object({
  content: z.string().min(1),
  requestId: z.string().optional(),
  stream: z.boolean().optional().default(true)
});
