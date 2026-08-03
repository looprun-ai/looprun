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
  /** This generation's position WITHIN its turn, in call order — seated by {@link attributeCalls}. */
  step: number;
  /**
   * The provider's own input-token count for THIS generation, when it reported one.
   *
   * The turn-level figure on `TurnRecord.tokens` is the SUM over a turn's generations, so it cannot
   * answer where a prompt grows: a turn that made three calls reports one number covering three
   * different message arrays. This is the per-call figure, read off the very response the wrapped model
   * returned, so a step-by-step accumulation curve is measured rather than apportioned.
   */
  reportedInputTokens: number | null;
  reportedOutputTokens: number | null;
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
  const nextStep = new Map<number, number>();
  for (const call of rec.calls) {
    const k = countUserMessages(call) - 1;
    const last = lastUserTextOf(call);
    const isMain = k >= 0 && k < turnTexts.length && last.endsWith(turnTexts[k]);
    call.turn = Math.max(0, isMain ? k : k - 1);
    // The step is the generation's ORDER within its turn — the recorder appends in call order, so a
    // running counter per turn is exact and needs no hook inside the runner.
    const step = nextStep.get(call.turn) ?? 0;
    call.step = step;
    nextStep.set(call.turn, step + 1);
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
    step: 0,
    reportedInputTokens: null,
    reportedOutputTokens: null,
  };
}

/** Seat a provider `usage` object onto the call it belongs to. Absent fields stay `null`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function seatUsage(call: RecordedCall, usage: any): void {
  const inp = usage?.inputTokens;
  const out = usage?.outputTokens;
  if (typeof inp === 'number') call.reportedInputTokens = inp;
  if (typeof out === 'number') call.reportedOutputTokens = out;
}

/**
 * Tee a `doStream` result so the `finish` part's usage lands on the recorded call.
 *
 * The streaming path is not optional to cover: the backend picks between `doGenerate` and `doStream`
 * on its own, and a per-call token figure that silently reads `null` on whichever path the runtime
 * happens to take is a measurement that reports its own blind spot as data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function teeUsage(result: any, call: RecordedCall): any {
  const stream = result?.stream;
  if (!stream || typeof stream.pipeThrough !== 'function') return result;
  const spy = new TransformStream({
    transform(part, controller) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = part as any;
      if (p?.type === 'finish' && p.usage) seatUsage(call, p.usage);
      controller.enqueue(part);
    },
  });
  return { ...result, stream: stream.pipeThrough(spy) };
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
      const streaming = prop === 'doStream';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return async (options: any) => {
        const call = capture(options);
        rec.calls.push(call);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (inner as (o: any) => unknown).call(target, options);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (streaming) return teeUsage(result as any, call);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        seatUsage(call, (result as any)?.usage);
        return result;
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
