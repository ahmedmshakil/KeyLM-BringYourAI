export type ProviderId = 'openai' | 'gemini' | 'anthropic' | 'groq' | 'xiaomi';
export type KeyProviderId = 'openai' | 'gemini' | 'anthropic';

export type NormalizedModel = {
  id: string;
  displayName: string;
  provider: ProviderId;
  capabilities: {
    streaming: boolean;
    vision: boolean;
    tools: boolean;
    json: boolean;
  };
  contextWindow?: number;
  category?: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatSettings = {
  temperature?: number;
  maxTokens?: number;
};

export type UsageInfo = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type StreamChunk = {
  delta: string;
  usage?: UsageInfo;
};

export type StreamResult = {
  fullText: string;
  usage?: UsageInfo;
};

export type ProviderAdapter = {
  validateKey: (key: string) => Promise<void>;
  listModels: (key: string) => Promise<NormalizedModel[]>;
  chat: (
    key: string,
    model: string,
    messages: ChatMessage[],
    settings: ChatSettings,
    signal?: AbortSignal
  ) => Promise<StreamResult>;
  streamChat: (
    key: string,
    model: string,
    messages: ChatMessage[],
    settings: ChatSettings,
    signal?: AbortSignal
  ) => AsyncGenerator<StreamChunk, StreamResult, void>;
};
