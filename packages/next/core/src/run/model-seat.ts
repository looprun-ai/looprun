/** The model seat: a SET of certified targets with a declared routing strategy.
 *  Only certified targets may enter the set. Switches only BETWEEN turn attempts,
 *  never mid-turn; every turn record names the serving model. A target declared
 *  local arms the runaway brakes: pinned decoding and a hard output-token cap. */
import type { LlmParams, ModelChoice, ModelTarget, TurnFailure } from '../contract/vocabulary.js';
import { CardError } from '../contract/vocabulary.js';
import type { ModelPort } from '../contract/ports.js';

const LOCAL_OUTPUT_CAP = 2048;

export class ModelSeat {
  private readonly set: readonly ModelTarget[];
  private readonly make: (t: ModelTarget) => ModelPort;
  private cursor = 0;
  private readonly ports = new Map<string, ModelPort>();

  private constructor(set: readonly ModelTarget[], make: (t: ModelTarget) => ModelPort) {
    this.set = set;
    this.make = make;
  }

  static create(targets: readonly ModelTarget[], choice: ModelChoice,
                make: (t: ModelTarget) => ModelPort): ModelSeat {
    const ids = typeof choice === 'string' ? [choice] : [...choice.targets];
    const problems: { code: string; sentence: string }[] = [];
    const set: ModelTarget[] = [];
    for (const id of ids) {
      const target = targets.find(t => t.id === id);
      if (!target) {
        problems.push({ code: 'MODEL_UNKNOWN', sentence: `No declared target is named '${id}'.` });
      } else if (!target.certified) {
        problems.push({ code: 'MODEL_NOT_CERTIFIED', sentence: `Target '${id}' is not certified; certify it or seat a certified one.` });
      } else {
        set.push(target);
      }
    }
    if (set.length === 0) problems.push({ code: 'MODEL_SEAT_EMPTY', sentence: 'The seat needs at least one certified target.' });
    if (problems.length > 0) throw new CardError(problems);
    return new ModelSeat(set, make);
  }

  private current(): ModelTarget {
    return this.set[this.cursor];
  }

  /** The target serving THIS turn attempt. */
  port(): ModelPort {
    const target = this.current();
    let port = this.ports.get(target.id);
    if (!port) {
      port = this.make(target);
      this.ports.set(target.id, port);
    }
    return port;
  }

  serving(): string {
    return this.current().id;
  }

  /** Between attempts only; false when the set is spent. */
  reroute(failure: TurnFailure): boolean {
    void failure;
    if (this.cursor + 1 >= this.set.length) return false;
    this.cursor += 1;
    return true;
  }

  /** The local-tier brakes: pinned decoding, hard output cap. A cloud target passes through. */
  llmParams(base: LlmParams): LlmParams {
    const target = this.current();
    if (target.tier === 'cloud') return base;
    return {
      ...base,
      temperature: 0,
      maxOutputTokens: Math.min(base.maxOutputTokens ?? LOCAL_OUTPUT_CAP, LOCAL_OUTPUT_CAP)
    };
  }
}
