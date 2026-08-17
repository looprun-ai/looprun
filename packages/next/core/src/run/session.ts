/** Per-conversation state, caller-supplied identity only: the turn index, the sealed
 *  history, and the promise-queue mutex that serializes EVERY entry. seal(draft)
 *  folds the TurnDraft into the stores in one move — the ONLY place session state
 *  changes; a discarded draft leaves no trace. */
import type { Act, Correction, FinishPayload, Question, QuestionClose, TurnRecord } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { ActionHistory } from './action-history.js';

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
}

export class Session {
  readonly id: string;
  readonly history: ActionHistory;
  private turnIndex = 1;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(id: string, history: ActionHistory) {
    this.id = id;
    this.history = history;
  }

  /** The serializing queue: a failed job never poisons the next entry. */
  enter<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  /** The work area; discarded on failure. */
  draft(): TurnDraft {
    return { turn: this.turnIndex, userText: '', servedBy: '', acts: [], corrections: [],
             issued: [], consumed: [], closed: [], finish: null, closedBy: 'model', text: '' };
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
      closedBy: draft.closedBy
    });
    this.history.sealTurn(record);
    this.turnIndex += 1;
    return record;
  }
}
