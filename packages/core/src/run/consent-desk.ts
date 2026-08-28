/** The question lifecycle as the named state machine
 *  open → consumed | closed(declined | superseded | expired | vetoed). A code is six
 *  random digits, unique among open questions; an IDENTICAL re-proposal returns the
 *  SAME question and code, never a second live code; a re-proposal differing in ANY
 *  arg births a SIBLING question. ONLY the exact code, alone in the message, consumes
 *  — in any language, because digits are. A code wrapped in any other text (a NO
 *  before it included) consumes nothing and earns the type-only-the-code notice.
 *  There is no decline literal: cancelling is letting the code expire — five minutes
 *  on the clock, or the turn ttl, whichever falls first. The desk's map holds the
 *  EXECUTABLE call; the delivered Question.call is the masked display form. Turn work
 *  stays on a working overlay: seal commits it, a discarded draft leaves no trace. */
import { randomBytes, randomInt } from 'node:crypto';
import type { CanonicalCallData, Question, QuestionClose } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import { isJson, type CanonicalCall } from '../contract/canonical-call.js';
import type { TurnDraft } from './session.js';

interface Stored {
  readonly question: Question;
  readonly executable: CanonicalCallData;
  readonly targetValue: string | null;
  readonly state: 'open' | 'consumed' | { readonly closed: QuestionClose };
  /** The clock reading at mint; the five-minute validity counts from here. */
  readonly bornAtMs: number;
  /** The rendered after/later tenses, filled at hold time from the engine reads. */
  readonly after: string | null;
  readonly later: string | null;
  /** The turn the licensed act executed in; null while unexecuted. */
  readonly executedAtTurn: number | null;
  /** The turn the user's answer consumed the question in; null while open. */
  readonly consumedAtTurn: number | null;
  /** The sentence the licensed act sealed with — the record's own words. */
  readonly outcome?: string | null;
}

const QUESTION_TTL_MS = 5 * 60_000;

export class ConsentDesk {
  private committed = new Map<string, Stored>();
  private working = new Map<string, Stored>();
  private readonly maskArgs: (call: CanonicalCall) => CanonicalCallData;
  private readonly now: () => number;

  constructor(maskArgs: (call: CanonicalCall) => CanonicalCallData,
              now: () => number = Date.now) {
    this.maskArgs = maskArgs;
    this.now = now;
  }

  /** A fresh turn attempt works on a copy; a discarded draft leaves no trace. */
  beginTurn(): void {
    this.working = new Map(this.committed);
  }

  commit(): void {
    this.committed = new Map(this.working);
  }

  hold(call: CanonicalCall, targetValue: string | null, sentence: string,
       draft: TurnDraft, tenses: { readonly after: string | null;
                                   readonly later: string | null }
                       = { after: null, later: null }): Question {
    const key = call.key;
    const existing = this.working.get(key);
    if (existing !== undefined && existing.state === 'open') {
      const question: Question = deepFreeze({ ...existing.question, sentence });
      this.working.set(key, { ...existing, question,
        after: tenses.after, later: tenses.later });
      return question;
    }
    // ONE standing question per (tool, target): a re-proposal that differs only
    // in its other arguments REPLACES the executable call under the SAME code —
    // the operator approves the act on the record, and the newest proposal is
    // what a licence runs. A target-less (label-bound) question works the same
    // way per tool: the label licenses the act whatever the arguments are.
    for (const [priorKey, row] of this.working) {
      if (row.state !== 'open' || row.question.call.tool !== call.tool
        || row.targetValue !== targetValue) continue;
      const question: Question = deepFreeze({
        ...row.question, call: this.maskArgs(call), sentence
      });
      this.working.delete(priorKey);
      this.working.set(key, { ...row, question,
        executable: call.data(v => (isJson(v) ? v : null)),
        after: tenses.after, later: tenses.later });
      return question;
    }
    const question: Question = deepFreeze({
      id: `q_${randomBytes(4).toString('hex')}`,
      code: this.mintCode(),
      call: this.maskArgs(call),
      sentence,
      state: 'open' as const,
      bornAtTurn: draft.turn
    });
    this.working.set(key, {
      question, executable: call.data(v => (isJson(v) ? v : null)), targetValue, state: 'open',
      bornAtMs: this.now(),
      after: tenses.after, later: tenses.later, executedAtTurn: null, consumedAtTurn: null
    });
    draft.issued.push(question);
    return question;
  }

  /** The after-tense of the consumed question a licensed call answers, by canonical key. */
  afterText(key: string): string | null {
    const stored = this.working.get(key);
    return stored !== undefined && stored.state === 'consumed' ? stored.after : null;
  }

  markExecuted(id: string, turn: number, outcome: string | null = null): void {
    for (const [key, stored] of this.working) {
      if (stored.question.id === id) {
        this.working.set(key, { ...stored, executedAtTurn: turn, outcome });
      }
    }
  }

  /** A code consumed in an EARLIER turn arriving again is answered by the record:
   *  the sentence the licensed act sealed with, restated — never a dead turn. The
   *  code consumed this turn already has its answer beside it on this reply. */
  staleAnswers(userText: string, turn: number): readonly string[] {
    return [...this.working.values()]
      .filter(s => s.state === 'consumed' && userText.includes(s.question.code)
        && s.consumedAtTurn !== null && s.consumedAtTurn < turn)
      .map(s => `${s.question.code} was already answered — ${
        s.outcome ?? 'the act it licensed stands on the record'}`);
  }

  /** Standing later-tense sentences of acts executed in EARLIER turns. */
  laterTexts(turn: number): readonly string[] {
    const rows = [...this.working.values()];
    const superseded = (s: Stored): boolean => rows.some(o => o !== s
      && o.executable.tool === s.executable.tool && o.targetValue === s.targetValue
      && o.question.bornAtTurn > s.question.bornAtTurn);
    return rows
      .filter(s => s.state === 'consumed' && s.later !== null
        && s.executedAtTurn !== null && s.executedAtTurn < turn && !superseded(s))
      .map(s => s.later ?? '');
  }

  /** ONLY the exact code, alone in the message, consumes — in any language,
   *  because digits are. Anything else consumes nothing. */
  readAnswer(userText: string, draft: TurnDraft): readonly Question[] {
    const consumed: Question[] = [];
    const given = userText.trim();
    for (const [key, stored] of this.working) {
      if (stored.state !== 'open') continue;
      if (given === stored.question.code) {
        this.working.set(key, { ...stored, state: 'consumed', consumedAtTurn: draft.turn });
        draft.consumed.push(stored.question.id);
        consumed.push(stored.question);
      }
    }
    return consumed;
  }

  /** A live code wrapped in ANY other text — a NO before it included — licenses
   *  nothing and earns this notice on the delivery. */
  codeNotices(userText: string): readonly string[] {
    const given = userText.trim();
    return [...this.working.values()]
      .filter(s => s.state === 'open' && userText.includes(s.question.code)
        && given !== s.question.code)
      .map(() => 'To confirm, reply with only the code — nothing else.');
  }

  /** The stored executable call — engine-internal, never delivered. */
  held(id: string): CanonicalCallData {
    for (const stored of this.working.values()) {
      if (stored.question.id === id) return stored.executable;
    }
    throw new Error(`no held call for question '${id}'`);
  }

  open(): readonly Question[] {
    return [...this.working.values()].filter(s => s.state === 'open').map(s => s.question);
  }

  close(id: string, why: QuestionClose, draft: TurnDraft): void {
    for (const [key, stored] of this.working) {
      if (stored.question.id !== id || stored.state !== 'open') continue;
      this.working.set(key, { ...stored, state: { closed: why } });
      draft.closed.push({ id, why });
    }
  }

  /** An executed licensed act supersedes every open sibling for its (tool, target). */
  closeSiblings(tool: string, targetValue: string | null, exceptId: string,
                draft: TurnDraft): void {
    for (const stored of [...this.working.values()]) {
      if (stored.state !== 'open' || stored.question.id === exceptId) continue;
      if (stored.executable.tool !== tool || stored.targetValue !== targetValue) continue;
      this.close(stored.question.id, 'superseded', draft);
    }
  }

  /** Clock expiry runs BEFORE any answer is read: an expired code licenses
   *  nothing, however fast the reply after the five minutes lapse. */
  expireByClock(draft: TurnDraft): readonly Question[] {
    const expired: Question[] = [];
    for (const stored of [...this.working.values()]) {
      if (stored.state !== 'open') continue;
      if (this.now() - stored.bornAtMs >= QUESTION_TTL_MS) {
        this.close(stored.question.id, 'expired', draft);
        expired.push(stored.question);
      }
    }
    return expired;
  }

  /** Questions past the turn ttl OR the five-minute clock close 'expired' —
   *  the closure is DELIVERED. */
  sweep(turn: number, ttl: number, draft: TurnDraft): readonly Question[] {
    const expired: Question[] = [];
    for (const stored of [...this.working.values()]) {
      if (stored.state !== 'open') continue;
      if (turn - stored.question.bornAtTurn >= ttl
        || this.now() - stored.bornAtMs >= QUESTION_TTL_MS) {
        this.close(stored.question.id, 'expired', draft);
        expired.push(stored.question);
      }
    }
    return expired;
  }

  private mintCode(): string {
    for (;;) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const collides = [...this.working.values()]
        .some(s => s.state === 'open' && s.question.code === code);
      if (!collides) return code;
    }
  }
}
