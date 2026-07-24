/**
 * Model-tuned spec variants for the nemotron free chain — the recipe measured in the research
 * lab (fix2-nano / v3): a TURN PROTOCOL at the very top of the behavior block,
 * "text is not action" named explicitly, non-destructive work done without permission-asking,
 * and the flow as a numbered per-turn checklist.
 *
 * Measured failure this tunes away (sim runs of 2026-07-19, governed and raw alike): on the
 * vault-filing task nemotron completes the turn with ZERO tool calls — it narrates/asks instead
 * of filing (the fake world's capture queue never shrinks). The guards never fired; this is a
 * prompt-pedagogy gap, not a governance gap. So the subclass changes ONLY the behavior prose —
 * the guard set, tool surface, lexicon and theme are inherited unchanged: governance identical,
 * pedagogy tuned.
 */
import { AgentSpecVaultFiling } from '../../second-brain/src/agents/second-brain/vault-filing-spec.js';

export class AgentSpecVaultFilingNemotron extends AgentSpecVaultFiling {
  constructor() {
    super();
    // Atlas v3 rule: the turn protocol lives at the VERY TOP — priority must survive on the
    // smaller model. The runtime renders persona first, then these lines.
    this.behavior.unshift(
      'START EVERY TURN HERE — act, then write. A filing/triage request means TOOL CALLS THIS ' +
        'TURN: inboxList first, before any prose. TEXT IS NOT ACTION: a reply that describes, ' +
        'plans, promises, or asks about work while making zero tool calls this turn is a FAILURE.',
      'Reading, filing, tagging and moving are NON-DESTRUCTIVE — never ask permission for them, ' +
        'never say "shall I proceed?", never announce a plan instead of executing it. The ONLY ' +
        'action that waits for a go-ahead is noteDelete.',
      'THE FILING PASS, in order, all in this turn: (1) inboxList; (2) for EACH pending item: ' +
        'itemRead, then noteCreate into the fitting vault folder with 2–4 lowercase tags; (3) only ' +
        'AFTER every item is filed, handle any delete request. A delete instruction NEVER pauses ' +
        'or replaces the filing pass — file everything first, then relay the noteDelete ' +
        'confirmation question about the item you would discard. Stopping to discuss deletion ' +
        'with an unfiled queue is a FAILURE.',
    );
  }
}

export default new AgentSpecVaultFilingNemotron();
