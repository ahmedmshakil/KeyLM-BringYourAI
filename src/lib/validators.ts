import { z } from 'zod';

export const keyProviderSchema = z.enum(['openai', 'gemini', 'anthropic']);
export const runtimeProviderSchema = z.enum(['openai', 'gemini', 'anthropic', 'groq']);

export const authEmailSchema = z.string().trim().min(3).max(320).email();
export const authPasswordSchema = z.string().min(8).max(256);
export const passwordlessMethodSchema = z.enum(['magic_link', 'otp']);
export const authCaptchaTokenSchema = z.string().trim().min(1).max(4096);
export const authOtpTokenSchema = z.string().trim().min(6).max(12);
export const profileFullNameSchema = z.string().trim().max(120);

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const keyCreateSchema = z.object({
  key: z.string().trim().min(8).max(4096)
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
  model: z.string().trim().min(1).max(200),
  systemPrompt: z.string().trim().max(8_000).optional(),
  settings: threadSettingsSchema
});

const freeThreadCreateSchema = z.object({
  mode: z.literal('free'),
  systemPrompt: z.string().trim().max(8_000).optional(),
  settings: threadSettingsSchema
});

export const threadCreateSchema = z.discriminatedUnion('mode', [
  byokThreadCreateSchema,
  freeThreadCreateSchema
]);

export const messageCreateSchema = z.object({
  content: z.string().trim().min(1).max(40_000),
  requestId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(true)
});

const demoChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(40_000)
});

export const demoChatSchema = z.object({
  messages: z.array(demoChatMessageSchema).min(1).max(12)
});
