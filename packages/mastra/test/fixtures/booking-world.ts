import type { AgentSpec, ModelPort, ModelStep, StepInput, TurnFailure } from '@looprun-ai/core';
import { ScriptedModel, world } from '@looprun-ai/core';

/** The author-door fixtures every assembly and gate test drives. */
export const BOOKING = world({
  records: { bookings: { bk_9: { status: 'CONFIRMED', day: 'Tuesday' } } },
  reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up the booking' } },
  destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'Cancel the booking' } }
});

export const SPEC: AgentSpec = { name: 'concierge', persona: 'You are the hotel desk.' };

export function callStep(tool: string, args: Readonly<Record<string, unknown>>): ModelStep {
  return { calls: [{ tool, args }], text: '' };
}


export function finishStep(message: string,
  report: readonly { tool: string; target: string; word: string }[] = [],
  facts: readonly string[] = []): ModelStep {
  return { calls: [{ tool: 'finish', args: { message, report, facts } }], text: '' };
}

/** The OWED FACTS block the prompt's tail carries, as its numbered lines. */
function owedLines(system: string): readonly string[] {
  const at = system.indexOf('OWED FACTS');
  if (at < 0) return [];
  const [, ...lines] = system.slice(at).split('\n');
  return lines;
}

/** The record lines, stripped of their engine labels — what a desk that read its owed
 *  facts carries into its own words. */
function owedWords(system: string): string {
  return owedLines(system).map(line => line.replace(/^\[F\d+\] (\[[^\]]*\] )?/u, '')).join(' ');
}

/** Exactly the ids the prompt numbered for this turn, in order. */
function owedIds(system: string): readonly string[] {
  return owedLines(system).flatMap(line => {
    const found = /^\[(F\d+)\]/u.exec(line);
    return found === null ? [] : [found[1]];
  });
}

/** The scripted seat as a desk that PAYS what the turn owes: whatever the script says,
 *  a finish is delivered carrying the fact lines the prompt showed and naming exactly
 *  the ids it numbered. Codes and figures the engine mints at runtime cannot live in a
 *  static script; this is how a script states them. */
export function payingDesk(steps: readonly (ModelStep | TurnFailure)[]):
  ModelPort & { readonly seen: StepInput[] } {
  const scripted = new ScriptedModel(steps);
  return { seen: scripted.seen, step: async input => {
    const step = await scripted.step(input);
    const owed = owedWords(input.system);
    if (owed === '') return step;
    const ids = owedIds(input.system);
    return { ...step, calls: step.calls.map(call => call.tool !== 'finish' ? call
      : { ...call, args: { ...call.args, facts: ids,
          message: `${String(call.args['message'] ?? '')} ${owed}` } }) };
  } };
}
