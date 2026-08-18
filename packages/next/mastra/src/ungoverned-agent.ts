/** The explicit ungoverned twin — the same closed config, byte-identical prompt,
 *  every guard taught in prose and DISARMED in execution. The class NAME is what
 *  states the disarming: ungoverned is never an option on the governed class. */
import { LoopRunAgent } from './loop-run-agent.js';
import { assembleUngoverned, type LoopRunConfig } from './agent-assembly.js';

export class UngovernedAgent extends LoopRunAgent {
  constructor(cfg: LoopRunConfig) {
    super(cfg, assembleUngoverned);
  }
}
