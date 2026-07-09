/**
 * @looprun/core runtime — the TERMINAL protocol (framework-free).
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

/** Default JSON-schema defs for the terminal tools (used when the host's toolDefs omit them). */
export function terminalToolDefs(): ToolDef[] {
  return [
    {
      name: 'replyToUser',
      description: 'Deliver the COMPLETE user-facing reply for this turn. Call exactly once, at the end of the turn.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: "The complete user-facing message, in the user's language." } },
        required: ['text'],
      },
    },
    {
      name: 'askUser',
      description: 'Ask the user ONE clarifying question and end the turn. Use only when you cannot proceed.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: "The single clarifying question, in the user's language." } },
        required: ['text'],
      },
    },
  ];
}
