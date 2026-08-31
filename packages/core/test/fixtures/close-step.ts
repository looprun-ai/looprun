import type { ModelPort } from '../../src/contract/ports.js';
import type { ModelStep, StepInput } from '../../src/contract/vocabulary.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';

/** The close instruction's opening — the marker that says a request is the desk's
 *  close-step rather than a step of the main loop. */
export const CLOSE_MARK = 'THE DESK HOLDS';

export const isClose = (input: StepInput): boolean =>
  input.messages.some(m => 'text' in m && m.text.includes(CLOSE_MARK));

/** The numbered facts the close instruction carries — a fact runs from its own label
 *  to the next one, continuation lines included. */
export function closeFacts(input: StepInput): readonly string[] {
  const held = input.messages.find(m => 'text' in m && m.text.includes(CLOSE_MARK));
  const text = held !== undefined && 'text' in held ? held.text : '';
  const lines = text.split('\n');
  const opens = lines.findIndex(line => line.startsWith('[F'));
  if (opens < 0) return [];
  const ends = lines.indexOf('', opens);
  const facts: string[] = [];
  for (const line of lines.slice(opens, ends < 0 ? undefined : ends)) {
    if (line.startsWith('[F')) facts.push(line);
    else facts[facts.length - 1] += ` ${line}`;
  }
  return facts;
}

/** The record lines stripped of their engine labels — what a desk that read its close
 *  instruction carries into its own words. */
export const closeWords = (input: StepInput): string =>
  closeFacts(input).map(fact => fact.replace(/^\[F\d+\] (\[[^\]]*\] )?/u, '')).join(' ');

/** Exactly the ids the close instruction numbered, in order. */
export const closeIds = (input: StepInput): readonly string[] =>
  closeFacts(input).flatMap(fact => {
    const found = /^\[(F\d+)\]/u.exec(fact);
    return found === null ? [] : [found[1]];
  });

/** The script drives the main loop; the close-step is answered by `close`, which reads
 *  the instruction the engine actually wrote. */
export function closingPort(steps: readonly ModelStep[],
                            close: (input: StepInput, nth: number) => ModelStep):
  ModelPort & { readonly seen: StepInput[] } {
  const scripted = new ScriptedModel(steps);
  const seen: StepInput[] = [];
  let nth = 0;
  return { seen, step: async input => {
    seen.push(input);
    if (!isClose(input)) return scripted.step(input);
    nth += 1;
    return close(input, nth);
  } };
}
