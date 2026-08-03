/**
 * @looprun-ai/core runtime — the TERMINAL protocol (framework-free).
 *
 * The certified turn shape: the model speaks to the user ONLY through the runtime-owned terminal
 * tool `respond` — combined with `toolChoice:'required'` this forces action before speech and makes
 * the user-facing text a verifiable tool argument instead of free text.
 *
 * `respond` is STRUCTURED (SCG, 2026-08-02; MI, 2026-08-03): the non-operational prose rides `message`,
 * and `did` (≥1 `Intention`, enforced by the schema) declares what the turn IS — action intentions the
 * cross-check guards ground against the world ledger, speech intentions (`inform`/`greet`/`refuse`/`ask`)
 * that classify the message's speech act. Asking is an `ask` intention, not a flag; the two-terminal
 * protocol (`replyToUser`/`askUser`) is RETIRED.
 */
import type { ToolDef } from './types.js';
import { terminalPayloadRejection } from './claims.js';

const RESPOND = 'respond';
const TERMINAL_TOOLS = [RESPOND] as const;
const TERMINAL_SET: ReadonlySet<string> = new Set(TERMINAL_TOOLS);

export function isTerminal(name: string): boolean {
  return TERMINAL_SET.has(name);
}

/**
 * ── The closing step must be TERMINAL-ONLY ────────────────────────────────────────────────────────
 *
 * A model can emit a domain read and a terminal in ONE parallel batch. If the runtime accepts that
 * terminal as the end of the turn, the delivered text was composed BEFORE the sibling call's result
 * existed — it can assert a reading that had not come back. That is structural fabrication, not a
 * phrasing slip a reply guard can catch: at the moment the model wrote the sentence, the fact did
 * not exist for it.
 *
 * POLICY (chosen over vetoing the terminal at hook time, or reordering the batch): when the step
 * carrying the terminal ALSO carried a domain call, the terminal is INVALIDATED — the captured reply
 * is cleared, so the forced-terminal fallback re-closes the turn on a message history that now
 * contains the tool RESULTS. The repair is one extra terminal-only generate on an already-complete
 * context: no side effect re-runs, no cooperation from the model is required, and it is
 * order-independent, because "same step" is exactly "the result was not observable when the text was
 * written". Cost of the conservative side: a turn whose reply happened not to depend on the sibling
 * call also re-closes.
 *
 * Returns the domain tools that shared the closing step; `[]` means healthy, or no terminal at all.
 *
 * SHAPE: a step's `toolCalls` entries are stop-callback shaped (`{toolName}`) mid-generation but
 * CHUNK shaped (`{type,payload:{toolName}}`) on the finished result. Reading only one spelling makes
 * this gate a silent no-op, so both are read.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prematureTerminalTools(steps: any): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (steps ?? []) as any[];
  for (let k = list.length - 1; k >= 0; k--) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = ((list[k]?.toolCalls ?? []) as any[]).map(toolCallName);
    if (!names.some((n) => isTerminal(n))) continue;
    return names.filter((n) => n && !isTerminal(n));
  }
  return [];
}

/**
 * ── The PREMATURE terminals themselves (name + args) ──────────────────────────────────────────────
 *
 * {@link prematureTerminalTools} answers "did a terminal ride along with DOMAIN work?" and names the
 * domain tools so the backend can invalidate the delivery. But invalidation alone leaves the premature
 * terminal's OBSERVATION in the ledger — and a premature `respond` whose `did` carried an `ask`
 * intention then reads, next turn, as "the user was asked", licensing the consent guards off a question
 * the user never saw (red-team M8). This returns the terminal CALLS of every step that also carried a
 * domain call, so the caller can prune them from `ledger.observed` — symmetric with
 * {@link supersededTerminalCalls}, and reading both toolCall shapes the same way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prematureTerminalCalls(steps: any): Array<{ name: string; args: Record<string, unknown> }> {
  const out: Array<{ name: string; args: Record<string, unknown> }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const step of ((steps ?? []) as any[])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (step?.toolCalls ?? []) as any[];
    const hasDomain = calls.some((tc) => { const n = toolCallName(tc); return n && !isTerminal(n); });
    if (!hasDomain) continue;
    for (const tc of calls) {
      if (isTerminal(toolCallName(tc))) out.push({ name: toolCallName(tc), args: toolCallArgs(tc) });
    }
  }
  return out;
}

/**
 * ── Terminals emitted in a step but never DELIVERED ───────────────────────────────────────────────
 *
 * {@link prematureTerminalTools} answers "did a terminal ride along with DOMAIN work?" and returns
 * `[]` for a step carrying only terminals — correct for its own question, and a hole for a different
 * one. The runtime delivers the LAST non-empty `message`, while the guard hooks record EVERY terminal
 * as an ok observation. So a step of two `respond` calls — one asking a destructive question
 * (an `ask` intention in its `did`), one signing off — delivers only the sign-off and still leaves the asking `respond`
 * in the ledger. Next turn, a prior-ask confirmation arm reads that entry as "the user was asked",
 * and a destructive action unlocks off a question the user NEVER SAW. Consent recorded from an
 * undelivered message is the same class of defect as a reply grounding itself.
 *
 * Returns the terminals that lost the delivery contest — everything except the last one the runtime
 * would ACCEPT ({@link terminalPayloadRejection}). The caller prunes them from the ledger AFTER the generation resolves, so
 * within-step visibility (a sibling's preTool checks seeing the ask) is untouched; only the
 * cross-turn consent evidence is corrected.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supersededTerminalCalls(steps: any): Array<{ name: string; args: Record<string, unknown> }> {
  const out: Array<{ name: string; args: Record<string, unknown> }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const step of ((steps ?? []) as any[])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = ((step?.toolCalls ?? []) as any[]).filter((tc) => isTerminal(toolCallName(tc)));
    if (calls.length < 2) continue;
    // THE DELIVERED ONE IS THE LAST THE RUNTIME WOULD ACCEPT (red-team r2/C5). This used to be "the last
    // terminal with a non-empty message", a notion that drifts from what the runtime actually delivers:
    // for a step of [respond{message:'Done.', did:[…]}, respond{message:'Are you sure?', did:[]}] the
    // second is REFUSED (`did` violates minItems, so it never executes and never becomes the reply) yet
    // it counted as delivered — and the prune then dropped the observation for the message the user
    // really received. `terminalPayloadRejection` is the ONE acceptance notion, shared with the backend
    // hook that refuses such a call in the first place.
    const delivered = calls.reduce(
      (acc, tc, i) => (terminalPayloadRejection(toolCallArgs(tc)) === null ? i : acc),
      -1,
    );
    calls.forEach((tc, i) => {
      if (i !== delivered) out.push({ name: toolCallName(tc), args: toolCallArgs(tc) });
    });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toolCallName(tc: any): string {
  return String(tc?.toolName ?? tc?.name ?? tc?.payload?.toolName ?? tc?.payload?.name ?? '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toolCallArgs(tc: any): Record<string, unknown> {
  return (tc?.args ?? tc?.input ?? tc?.payload?.args ?? tc?.payload?.input ?? {}) as Record<string, unknown>;
}

/**
 * The RAW args of the LAST terminal (`respond`) call across a generate result's steps, or `null` when the
 * generation produced no terminal. Reads both the stop-callback shape (`{toolName,args}`) and the
 * finished-chunk shape (`{payload:{toolName,input}}`), exactly like {@link supersededTerminalCalls} /
 * {@link prematureTerminalTools}, so a backend never re-implements the dual-shape read. The backend feeds
 * this to {@link import('./claims.js').respondPayload} to recover a redrive / forced-terminal fallback
 * re-generation's STRUCTURED payload (message + did) from the model's tool call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lastTerminalArgs(steps: any): Record<string, unknown> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (steps ?? []) as any[];
  for (let k = list.length - 1; k >= 0; k--) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (list[k]?.toolCalls ?? []) as any[];
    for (let j = calls.length - 1; j >= 0; j--) {
      if (isTerminal(toolCallName(calls[j]))) return toolCallArgs(calls[j]);
    }
  }
  return null;
}

const TERMINAL_PROTOCOL =
  '\n\n## Turn protocol (ABSOLUTE)\n' +
  '- You speak to the user ONLY by calling **respond**. NEVER write a free-text reply — text outside ' +
  'this tool is not delivered.\n' +
  '- Every turn MUST call at least one tool, and MUST END by calling exactly one **respond**.\n' +
  "- `message` carries the COMPLETE user-facing prose in the USER'S language: greeting, explanation " +
  'and answers ONLY. NEVER assert in `message` an operation you performed this turn — operations go ' +
  'in `did`.\n' +
  '- `did` declares AT LEAST ONE intention — every response has one; an empty `did` is rejected. An ' +
  'intention is either an ACTION or a SPEECH act:\n' +
  '- ACTION intentions: one entry for EVERY domain operation you attempted this turn, `op` naming the ' +
  'operation, with its honest `outcome`. A result you only READ is a `did` entry only when the user ' +
  'asked for that lookup (then outcome `success` when found, `not_found` when empty). NEVER claim an ' +
  'operation the tools did not confirm.\n' +
  '- SPEECH intentions (no `outcome`, no `amount`): `inform` — conveying information or answering a ' +
  'question; `greet` — a greeting/acknowledgement with no operation; `refuse` — declining to act; ' +
  '`ask` — posing your ONE clarifying question you will wait on (the `message` carries the question).\n' +
  '- `inform` is for conveying information or answering a question. It MUST NOT be used to assert that ' +
  "you performed an action. If you performed an action, declare it as that action's op — which is " +
  'verified against what actually happened. Reporting a done action as `inform` is dishonest.\n' +
  '- Do the domain tools first; then close the turn with the single respond call.';

const TERMINAL_PROTOCOL_REPLY_ONLY =
  '\n\n## Turn protocol (ABSOLUTE)\n' +
  '- You speak to the user ONLY by calling **respond**. NEVER write a free-text reply and NEVER ask ' +
  'the user a question — never declare an `ask` intention.\n' +
  '- If something is ambiguous, make the MOST REASONABLE assumption and PROCEED — never stop to ask.\n' +
  '- Every turn MUST first DO the requested action with the domain tools, then END by calling ' +
  "**respond**: `message` reports what you did in the USER'S language, and `did` declares AT LEAST ONE " +
  'intention — an ACTION entry for EVERY operation you attempted with its honest `outcome`, or a ' +
  'SPEECH entry (`inform`/`greet`/`refuse`, no outcome) when the turn only speaks. NEVER assert an ' +
  'operation in `message`, and NEVER claim one the tools did not confirm. `inform` MUST NOT be used ' +
  "to assert that you performed an action — a performed action is declared as that action's op.";

export function terminalProtocol(replyOnly: boolean): string {
  return replyOnly ? TERMINAL_PROTOCOL_REPLY_ONLY : TERMINAL_PROTOCOL;
}

/** The forced-terminal fallback prompt (pushes a weak model past the action wall). */
export function forcedTerminalPrompt(replyOnly: boolean): string {
  return replyOnly
    ? 'Close the turn now by calling respond. Do NOT ask a question — never declare an `ask` intention. ' +
        'Put your user-facing message in `message`, and declare at least one intention in `did`: every ' +
        'operation you attempted with its honest outcome, or `inform`/`greet`/`refuse` (no outcome) when ' +
        'the turn only speaks.'
    : 'Close the turn now by calling respond. Put the COMPLETE user-facing message in `message`; declare ' +
        'at least one intention in `did` — every operation you attempted this turn with its honest ' +
        'outcome, or a speech intention (`inform`/`greet`/`refuse`/`ask`, no outcome) when the turn only ' +
        'speaks; declare `ask` only if `message` poses ONE clarifying question you will wait on.';
}

/**
 * The terminal tool's contract — authored by the RUNTIME, never by the host.
 *
 * A terminal is not a domain tool: it is how the turn ends, and the protocol owns what it means. A
 * host-supplied definition can carry business prose in its description, pin the reply to one brand
 * language, or make extra arguments required — each of which the runtime would then have to satisfy
 * or silently ignore. The runtime reads exactly two arguments — `message`, `did` — and
 * anything else costs tokens, invites a wrong value and has no consumer.
 */
const RESPOND_DESCRIPTION =
  'END the turn with your final user-facing message. Every turn ends with exactly one respond, called ' +
  'only AFTER the domain tools you need have returned — never in the same step as a domain tool, ' +
  'because their results are not available to you yet. Put the user-facing prose in `message` and ' +
  'declare AT LEAST ONE intention in `did`: an ACTION entry (op + honest outcome) for every operation ' +
  'you attempted, or a SPEECH entry — inform (conveying information/answering; NEVER to assert a ' +
  'performed action), greet, refuse, or ask (your ONE clarifying question, carried by message).';

const DID_ITEM_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    op: {
      type: 'string',
      minLength: 1,
      description:
        'What this intention IS. An ACTION op is a short label for the operation you attempted ' +
        '(advisory) and REQUIRES an outcome. A SPEECH op is one of: inform (conveying information or ' +
        'answering a question — MUST NOT assert a performed action; a performed action is declared as ' +
        "that action's op), greet (a greeting/acknowledgement with no operation), refuse (declining to " +
        'act), ask (posing your ONE clarifying question — the message carries it). Speech ops carry no ' +
        'outcome and no amount.',
    },
    target: { type: 'string', description: 'The entity label/id the operation acted on, when it has one.' },
    outcome: {
      type: 'string',
      minLength: 1,
      description:
        'REQUIRED for an action op, FORBIDDEN for a speech op. The HONEST outcome: success, failure, ' +
        'not_found, blocked, refused, pending_confirmation, no_op (or a domain outcome your spec ' +
        'declares). Never report success the tools did not confirm.',
    },
    amount: {
      type: 'number',
      description: 'An optional magnitude an ACTION involved (e.g. a value). Forbidden for a speech op.',
    },
  },
  required: ['op'],
  additionalProperties: false,
};

function respondToolDef(): ToolDef {
  return {
    name: RESPOND,
    description: RESPOND_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          minLength: 1,
          description:
            "The COMPLETE user-facing prose in the USER'S language — explanation and answers ONLY; " +
            'NEVER assert an operation you performed here, operations go in did.',
        },
        did: {
          type: 'array',
          items: DID_ITEM_SCHEMA,
          minItems: 1,
          description:
            'AT LEAST ONE intention — every response declares what it is. An ACTION entry for every ' +
            'domain operation you attempted this turn (honest outcome each), and/or a SPEECH entry ' +
            '(inform/greet/refuse/ask) classifying the message. An empty did is rejected.',
        },
      },
      required: ['message', 'did'],
      additionalProperties: false,
    },
  };
}

/** The JSON-schema defs for the terminal tools (a single `respond`). */
export function terminalToolDefs(): ToolDef[] {
  return [respondToolDef()];
}

/**
 * Rewrite a TERMINAL tool def to the runtime's own contract; a domain def is returned UNCHANGED —
 * by identity, so passing a tool list through this is provably a no-op for everything else.
 *
 * This is what makes the protocol independent of how a host happens to declare its terminal: a
 * description written for a different runtime, an extra required argument, or a differently-named
 * field (which this runtime would silently ignore, since the terminal execute and the salvage both
 * key on `args.message` / `args.did`) are all replaced by the contract above.
 */
export function normalizeTerminalToolDef(def: ToolDef): ToolDef {
  return isTerminal(def.name) ? respondToolDef() : def;
}
