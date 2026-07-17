/**
 * SSE encoding for `stream: true`.
 *
 * The governed turn always runs to completion first (`agent.stream()` is the documented degraded
 * mode — no reply finalization — so the server never uses it). The stream shape is:
 *   role delta (immediately, so the socket is live) → `: keepalive` comments while the turn runs →
 *   ONE content delta with the full governed text → finish chunk → [DONE].
 * SSE comment lines are ignored by every OpenAI SDK parser, and a single big content delta is a
 * fully valid stream.
 */
import type { CompletionUsage } from './openai.js';
import { buildChunk } from './openai.js';
import type { LoopRunEnvelopeMeta } from './types.js';

const encoder = new TextEncoder();

export function sseData(payload: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export interface StreamedTurn {
  text: string;
  usage: CompletionUsage;
  looprun: LoopRunEnvelopeMeta;
}

export function streamCompletion(args: {
  id: string;
  model: string;
  turn: Promise<StreamedTurn>;
  keepaliveMs?: number;
  onError: (error: unknown) => Record<string, unknown>;
}): ReadableStream<Uint8Array> {
  const keepaliveMs = args.keepaliveMs ?? 10_000;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sseData(buildChunk({ id: args.id, model: args.model, delta: { role: 'assistant', content: '' } })));
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, keepaliveMs);
      try {
        const turn = await args.turn;
        controller.enqueue(sseData(buildChunk({ id: args.id, model: args.model, delta: { content: turn.text } })));
        controller.enqueue(
          sseData(
            buildChunk({
              id: args.id,
              model: args.model,
              delta: {},
              finishReason: 'stop',
              usage: turn.usage,
              looprun: turn.looprun,
            }),
          ),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        // Mid-stream failure: emit an OpenAI-style error event then terminate the stream.
        controller.enqueue(sseData(args.onError(error)));
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });
}
