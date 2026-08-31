import type { ModelStep, StepInput } from '../contract/vocabulary.js';
import { TurnFailure } from '../contract/vocabulary.js';
import type { ModelPort } from '../contract/ports.js';

/** The data-driven seat: a ModelPort fed a queue of typed steps — no network, no keys.
 *  Records every StepInput it receives; an entry may be a TurnFailure, thrown when its
 *  turn in the queue comes. Exam scripts and engine proofs drive the real engine
 *  through this seat. */
export class ScriptedModel implements ModelPort {
  readonly seen: StepInput[] = [];
  private readonly steps: (ModelStep | TurnFailure)[];

  constructor(steps: readonly (ModelStep | TurnFailure)[]) {
    this.steps = [...steps];
  }

  step(input: StepInput): Promise<ModelStep> {
    this.seen.push(input);
    const next = this.steps.shift();
    if (next === undefined) throw new TurnFailure('provider-quota', 'script exhausted');
    if (next instanceof TurnFailure) throw next;
    return Promise.resolve(next);
  }
}

/** The OWED FACTS block of a prompt, as its numbered lines. */
function owedLines(system: string): readonly string[] {
  const at = system.indexOf('OWED FACTS');
  if (at < 0) return [];
  const [, ...lines] = system.slice(at).split('\n');
  return lines;
}

/** The id a numbered line opens with, or null when the line is a fact's continuation. */
function labelOf(line: string): string | null {
  if (!line.startsWith('[F')) return null;
  const close = line.indexOf(']');
  return close < 0 ? null : line.slice(1, close);
}

/** One line of the block as a desk carries it into its own words: the fact id and the
 *  state tag beside it are the engine's labels and leave; every other byte stays, so a
 *  fact spanning more than one line keeps all of it. */
function bareLine(line: string): string {
  const close = line.indexOf(']');
  if (labelOf(line) === null || close < 0) return line;
  const rest = line.slice(close + 1).trimStart();
  if (!rest.startsWith('[')) return rest;
  const tagEnd = rest.indexOf(']');
  return tagEnd < 0 ? rest : rest.slice(tagEnd + 1).trimStart();
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
    const lines = owedLines(input.system);
    const owed = lines.map(bareLine).join(' ');
    if (owed === '') return step;
    const ids = lines.flatMap(line => {
      const id = labelOf(line);
      return id === null ? [] : [id];
    });
    return { ...step, calls: step.calls.map(call => call.tool !== 'finish' ? call
      : { ...call, args: { ...call.args, facts: ids,
          message: `${String(call.args['message'] ?? '')} ${owed}` } }) };
  } };
}
