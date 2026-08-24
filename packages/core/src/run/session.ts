/** Per-conversation state, caller-supplied identity only: the turn index, the sealed
 *  history, and the promise-queue mutex that serializes EVERY entry. seal(draft)
 *  folds the TurnDraft into the stores in one move — the ONLY place session state
 *  changes; a discarded draft leaves no trace. */
import type { Act, Correction, FinishPayload, Question, QuestionClose, TurnRecord } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { CanonicalCallData } from '../contract/vocabulary.js';
import { isJson, type CanonicalCall } from '../contract/canonical-call.js';
import type { ActionHistory } from './action-history.js';
import { ConsentDesk } from './consent-desk.js';

/** The one mutable work area of a turn, private to it and folded by seal. */
export interface TurnDraft {
  readonly turn: number;
  userText: string;
  servedBy: string;
  readonly acts: Act[];
  readonly corrections: Correction[];
  readonly issued: Question[];
  readonly consumed: string[];
  readonly closed: { readonly id: string; readonly why: QuestionClose }[];
  finish: FinishPayload | null;
  closedBy: 'model' | 'engine';
  text: string;
  /** Prerequisite tools whose micro-step yielded no call this turn — the debt is
   *  asked of the model at most once per turn. */
  readonly microTried: string[];
  /** Every model call books its cost here; zeros where the port has no numbers. */
  readonly usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number;
                    modelCalls: number };
}

export class Session {
  readonly id: string;
  readonly history: ActionHistory;
  /** The question lifecycle; the delivered display form is masked at the desk door. */
  readonly consent: ConsentDesk;
  /** Tools whose simulation mutated state — they fall back to plain consent here. */
  readonly revokedSimulations = new Set<string>();
  private turnIndex = 1;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(id: string, history: ActionHistory,
              maskCall: (call: CanonicalCall) => CanonicalCallData
                = call => call.data(v => (isJson(v) ? v : null))) {
    this.id = id;
    this.history = history;
    this.consent = new ConsentDesk(maskCall);
  }

  /** The serializing queue: a failed job never poisons the next entry. */
  enter<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  /** The work area; discarded on failure. The desk starts a fresh overlay with it. */
  draft(): TurnDraft {
    this.consent.beginTurn();
    return { turn: this.turnIndex, userText: '', servedBy: '', acts: [], corrections: [],
             issued: [], consumed: [], closed: [], finish: null, closedBy: 'model', text: '',
             microTried: [],
             usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, modelCalls: 0 } };
  }

  seal(draft: TurnDraft): TurnRecord {
    const record: TurnRecord = deepFreeze({
      turn: draft.turn,
      servedBy: draft.servedBy,
      userText: draft.userText,
      acts: [...draft.acts],
      questions: { issued: [...draft.issued], consumed: [...draft.consumed], closed: [...draft.closed] },
      finish: draft.finish,
      corrections: [...draft.corrections],
      text: draft.text,
      closedBy: draft.closedBy,
      usage: { ...draft.usage }
    });
    this.history.sealTurn(record);
    this.consent.commit();
    this.turnIndex += 1;
    return record;
  }
}
