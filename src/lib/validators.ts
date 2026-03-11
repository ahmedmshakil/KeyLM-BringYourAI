import { z } from 'zod';

export const keyProviderSchema = z.enum(['openai', 'gemini', 'anthropic']);
export const runtimeProviderSchema = z.enum(['openai', 'gemini', 'anthropic', 'groq']);

export const keyCreateSchema = z.object({
  key: z.string().min(8)
});

const threadSettingsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(8192).optional()
  })
  .optional();

const byokThreadCreateSchema = z.object({
  mode: z.literal('byok'),
  provider: keyProviderSchema,
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
  settings: threadSettingsSchema
});

const freeThreadCreateSchema = z.object({
  mode: z.literal('free'),
  systemPrompt: z.string().optional(),
  settings: threadSettingsSchema
});

export const threadCreateSchema = z.discriminatedUnion('mode', [
  byokThreadCreateSchema,
  freeThreadCreateSchema
]);

export const messageCreateSchema = z.object({
  content: z.string().min(1),
  requestId: z.string().optional(),
  stream: z.boolean().optional().default(true)
});
