/**
 * @looprun-ai/core runtime — the TERMINAL protocol (framework-free).
 *
 * The certified turn shape: the model speaks to the user ONLY through the runtime-owned terminal
 * tools (`replyToUser` / `askUser`) — combined with `toolChoice:'required'` this forces action
 * before speech and makes the user-facing text a verifiable tool argument instead of free text.
 */
import type { ToolDef } from './types.js';

export const TERMINAL_TOOLS = ['replyToUser', 'askUser'] as const;
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
 * ── Terminals emitted in a step but never DELIVERED ───────────────────────────────────────────────
 *
 * {@link prematureTerminalTools} answers "did a terminal ride along with DOMAIN work?" and returns
 * `[]` for a step carrying only terminals — correct for its own question, and a hole for a different
 * one. The runtime delivers the LAST non-empty terminal text, while the guard hooks record EVERY
 * terminal as an ok observation. So a step of `askUser("Delete X?") + replyToUser("Have a nice
 * day.")` delivers only the pleasantry and still leaves an ok `askUser` in the ledger. Next turn, a
 * prior-ask confirmation arm reads that entry as "the user was asked", and a destructive action
 * unlocks off a question the user NEVER SAW. Consent recorded from an undelivered message is the
 * same class of defect as a reply grounding itself.
 *
 * Returns the terminals that lost the delivery contest — everything except the last one carrying
 * non-empty text. The caller prunes them from the ledger AFTER the generation resolves, so
 * within-step visibility (a sibling's preTool checks seeing the askUser) is untouched; only the
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
    const texts = calls.map((tc) => String(toolCallArgs(tc).text ?? '').trim());
    const deliveredText = texts.filter(Boolean).slice(-1)[0];
    const delivered = deliveredText === undefined ? -1 : texts.lastIndexOf(deliveredText);
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

export const TERMINAL_PROTOCOL =
  '\n\n## Turn protocol (ABSOLUTE)\n' +
  '- You speak to the user ONLY by calling **replyToUser** (to answer or summarize what you did) or **askUser** ' +
  '(to ask ONE clarifying question). NEVER write a free-text reply — text outside these tools is not delivered.\n' +
  '- Every turn MUST call at least one tool, and MUST END by calling exactly one replyToUser or askUser whose ' +
  '`text` carries the COMPLETE user-facing message in the user\'s language.\n' +
  '- Do the domain tools first; then close the turn with the single terminal call.';

export const TERMINAL_PROTOCOL_REPLY_ONLY =
  '\n\n## Turn protocol (ABSOLUTE)\n' +
  '- You speak to the user ONLY by calling **replyToUser**. NEVER write a free-text reply and NEVER ask the ' +
  'user a question — there is no ask tool.\n' +
  '- If something is ambiguous, make the MOST REASONABLE assumption and PROCEED — never stop to ask.\n' +
  '- Every turn MUST first DO the requested action with the domain tools, then END by calling replyToUser whose ' +
  '`text` reports what you did, in the user\'s language.';

export function terminalProtocol(replyOnly: boolean): string {
  return replyOnly ? TERMINAL_PROTOCOL_REPLY_ONLY : TERMINAL_PROTOCOL;
}

/** The forced-terminal fallback prompt (pushes a weak model past the action wall). */
export function forcedTerminalPrompt(replyOnly: boolean): string {
  return replyOnly
    ? 'Close the turn now by calling replyToUser. Do NOT ask a question — state what you did in `text`.'
    : 'Close the turn now: call replyToUser to answer / summarize what you did, or askUser to ask ONE clarifying question. Put the COMPLETE user-facing message in `text`.';
}

/**
 * The terminal tools' contract — authored by the RUNTIME, never by the host.
 *
 * A terminal is not a domain tool: it is how the turn ends, and the protocol owns what it means. A
 * host-supplied definition can carry business prose in its description, pin the reply to one brand
 * language, or make extra arguments required — each of which the runtime would then have to satisfy
 * or silently ignore. The runtime reads exactly one argument, `text`; anything else costs tokens,
 * invites a wrong value and has no consumer.
 */
const TERMINAL_TOOL_CONTRACT: Record<string, { description: string; textDoc: string }> = {
  replyToUser: {
    description:
      'END the turn with the final user-facing message. Every turn ends with exactly one replyToUser ' +
      'or askUser. Call it only AFTER the domain tools you need have returned their results — never in ' +
      'the same step as a domain tool, because their results are not available to you yet.',
    textDoc: "The COMPLETE user-facing message, written ENTIRELY in the USER'S language.",
  },
  askUser: {
    description:
      'END the turn by asking the user exactly ONE clarifying question, when you cannot proceed without ' +
      'information only the user has. This closes the turn: do not call it in the same step as a domain ' +
      'tool, and do not act on the answer until the user has given it.',
    textDoc: "The single clarifying question, written ENTIRELY in the USER'S language.",
  },
};

function terminalDef(name: string, contract: { description: string; textDoc: string }): ToolDef {
  return {
    name,
    description: contract.description,
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', minLength: 1, description: contract.textDoc } },
      required: ['text'],
      additionalProperties: false,
    },
  };
}

/** The JSON-schema defs for the terminal tools. */
export function terminalToolDefs(): ToolDef[] {
  return Object.entries(TERMINAL_TOOL_CONTRACT).map(([name, contract]) => terminalDef(name, contract));
}

/**
 * Rewrite a TERMINAL tool def to the runtime's own contract; a domain def is returned UNCHANGED —
 * by identity, so passing a tool list through this is provably a no-op for everything else.
 *
 * This is what makes the protocol independent of how a host happens to declare its terminals: a
 * description written for a different runtime, an extra required argument, or a differently-named
 * text field (which this runtime would silently ignore, since the terminal execute and the salvage
 * both key on `args.text`) are all replaced by the contract above.
 */
export function normalizeTerminalToolDef(def: ToolDef): ToolDef {
  const contract = TERMINAL_TOOL_CONTRACT[def.name];
  return contract ? terminalDef(def.name, contract) : def;
}
