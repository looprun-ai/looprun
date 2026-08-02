/** Bad-reference variant of the campaign fixture: identical agent, but its single case targets a
 *  guard that exists nowhere in the inventory — so `looprun-eval validate`'s references layer is RED
 *  and the campaign must refuse at preflight (before spending a token). */
export { CONTRACT, SPECS } from '../../campaign-subject/norms/index.js';

export const CASE_AGENT: Record<string, string> = { '01-greet': 'assistant' };
