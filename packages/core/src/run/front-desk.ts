/** The front desk: composes the routing window and reads the decision. The window
 *  carries the desk lines, the current-desk line, ONE prior exchange and the new
 *  message — never a persona, a card, an act or a record. */
import type { ModelStep, StepInput } from '../contract/vocabulary.js';

export interface FrontDeskCfg { readonly houseName: string;
  readonly description: Readonly<Record<string, string>>;
  readonly currentDesk: string | null;
  readonly lastExchange: { readonly userText: string; readonly replyText: string } | null;
  readonly returnedFrom: { readonly by: string; readonly reason: string } | null;
  readonly userText: string }

const RULES = `act — does the NEW message ask this house to CHANGE something (open, charge,
cancel, release, record, update, remove, move...)? yes — the operator wants an operation
performed. no — the operator wants information, or is only conversing. unclear — a careful
human reader could not tell.

When more than one desk could serve, pick the most likely. When the task takes
several desks in sequence, pick the desk that acts first. When no desk's
surface performs what is asked — anything outside the house's own records and
operations — the answer is none, however close a desk's territory sounds.`;

export function composeWindow(cfg: FrontDeskCfg): StepInput {
  const deskLines = Object.entries(cfg.description).map(([n, d]) => `- ${n}: ${d}`).join('\n');
  const seat = cfg.currentDesk === null ? 'The conversation is just opening.'
    : `The conversation so far sits at the ${cfg.currentDesk} desk. A message
continuing that desk's work stays there; a message whose intent
belongs elsewhere moves.`;
  const returned = cfg.returnedFrom === null ? ''
    : `${cfg.returnedFrom.by} returned this message: ${cfg.returnedFrom.reason}\n`;
  const system = `You are the front desk at ${cfg.houseName}. Your only job is to read the
conversation and route the operator's NEW message (the last one) to the desk
that will handle it. Route on what the operator intends, never on the words
they used.

Desks:
${deskLines}

${seat}
${returned}${RULES}`;
  const tail = cfg.lastExchange === null ? [] : [
    { role: 'user' as const, text: cfg.lastExchange.userText },
    { role: 'assistant' as const, text: cfg.lastExchange.replyText }];
  return { system,
    messages: [...tail, { role: 'user', text: cfg.userText }],
    tools: [{ name: 'route',
      does: 'Route the new message to the desk that will handle it, and say whether it '
        + 'asks for an act.',
      schema: { type: 'object', properties: {
        desk: { type: 'string', enum: [...Object.keys(cfg.description), 'none'] },
        act: { type: 'string', enum: ['yes', 'no', 'unclear'] } },
        required: ['desk', 'act'] } }],
    forceFinish: true, llmParams: { temperature: 0 } };
}

/** Whether the message asks for an act — the one intent field beside the desk. */
export type IntentAct = 'yes' | 'no' | 'unclear';

/** The routed desk with the act intent, or null when the step carries no readable
 *  decision — an unreadable half invalidates the whole answer, never a guess. */
export function readDecision(step: ModelStep, desks: readonly string[]):
  { readonly desk: string; readonly act: IntentAct } | null {
  const call = step.calls.find(c => c.tool === 'route');
  const desk = call?.args['desk'];
  const act = call?.args['act'];
  if (typeof desk !== 'string' || (desk !== 'none' && !desks.includes(desk))) return null;
  if (act !== 'yes' && act !== 'no' && act !== 'unclear') return null;
  return { desk, act };
}
