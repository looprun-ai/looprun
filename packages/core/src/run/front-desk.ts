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

const RULES = `When more than one desk could serve, pick the most likely. When the task takes
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
      does: 'Route the new message to the desk that will handle it.',
      schema: { type: 'object', properties: {
        desk: { type: 'string', enum: [...Object.keys(cfg.description), 'none'] } },
        required: ['desk'] } }],
    forceFinish: true, llmParams: { temperature: 0 } };
}

/** The routed desk, 'none', or null when the step carries no readable decision. */
export function readDecision(step: ModelStep, desks: readonly string[]): string | null {
  const call = step.calls.find(c => c.tool === 'route');
  const desk = call?.args['desk'];
  if (typeof desk !== 'string') return null;
  return desk === 'none' || desks.includes(desk) ? desk : null;
}
