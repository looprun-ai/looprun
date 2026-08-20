/** Derives the user-facing word from the executor's one-word answer plus control
 *  flow, and never guesses. Stateless. */
import type { Correction, Done, Effect, Evidence, Reason, StateSnapshot, Status, ToolAnswer, Verdict } from '../contract/vocabulary.js';
import { TurnFailure } from '../contract/vocabulary.js';
import { canonicalJson } from '../contract/canonical-call.js';
import type { TurnDraft } from './session.js';

export type GradeInput =
  | { readonly answer: ToolAnswer; readonly actId: string }
  | { readonly threw: string; readonly actId: string }
  | { readonly verdict: Verdict; readonly actId: string };

export interface Grade {
  readonly said: Done | null;
  readonly status: Status;
  readonly reason: Reason | null;
  readonly evidence: Evidence;
  readonly corrections: readonly Correction[];
}

export class StatusClerk {
  grade(input: GradeInput, effect: Effect, before: StateSnapshot | null,
        after: StateSnapshot | null, draft: TurnDraft): Grade {
    void draft;
    if ('answer' in input) {
      const said = input.answer.done;
      if (said === 'yes') return { said, status: 'done', reason: null, evidence: 'executor', corrections: [] };
      if (said === 'no') {
        if (effect !== 'read' && before !== null && after !== null
          && canonicalJson(before) !== canonicalJson(after)) {
          return { said, status: 'done', reason: null, evidence: 'diff',
                   corrections: [{ kind: 'recordCorrected', actId: input.actId, said }] };
        }
        return { said, status: 'not-done', reason: 'refused', evidence: 'executor', corrections: [] };
      }
      return { said, status: 'unknown', reason: null, evidence: 'executor', corrections: [] };
    }
    if ('threw' in input) {
      if (effect === 'read') throw new TurnFailure('executor', input.threw);
      return { said: null, status: 'unknown', reason: null, evidence: 'engine', corrections: [] };
    }
    if (input.verdict.kind === 'hold') {
      return { said: null, status: 'not-done', reason: 'held', evidence: 'engine', corrections: [] };
    }
    return { said: null, status: 'not-done', reason: 'blocked', evidence: 'engine', corrections: [] };
  }
}
