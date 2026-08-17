import type { ModelStep, StepInput } from '../../src/contract/vocabulary.js';
import { TurnFailure } from '../../src/contract/vocabulary.js';
import type { ModelPort } from '../../src/contract/ports.js';

/** A ModelPort fed a queue of steps; records every StepInput it receives. An entry
 *  may be a TurnFailure, thrown when its turn in the queue comes. */
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

export function callStep(tool: string, args: Readonly<Record<string, unknown>>): ModelStep {
  return { calls: [{ tool, args }], text: '' };
}

export function finishStep(message: string,
  report: readonly { tool: string; target: string; word: string }[] = []): ModelStep {
  return { calls: [{ tool: 'finish', args: { message, report } }], text: '' };
}
