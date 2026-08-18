/** Chat-completion envelopes + SSE encoding of a COMPLETED turn — no token
 *  streaming. Usage is reported as estimated, never presented as provider counts.
 *  The full typed TurnRecord rides the envelope meta. */
import { randomUUID } from 'node:crypto';
import type { TurnRecord } from '@looprun-ai/next-core';

export interface ChatCompletion {
  readonly id: string;
  readonly object: 'chat.completion';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly [{
    readonly index: 0;
    readonly message: { readonly role: 'assistant'; readonly content: string };
    readonly finish_reason: 'stop';
  }];
  readonly usage: { readonly prompt_tokens: number; readonly completion_tokens: number;
                    readonly total_tokens: number; readonly estimated: true };
  readonly meta: { readonly loopRun: TurnRecord };
}

const CHARS_PER_TOKEN = 4;

function usageOf(record: TurnRecord): ChatCompletion['usage'] {
  const promptTokens = Math.ceil(record.userText.length / CHARS_PER_TOKEN);
  const completionTokens = Math.ceil(record.text.length / CHARS_PER_TOKEN);
  return { prompt_tokens: promptTokens, completion_tokens: completionTokens,
           total_tokens: promptTokens + completionTokens, estimated: true };
}

export function toEnvelope(record: TurnRecord, model: string): ChatCompletion {
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: record.text },
                finish_reason: 'stop' }],
    usage: usageOf(record),
    meta: { loopRun: record }
  };
}

/** The completed turn as SSE frames: role chunk, one content chunk, the closing
 *  chunk with usage, then the DONE sentinel. */
export function toSse(record: TurnRecord, model: string): readonly string[] {
  const id = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (delta: Record<string, unknown>, finish: string | null, extra: Record<string, unknown> = {}) =>
    `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model,
      choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;
  return [
    chunk({ role: 'assistant' }, null),
    chunk({ content: record.text }, null),
    chunk({}, 'stop', { usage: usageOf(record), meta: { loopRun: record } }),
    'data: [DONE]\n\n'
  ];
}
