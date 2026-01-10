import { ChatMessage, ChatSettings, NormalizedModel, StreamChunk, StreamResult } from '@/lib/providers/types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1';

function splitSystem(messages: ChatMessage[]) {
  const systemParts: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }
  }
  return { system: systemParts.join('\n\n'), contents };
}

export async function validateKey(key: string) {
  const res = await fetch(`${BASE_URL}/models?key=${encodeURIComponent(key)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Gemini validation failed');
  }
}

export async function listModels(key: string): Promise<NormalizedModel[]> {
  const res = await fetch(`${BASE_URL}/models?key=${encodeURIComponent(key)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Gemini models fetch failed');
  }
  const payload = (await res.json()) as { models: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
  return payload.models.map((model) => ({
    id: model.name,
    displayName: model.displayName ?? model.name,
    provider: 'gemini',
    capabilities: {
      streaming: model.supportedGenerationMethods?.includes('streamGenerateContent') ?? true,
      vision: model.name.includes('vision') || model.name.includes('pro-vision'),
      tools: false,
      json: false
    }
  }));
}

export async function* streamChat(
  key: string,
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, StreamResult, void> {
  const { system, contents } = splitSystem(messages);
  const res = await fetch(
    `${BASE_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: {
          temperature: settings.temperature ?? 0.7,
          maxOutputTokens: settings.maxTokens
        }
      }),
      signal
    }
  );

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || 'Gemini stream failed');
  }

  let fullText = '';
  
  // Gemini with alt=sse returns proper SSE format
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Process complete SSE events (separated by double newline)
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    
    for (const part of parts) {
      if (!part.trim()) continue;
      
      // Extract data from SSE format
      const dataMatch = part.match(/^data:\s*(.+)$/m);
      if (!dataMatch) continue;
      
      try {
        const payload = JSON.parse(dataMatch[1]) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const delta = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (delta) {
          fullText += delta;
          yield { delta };
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }
  
  // Process any remaining buffer
  if (buffer.trim()) {
    const dataMatch = buffer.match(/^data:\s*(.+)$/m);
    if (dataMatch) {
      try {
        const payload = JSON.parse(dataMatch[1]) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const delta = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (delta) {
          fullText += delta;
          yield { delta };
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return { fullText };
}
