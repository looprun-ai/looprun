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
