export type ParsedSseEvent = {
  event?: string;
  data: string;
};

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ParsedSseEvent, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: string | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = raw.split('\n');
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data += line.slice(5).trim();
        }
      }
      if (data) {
        yield { event: currentEvent, data };
      }
      currentEvent = undefined;
      idx = buffer.indexOf('\n\n');
    }
  }
}
