/**
 * THE RECORDING WRAPPER — the battery's only source of truth for what the model was SENT.
 *
 * Prompt size and trunk stability are claims about BYTES. Re-rendering the prompt beside the run
 * would measure a replica: the replica cannot see the message history the runtime accumulated, it
 * cannot see the redrive and forced-terminal generations at all, and it drifts silently on the next
 * refactor while still producing a number. So the battery wraps the LanguageModel itself and records
 * the `doGenerate`/`doStream` options the runtime actually handed it.
 *
 * The wrapper is a Proxy, not a subclass: the subject model is an AI-SDK provider object whose class
 * the battery does not own, and every property except the two call methods must pass through
 * untouched (`specificationVersion`, `modelId`, `supportedUrls`, …) or the SDK refuses it.
 *
 * It works identically for the fake model and for Gemini, which is what makes the fake-model tests a
 * proof of the real measurement rather than a proof of a second code path.
 */

/** One LLM call's recorded input. `prompt` is the AI-SDK `LanguageModelV3Prompt` (a message array). */
export interface RecordedCall {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prompt: any;
  /** The tool definitions the SDK sent with this call. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[];
  toolNames: string[];
  /** The conversation turn this generation belongs to — seated by {@link attributeCalls}. */
  turn: number;
}

export interface Recorder {
  /** Every generation, in order, across the whole conversation. */
  calls: RecordedCall[];
}

export function createRecorder(): Recorder {
  return { calls: [] };
}

/**
 * Attribute every recorded generation to its conversation turn.
 *
 * The runtime pushes ONE user message per turn and hands the auxiliary generations — the
 * forced-terminal fallback, the bounded redrive, the chain completion — a prompt of
 * `[...history, oneExtraUserMessage]` that it never persists. So:
 *
 * ```
 *   k = (user messages in this prompt) - 1
 *   the last user message ends with turn k's request  ⇒ this is turn k's MAIN generation
 *   it does not                                        ⇒ it is an auxiliary generation of turn k-1
 * ```
 *
 * Exact, and it needs no hook inside the runner: the discriminator is the runtime's own invariant
 * that a turn's tail ends with the user's request while every auxiliary prompt ends with an
 * engine-authored instruction.
 */
export function attributeCalls(rec: Recorder, turnTexts: readonly string[]): void {
  for (const call of rec.calls) {
    const k = countUserMessages(call) - 1;
    const last = lastUserTextOf(call);
    const isMain = k >= 0 && k < turnTexts.length && last.endsWith(turnTexts[k]);
    call.turn = Math.max(0, isMain ? k : k - 1);
  }
}

/** The generations of turn `i`. */
export function callsOfTurn(rec: Recorder, turn: number): RecordedCall[] {
  return rec.calls.filter((c) => c.turn === turn);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function capture(options: any): RecordedCall {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (options?.tools ?? []) as any[];
  return {
    prompt: options?.prompt,
    tools,
    toolNames: tools.map((t) => String(t?.name ?? t?.toolName ?? '')).filter(Boolean),
    turn: 0,
  };
}

/**
 * Wrap `model` so every generation records its input into `rec`, then delegates unchanged.
 * The returned object is the same model to every consumer — the SDK's own dispatch included.
 */
export function recordingModel<T extends object>(model: T, rec: Recorder): T {
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop !== 'doGenerate' && prop !== 'doStream') return Reflect.get(target, prop, receiver);
      const inner = Reflect.get(target, prop, receiver);
      if (typeof inner !== 'function') return inner;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (options: any) => {
        rec.calls.push(capture(options));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (inner as (o: any) => unknown).call(target, options);
      };
    },
  }) as T;
}

/** The SYSTEM text of a recorded generation — the instructions the runtime rendered for it. */
export function systemOf(call: RecordedCall): string {
  return messagesOf(call)
    .filter((m) => m?.role === 'system')
    .map((m) => textOf(m?.content))
    .join('\n');
}

/** The LAST user message's text — the state-in-tail block plus the request. */
export function lastUserTextOf(call: RecordedCall): string {
  const messages = messagesOf(call);
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return textOf(messages[i]?.content);
  }
  return '';
}

export function countUserMessages(call: RecordedCall): number {
  return messagesOf(call).filter((m) => m?.role === 'user').length;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function messagesOf(call: RecordedCall): any[] {
  return Array.isArray(call.prompt) ? call.prompt : [];
}

/** Message content is a string on some providers and a part array on others; both flatten to text. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textOf(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((p) => (typeof p === 'string' ? p : typeof p?.text === 'string' ? p.text : '')).join('');
}
