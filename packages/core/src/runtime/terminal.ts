/**
 * @looprun-ai/core runtime — the TERMINAL protocol (framework-free).
 *
 * The certified turn shape: the model speaks to the user ONLY through the runtime-owned terminal
 * tool `respond` — combined with `toolChoice:'required'` this forces action before speech and makes
 * the user-facing text a verifiable tool argument instead of free text.
 *
 * `respond` is STRUCTURED: the non-operational prose rides `message`,
 * and `did` (≥1 `Intention`, enforced by the schema) declares what the turn IS — action intentions the
 * cross-check guards ground against the world action history, speech intentions (`inform`/`greet`/`refuse`/`ask`)
 * that classify the message's speech act. Asking is an `ask` intention, not a flag, and not a second
 * terminal tool — there is exactly ONE terminal.
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
 * terminal's OBSERVATION in the action history — and a premature `respond` whose `did` carried an `ask`
 * intention then reads, next turn, as "the user was asked", licensing the consent guards off a question
 * the user never saw. This returns the terminal CALLS of every step that also carried a
 * domain call, so the caller can prune them from `action history.observed` — symmetric with
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
 * in the action history. Next turn, a consent scan reads that entry as "the user was asked",
 * and a destructive action unlocks off a question the user NEVER SAW. Consent recorded from an
 * undelivered message is the same class of defect as a reply grounding itself.
 *
 * Returns the terminals that lost the delivery contest — everything except the last one the runtime
 * would ACCEPT ({@link terminalPayloadRejection}). The caller prunes them from the action history AFTER the generation resolves, so
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
    // THE DELIVERED ONE IS THE LAST THE RUNTIME WOULD ACCEPT. "The last terminal with a non-empty
    // message" is a different notion and drifts from what the runtime actually delivers: for a step of
    // [respond{message:'Done.', did:[…]}, respond{message:'Are you sure?', did:[]}] the second is REFUSED
    // (`did` violates minItems, so it never executes and never becomes the reply), so counting it as
    // delivered would make the prune drop the observation for the message the user really received.
    // `terminalPayloadRejection` is the ONE acceptance notion, shared with the backend hook that refuses
    // such a call in the first place.
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

/**
 * ── ONE RULE, ONE HOME ────────────────────────────────────────────────────────────────────────────
 *
 * The protocol block and the `respond` schema are read together, every turn, by the same model. A
 * rule stated in both is paid twice and drifts once. So the split is by SUBJECT, not by emphasis:
 *
 *   turn SHAPE (who speaks, how often, in what order, what `did` must contain) → this block;
 *   FIELD contract (what a legal value of `message` / `op` / `target` / `outcome` is) → the schema.
 *
 * Nothing is stated in both places. In particular the SPEECH vocabulary and the `inform` guardrail
 * live on `op` — the field whose value they govern — and the protocol only says WHEN a speech entry
 * is owed.
 *
 * The two variants share every line but one: reply-only adds the no-question bullet. Building them
 * from the same parts is what keeps them from drifting.
 */
const PROTOCOL_HEAD =
  '\n\n## Turn protocol (ABSOLUTE)\n' +
  '- Speak to the user ONLY by calling **respond**, exactly once, as the LAST step of the turn — text ' +
  'outside it is never delivered. Call the domain tools you need FIRST, in earlier steps.\n';

const PROTOCOL_DID =
  '- Declare ONE ACTION entry in `did` for every domain operation that CHANGED something this turn. A ' +
  'lookup changes nothing and is NOT an action — answer it in `message`, unless the user asked you to ' +
  'find something and it came back empty: that is an entry with outcome `not_found`.\n' +
  '- Declare a SPEECH entry whenever the turn speaks — alongside the action entries, or alone when ' +
  'the turn performed no operation.';

const TERMINAL_PROTOCOL = PROTOCOL_HEAD + PROTOCOL_DID;

const TERMINAL_PROTOCOL_REPLY_ONLY =
  PROTOCOL_HEAD +
  '- NEVER ask the user a question — never declare an `ask` intention. When something is ambiguous, ' +
  'make the MOST REASONABLE assumption and PROCEED.\n' +
  PROTOCOL_DID;

export function terminalProtocol(replyOnly: boolean): string {
  return replyOnly ? TERMINAL_PROTOCOL_REPLY_ONLY : TERMINAL_PROTOCOL;
}

/**
 * The forced-terminal fallback prompt (pushes a weak model past the action wall).
 *
 * It restates the `did` floor because it is delivered as a USER message on a history the model has
 * already failed to close — the one moment where repeating the protocol is not duplication but the
 * whole point. It states the SAME rule as {@link terminalProtocol}: an operation that changed
 * something is an action entry, a lookup is not.
 */
export function forcedTerminalPrompt(replyOnly: boolean): string {
  return replyOnly
    ? 'Close the turn now by calling respond. Do NOT ask a question — never declare an `ask` intention. ' +
        'Put your user-facing message in `message`, and declare at least one intention in `did`: every ' +
        'operation that CHANGED something with its honest outcome, or `inform`/`greet`/`refuse` (no ' +
        'outcome) when the turn only speaks.'
    : 'Close the turn now by calling respond. Put the COMPLETE user-facing message in `message`; declare ' +
        'at least one intention in `did` — every operation that CHANGED something this turn with its ' +
        'honest outcome, or a speech intention (`inform`/`greet`/`refuse`/`ask`, no outcome) when the ' +
        'turn only speaks; declare `ask` only if `message` poses ONE clarifying question you will wait on.';
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
const RESPOND_DESCRIPTION = 'END the turn.';

/**
 * ── WHAT THE SCHEMA SAYS, AND WHAT THE ENGINE ENFORCES ────────────────────────────────────────────
 *
 * This block is read on EVERY turn of every agent, so a sentence here is the most expensive prose in
 * the runtime. The test each line has to pass is not "is it true?" but "does the model need to READ
 * it?" — a rule a guard enforces is discoverable from the correction the model gets back, and a rule
 * NOTHING enforces is only ever going to be discoverable here.
 *
 * What each field states, and the guard that fires when the model stops following it:
 *
 * ```
 *   did ≥ 1 intention          terminalPayloadRejection (+ `minItems` in the backend's zod schema)
 *   the closed key set         validateClaims "unknown key" → terminalPayloadRejection
 *   ACTION op ⇒ an outcome     validateClaims partition     → terminalPayloadRejection
 *   SPEECH op ⇒ no outcome     validateClaims partition     → terminalPayloadRejection
 *   the seven outcome words    resolveOutcome → an undeclared word denies in `claimIsGrounded`
 *   a `target` on an action    `claimIsComplete` (an uncovered write is a violation)
 *   an HONEST outcome          `claimIsGrounded` — the action history cross-check, never the prose
 *   `message` asserts no act   NOTHING deterministic (the open prose residual; the optional
 *                              `did × message` llmCheck is its only named mitigation) — so this one
 *                              rule is carried by the schema and cannot be cut.
 * ```
 *
 * The `did` FLOOR and the outcome VOCABULARY are stated for opposite reasons, and the difference is
 * what keeps this block from growing back:
 *  · `minItems` reaches the model as a schema constraint, so the one-line floor beside it is the
 *    cheapest possible restatement of the single most likely weak-model mistake, not a second rule;
 *  · `additionalProperties` does NOT reach the model — the JSON-schema → zod conversion drops it —
 *    so the closed key set has to be PROSE or it is discoverable only from a refused reply;
 *  · the seven outcome words are prose rather than a schema `enum` because a domain may declare its
 *    OWN outcome word (`resolveOutcome` through the contract's `OutcomeMap`), and an `enum` would
 *    reject at the tool boundary what the engine deliberately accepts.
 *
 * `amount` is a LEGAL claim key ({@link import('./claims.js').validateClaims} accepts it, and the
 * honesty cross-check corroborates it against the act that grounds the claim) that the schema
 * deliberately does NOT advertise.
 * Nothing REQUIRES a magnitude: the cross-check treats an absent `amount` as a pass, so the only turn
 * the field can change is one it DENIES. Advertising it spends bytes on every turn of every agent to
 * buy extra ways to fail. Removing the property changes no acceptance — the JSON-schema → zod
 * conversion builds a passthrough object and `validateClaims` keys on its own `CLAIM_KEYS`.
 */
const DID_ITEM_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    op: {
      type: 'string',
      minLength: 1,
      description:
        'An ACTION op — the domain operation, which REQUIRES an `outcome`; or a SPEECH op, which ' +
        'carries none: `greet`, `refuse`, `ask` (your ONE question, in `message`), `inform`. ' +
        '`inform` NEVER asserts an action you performed — a performed action is declared as that ' +
        "action's op, which is verified.",
    },
    targetName: {
      type: 'string',
      minLength: 1,
      description:
        'ACTION entries only — the FIELD NAME the tool result used for the record you acted on, ' +
        'e.g. "bookingId". Copy the name from the result, do not invent one.',
    },
    targetValue: {
      type: 'string',
      minLength: 1,
      description:
        'ACTION entries only — the value at that field, e.g. "bk_1001". It must appear at ' +
        '`targetName` in what the tool actually returned.',
    },
    outcome: {
      type: 'string',
      minLength: 1,
      description:
        'ACTION entries only — what really happened, as one of: `success`, `failure`, `blocked`, ' +
        '`refused`, `tool_called_request_approval` (you CALLED the tool and it came back asking the ' +
        'user to approve), `any_other_question` (you are asking the user something — no call needed), ' +
        '`not_found`, `no_op`.',
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
          description: "The COMPLETE user-facing text, in the USER'S language. Never assert an operation here — operations go in `did`.",
        },
        did: {
          type: 'array',
          items: DID_ITEM_SCHEMA,
          minItems: 1,
          description: 'AT LEAST ONE intention. Keys: `op`, `target`, `outcome` — any other key is rejected.',
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
 * key on `args.message` / `args.did`) all give way to the contract above.
 */
export function normalizeTerminalToolDef(def: ToolDef): ToolDef {
  return isTerminal(def.name) ? respondToolDef() : def;
}
