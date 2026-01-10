export type ProviderId = 'openai' | 'gemini' | 'anthropic';

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

export type StreamChunk = {
  delta: string;
};

export type StreamResult = {
  fullText: string;
  usage?: Record<string, number>;
};

export type ProviderAdapter = {
  validateKey: (key: string) => Promise<void>;
  listModels: (key: string) => Promise<NormalizedModel[]>;
  streamChat: (
    key: string,
    model: string,
    messages: ChatMessage[],
    settings: ChatSettings,
    signal?: AbortSignal
  ) => AsyncGenerator<StreamChunk, StreamResult, void>;
};
