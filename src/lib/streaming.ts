export type SseSend = (event: string, data: unknown) => void;

export function sseResponse(
  handler: (send: SseSend, signal: AbortSignal) => Promise<void>,
  requestSignal?: AbortSignal
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SseSend = (event, data) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      const signal = requestSignal ?? new AbortController().signal;
      try {
        await handler(send, signal);
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Stream error' });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
