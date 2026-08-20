import type { ReadyCall, ToolAnswer } from '../../src/contract/vocabulary.js';
import type { ToolPort } from '../../src/contract/ports.js';

export type ToolBehavior = (call: ReadyCall) => ToolAnswer | 'throw';

/** The hostile seam: answers done:'no', done:'unknown' and throws on declared calls,
 *  so the proofs exercise real hostility, not fixture optimism. Logs every call —
 *  the re-execution assertions read the log. */
export class HostileToolPort implements ToolPort {
  readonly log: ReadyCall[] = [];
  private readonly behaviors: Readonly<Record<string, ToolBehavior>>;

  constructor(behaviors: Readonly<Record<string, ToolBehavior>>) {
    this.behaviors = behaviors;
  }

  call(call: ReadyCall): Promise<ToolAnswer> {
    this.log.push(call);
    const behavior = this.behaviors[call.tool];
    if (!behavior) return Promise.reject(new Error(`undeclared tool reached the executor: ${call.tool}`));
    const answer = behavior(call);
    if (answer === 'throw') return Promise.reject(new Error('executor blew up'));
    return Promise.resolve(answer);
  }
}
