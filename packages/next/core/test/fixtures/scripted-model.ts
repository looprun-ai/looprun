import type { ModelStep } from '../../src/contract/vocabulary.js';

/** Step sugar for scripts driving the shipped ScriptedModel seat. */
export function callStep(tool: string, args: Readonly<Record<string, unknown>>): ModelStep {
  return { calls: [{ tool, args }], text: '' };
}

export function finishStep(message: string,
  report: readonly { tool: string; target: string; word: string }[] = []): ModelStep {
  return { calls: [{ tool: 'finish', args: { message, report } }], text: '' };
}
