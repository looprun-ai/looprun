/**
 * WHERE THE PROMPT COST ACCUMULATES — the message array of every generation, split by what put each
 * byte there.
 *
 * The reported input tokens of a turn grow across a conversation, and there are exactly two ways they
 * can grow. This module measures both, per call, off the bytes the runtime handed the provider:
 *
 * ```
 *   (a) WITHIN a turn    each step of a turn reloads the turn's OWN prior tool calls and results
 *                        (listEvents → result → cancelEvent → result → respond)
 *   (b) ACROSS turns     a sealed turn carries its user text, its assistant text, its tool calls and
 *                        its tool results into every later turn
 *   static               the system message and the tool schemas — identical on every call
 *   current request      the state-in-tail block plus this turn's request, rebuilt each turn
 * ```
 *
 * THE SEAM IS THE PROVIDER, not a re-render: {@link recordingModel} already wraps the model and keeps
 * the `doGenerate`/`doStream` options, and it now keeps the response's own input-token count too. A
 * replica prompt built beside the run cannot see the message history the runtime accumulated, cannot
 * see the redrive and forced-terminal generations at all, and drifts silently on the next refactor.
 *
 * BOUNDARY. "Current" is everything from the user message that carries THIS turn's request onward —
 * so an engine-authored auxiliary prompt (the forced-terminal push, the redrive correction) counts as
 * current-turn cost, which is what it is. Everything before that message is (b).
 */
import { callsOfTurn, lastUserTextOf, type RecordedCall, type Recorder } from './recording-model.js';
import { CHARS_PER_TOKEN_ESTIMATE } from './prompt-size.js';
import { driveScenario, type ScenarioDeps } from './run-scenario.js';

/** The four buckets, plus the sub-split of (b) that says WHICH carried thing costs what. */
export interface CompositionChars {
  /** The system message — assembledPrompt + terminal protocol. Byte-identical on every call of a run. */
  system: number;
  /** The tool definitions the SDK sent, serialized. */
  toolSchemas: number;
  /** (b) sealed turns' user messages — each one's state block and request. */
  priorUserText: number;
  /** (b) sealed turns' assistant TEXT (the delivered replies the runtime persisted). */
  priorAssistantText: number;
  /** (b) sealed turns' assistant TOOL-CALL parts — name + arguments. */
  priorToolCalls: number;
  /** (b) sealed turns' TOOL RESULT parts. */
  priorToolResults: number;
  /** This turn's user message(s): the rebuilt state block, the request, and any auxiliary prompt. */
  currentUserText: number;
  /** (a) this turn's own assistant tool-call parts, reloaded by every later step of the same turn. */
  currentToolCalls: number;
  /** (a) this turn's own tool results, reloaded by every later step of the same turn. */
  currentToolResults: number;
  /** This turn's assistant text emitted before this step (rare — the terminal is a tool call). */
  currentAssistantText: number;
  total: number;
}

/** The roll-up the question asks for: (a), (b), static, and the current request. */
export interface CompositionSplit {
  staticPrompt: number;
  withinTurn: number;
  acrossTurns: number;
  currentRequest: number;
  total: number;
}

export interface CallComposition {
  turn: number;
  step: number;
  /** How many messages the provider was handed. */
  messages: number;
  /** Part counts, so a chars figure can be read per carried item rather than only in aggregate. */
  counts: {
    priorToolCallParts: number;
    priorToolResultParts: number;
    currentToolCallParts: number;
    currentToolResultParts: number;
  };
  chars: CompositionChars;
  /** `chars` at {@link CHARS_PER_TOKEN_ESTIMATE}, rounded up per bucket. */
  tokensEstimated: CompositionSplit;
  /** What the provider billed for THIS generation, when it reported it. */
  reportedInputTokens: number | null;
  reportedOutputTokens: number | null;
}

const ZERO_CHARS: CompositionChars = {
  system: 0, toolSchemas: 0, priorUserText: 0, priorAssistantText: 0, priorToolCalls: 0,
  priorToolResults: 0, currentUserText: 0, currentToolCalls: 0, currentToolResults: 0,
  currentAssistantText: 0, total: 0,
};

/** Roll the ten buckets into the four the report answers in. */
export function splitOf(c: CompositionChars): CompositionSplit {
  const staticPrompt = c.system + c.toolSchemas;
  const withinTurn = c.currentToolCalls + c.currentToolResults + c.currentAssistantText;
  const acrossTurns = c.priorUserText + c.priorAssistantText + c.priorToolCalls + c.priorToolResults;
  return { staticPrompt, withinTurn, acrossTurns, currentRequest: c.currentUserText, total: c.total };
}

function estimate(s: CompositionSplit): CompositionSplit {
  const t = (n: number) => Math.ceil(n / CHARS_PER_TOKEN_ESTIMATE);
  return {
    staticPrompt: t(s.staticPrompt), withinTurn: t(s.withinTurn), acrossTurns: t(s.acrossTurns),
    currentRequest: t(s.currentRequest), total: t(s.total),
  };
}

// ── The message-array walk ─────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function messagesOf(call: RecordedCall): any[] {
  return Array.isArray(call.prompt) ? call.prompt : [];
}

/** Flatten one message's content to text — a string on some providers, a part array on others. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textOf(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((p) => (typeof p === 'string' ? p : typeof p?.text === 'string' ? p.text : '')).join('');
}

/** Every part of a message, whatever the provider shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function partsOf(m: any): any[] {
  const content = m?.content;
  if (Array.isArray(content)) return content;
  if (Array.isArray(m?.parts)) return m.parts;
  return [];
}

/** The BYTES one part costs the prompt — its serialized form, which is what a provider is handed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function partChars(p: any): number {
  if (typeof p === 'string') return p.length;
  try {
    return JSON.stringify(p ?? null).length;
  } catch {
    return String(p).length;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isToolCallPart(p: any): boolean {
  const t = String(p?.type ?? '');
  return t === 'tool-call' || t === 'tool_call' || t === 'tool-invocation';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isToolResultPart(p: any): boolean {
  const t = String(p?.type ?? '');
  return t === 'tool-result' || t === 'tool_result';
}

/**
 * The index of the user message that opens THIS turn — the one whose text ends with the turn's
 * request. Everything from it onward is "current"; everything before it is a sealed turn's residue.
 *
 * Falls back to the LAST user message when the request text is not known (an auxiliary generation
 * whose tail is an engine-authored prompt still opens no new turn, so the fallback searches for the
 * turn text first and only then gives up) — a fallback that can only ever UNDER-count (b), never
 * over-count it.
 */
function currentTurnStart(messages: readonly unknown[], turnText: string | undefined): number {
  const userIdx: number[] = [];
  messages.forEach((m, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((m as any)?.role === 'user') userIdx.push(i);
  });
  if (!userIdx.length) return messages.length;
  if (turnText) {
    for (const i of userIdx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (textOf((messages[i] as any)?.content).endsWith(turnText)) return i;
    }
  }
  return userIdx[userIdx.length - 1]!;
}

/** Measure ONE recorded generation's message array. `turnText` is this turn's request, known exactly. */
export function composeCall(call: RecordedCall, turnText: string | undefined): CallComposition {
  const messages = messagesOf(call);
  const start = currentTurnStart(messages, turnText);
  const chars: CompositionChars = { ...ZERO_CHARS };
  const counts = { priorToolCallParts: 0, priorToolResultParts: 0, currentToolCallParts: 0, currentToolResultParts: 0 };

  messages.forEach((m, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = String((m as any)?.role ?? '');
    const current = i >= start;
    if (role === 'system') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chars.system += textOf((m as any).content).length;
      return;
    }
    if (role === 'user') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = textOf((m as any).content).length;
      if (current) chars.currentUserText += n;
      else chars.priorUserText += n;
      return;
    }
    if (role === 'tool') {
      for (const p of partsOf(m)) {
        const n = partChars(p);
        if (current) {
          chars.currentToolResults += n;
          counts.currentToolResultParts += 1;
        } else {
          chars.priorToolResults += n;
          counts.priorToolResultParts += 1;
        }
      }
      return;
    }
    // assistant (and anything else a provider names): split tool-calls from text.
    for (const p of partsOf(m)) {
      const n = partChars(p);
      if (isToolCallPart(p)) {
        if (current) {
          chars.currentToolCalls += n;
          counts.currentToolCallParts += 1;
        } else {
          chars.priorToolCalls += n;
          counts.priorToolCallParts += 1;
        }
        continue;
      }
      if (isToolResultPart(p)) {
        // Some providers seat tool results on the assistant message rather than a `tool` role.
        if (current) {
          chars.currentToolResults += n;
          counts.currentToolResultParts += 1;
        } else {
          chars.priorToolResults += n;
          counts.priorToolResultParts += 1;
        }
        continue;
      }
      if (current) chars.currentAssistantText += n;
      else chars.priorAssistantText += n;
    }
  });

  chars.toolSchemas = JSON.stringify(call.tools ?? []).length;
  chars.total =
    chars.system + chars.toolSchemas + chars.priorUserText + chars.priorAssistantText + chars.priorToolCalls +
    chars.priorToolResults + chars.currentUserText + chars.currentToolCalls + chars.currentToolResults +
    chars.currentAssistantText;

  const split = splitOf(chars);
  return {
    turn: call.turn,
    step: call.step,
    messages: messages.length,
    counts,
    chars,
    tokensEstimated: estimate(split),
    reportedInputTokens: call.reportedInputTokens,
    reportedOutputTokens: call.reportedOutputTokens,
  };
}

/** Every generation of a run, composed, in turn/step order. */
export function composeRun(rec: Recorder, turnTexts: readonly string[]): CallComposition[] {
  const out: CallComposition[] = [];
  for (let turn = 0; turn < turnTexts.length; turn += 1) {
    for (const call of callsOfTurn(rec, turn)) out.push(composeCall(call, turnTexts[turn]));
  }
  return out;
}

// ── Are carried tool RESULTS redundant with the rebuilt state block? ───────────────────────────────

export interface RedundancyCheck {
  /** Characters of tool RESULT carried forward from sealed turns into this call. */
  carriedResultChars: number;
  /** Characters of the state block the contract rebuilds on this call's user message. */
  stateBlockChars: number;
  /** Distinct scalar leaf values in the carried results — the FACTS they assert. */
  carriedFacts: number;
  /** How many of those facts the rebuilt state block also states. */
  factsAlsoInStateBlock: number;
  /** `factsAlsoInStateBlock / carriedFacts`, or 0 when nothing is carried. */
  coverage: number;
  /** The facts the state block does NOT restate — what would be LOST by dropping carried results. */
  factsOnlyInCarriedResults: string[];
}

/** Every scalar leaf of a structure, stringified — the atomic facts it asserts. */
function scalarLeaves(v: unknown, out: Set<string>): Set<string> {
  if (v === null || v === undefined) return out;
  if (Array.isArray(v)) {
    for (const x of v) scalarLeaves(x, out);
    return out;
  }
  if (typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) scalarLeaves(x, out);
    return out;
  }
  const s = String(v).trim();
  // A bare boolean or a one-character token is not a FACT about the domain — it is envelope noise that
  // would appear in any prose by accident and inflate the coverage figure in the unsafe direction.
  if (s.length > 1 && s !== 'true' && s !== 'false') out.add(s);
  return out;
}

/**
 * Do the tool RESULTS a sealed turn carries forward say anything the freshly rebuilt state block does
 * not? The comparison is over the FACTS (the results' scalar leaves), tested for literal presence in
 * the state block's own text — mechanical, no judgement, and it errs toward finding redundancy
 * (a substring test can only over-count coverage), so a LOW coverage figure is a strong statement that
 * the carried results are NOT redundant.
 *
 * `stateBlock` is the state text of the call being examined: the current user message minus the
 * request, which is exactly what the contract's `stateBlock` produced for this turn.
 */
export function redundancyOf(call: RecordedCall, turnText: string | undefined, stateBlock: string): RedundancyCheck {
  const messages = messagesOf(call);
  const start = currentTurnStart(messages, turnText);
  const facts = new Set<string>();
  let carriedResultChars = 0;
  for (let i = 0; i < start; i += 1) {
    const m = messages[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = String((m as any)?.role ?? '');
    if (role !== 'tool' && role !== 'assistant') continue;
    for (const p of partsOf(m)) {
      if (!isToolResultPart(p)) continue;
      carriedResultChars += partChars(p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scalarLeaves((p as any)?.output ?? (p as any)?.result ?? p, facts);
    }
  }
  const all = [...facts];
  const missing = all.filter((f) => !stateBlock.includes(f));
  return {
    carriedResultChars,
    stateBlockChars: stateBlock.length,
    carriedFacts: all.length,
    factsAlsoInStateBlock: all.length - missing.length,
    coverage: all.length ? (all.length - missing.length) / all.length : 0,
    factsOnlyInCarriedResults: missing,
  };
}

// ── The run-level fold ─────────────────────────────────────────────────────────────────────────────

export interface AccumulationTotals {
  calls: number;
  turns: number;
  /** The composition of the LAST generation of the LAST turn — the late-turn prompt the question is about. */
  lateTurn: CompositionSplit;
  lateTurnPercent: { staticPrompt: number; withinTurn: number; acrossTurns: number; currentRequest: number };
  /** The first generation of the first turn — the floor a prompt starts from. */
  firstTurn: CompositionSplit;
  /** Reported input tokens, first call → last call. */
  reportedFirst: number | null;
  reportedLast: number | null;
}

function percent(part: number, total: number): number {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

/**
 * THE ACCUMULATION CONVERSATION — five turns, several of them making two or three tool calls, so both
 * axes are exercised at once: a turn with three steps grows (a) inside itself, and every later turn
 * inherits all of it as (b).
 *
 * Turns are written against the battery subject's calendar world and its fixed clock, so the tool
 * calls they provoke are the same on every run.
 */
export const ACCUMULATION_TURNS: readonly string[] = [
  'O que eu tenho na agenda esta semana?',
  'Marca "Fisioterapia" na quarta, 2026-03-04, das 08:00 às 09:00, e "Academia" na quinta, 2026-03-05, das 07:00 às 08:00.',
  'Cancela o almoço com a Marina.',
  'pode',
  'Me lista de novo tudo o que ficou e marca "Leitura" na sexta, 2026-03-06, das 20:00 às 21:00.',
];

export interface AccumulationResult {
  turns: string[];
  calls: CallComposition[];
  totals: AccumulationTotals;
  /** The redundancy check on the LAST generation — the one carrying the most sealed-turn results. */
  redundancy: RedundancyCheck;
  /** The redundancy check on every generation, so the trend is visible rather than one data point. */
  redundancyPerCall: RedundancyCheck[];
  error?: string;
}

/** The state-in-tail block of a call: the last user message minus this turn's request. */
function stateBlockOf(call: RecordedCall, turnText: string | undefined): string {
  const tail = lastUserTextOf(call);
  if (turnText && tail.endsWith(turnText)) return tail.slice(0, tail.length - turnText.length);
  return tail;
}

/** Run {@link ACCUMULATION_TURNS} through the real loop and fold every generation. */
export async function runAccumulation(deps: ScenarioDeps, turns: readonly string[] = ACCUMULATION_TURNS): Promise<AccumulationResult> {
  const { recorder, result } = await driveScenario(turns, 'default', deps);
  const ordered: Array<{ call: RecordedCall; turnText: string | undefined }> = [];
  for (let turn = 0; turn < turns.length; turn += 1) {
    for (const call of callsOfTurn(recorder, turn)) ordered.push({ call, turnText: turns[turn] });
  }
  const calls = ordered.map(({ call, turnText }) => composeCall(call, turnText));
  const redundancyPerCall = ordered.map(({ call, turnText }) => redundancyOf(call, turnText, stateBlockOf(call, turnText)));
  return {
    turns: [...turns],
    calls,
    totals: accumulationTotals(calls),
    redundancy: redundancyPerCall[redundancyPerCall.length - 1] ?? {
      carriedResultChars: 0, stateBlockChars: 0, carriedFacts: 0, factsAlsoInStateBlock: 0, coverage: 0,
      factsOnlyInCarriedResults: [],
    },
    redundancyPerCall,
    ...(result.errorMsg ? { error: result.errorMsg } : {}),
  };
}

export function accumulationTotals(comps: readonly CallComposition[]): AccumulationTotals {
  const first = comps[0];
  const last = comps[comps.length - 1];
  const lateChars = last ? splitOf(last.chars) : { staticPrompt: 0, withinTurn: 0, acrossTurns: 0, currentRequest: 0, total: 0 };
  return {
    calls: comps.length,
    turns: new Set(comps.map((c) => c.turn)).size,
    lateTurn: lateChars,
    lateTurnPercent: {
      staticPrompt: percent(lateChars.staticPrompt, lateChars.total),
      withinTurn: percent(lateChars.withinTurn, lateChars.total),
      acrossTurns: percent(lateChars.acrossTurns, lateChars.total),
      currentRequest: percent(lateChars.currentRequest, lateChars.total),
    },
    firstTurn: first ? splitOf(first.chars) : lateChars,
    reportedFirst: first?.reportedInputTokens ?? null,
    reportedLast: last?.reportedInputTokens ?? null,
  };
}
