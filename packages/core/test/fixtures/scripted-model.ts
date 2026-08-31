import type { ModelStep } from '../../src/contract/vocabulary.js';

export { payingDesk } from '../../src/run/scripted-model.js';

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
