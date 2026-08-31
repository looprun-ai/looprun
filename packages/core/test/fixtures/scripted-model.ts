import type { ModelStep, StepInput, TurnFailure } from '../../src/contract/vocabulary.js';
import type { ModelPort } from '../../src/contract/ports.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';

/** Step sugar for scripts driving the shipped ScriptedModel seat. */
export function callStep(tool: string, args: Readonly<Record<string, unknown>>): ModelStep {
  return { calls: [{ tool, args }], text: '' };
}

/** A finish claims the fact ids its script names and no others: a script that owes
 *  nothing claims nothing, and a script testing the owed-fact channel names its ids
 *  itself. `payingDesk` fills them from the prompt for the scripts that own facts. */
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
 *  the ids it numbered — the literals a real desk copies out of the records it was
 *  handed, and no id beyond them. Codes and figures the engine mints at runtime cannot
 *  live in a static script; this is how a script states them. Every other step comes
 *  from the script untouched. */
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
