/** The turn's owed words as labeled facts, assembled pure: act facts in act order,
 *  then every open question as an ask fact and its code fact, then the question
 *  closures, then the notes — the same order the floor delivery prints. Each fact
 *  carries the state the composer must agree with; no fact names an internal tool. */
import type { Act, Question, QuestionClose } from '../contract/vocabulary.js';

export interface DeliveryFact {
  readonly kind: 'ask' | 'code' | 'receipt' | 'refusal' | 'closure' | 'note';
  readonly text: string;
  readonly state: 'ran' | 'refused' | 'held' | null;
}

export function assembleFacts(acts: readonly Act[], open: readonly Question[],
  closed: readonly { readonly id: string; readonly why: QuestionClose }[],
  notes: readonly string[]): readonly DeliveryFact[] {
  const facts: DeliveryFact[] = [];
  for (const a of acts) {
    // An owed text still carrying a slot has nothing true to say: it never
    // becomes a fact — a placeholder never reaches the operator.
    if (a.owed !== null && a.owed.text.includes('{')) continue;
    if (a.owed !== null) {
      facts.push({ kind: a.owed.kind, text: a.owed.text,
        state: a.owed.kind === 'receipt' ? 'ran' : 'refused' });
      continue;
    }
    // A done act that changed the world is never silent: with no authored after,
    // the act's own record line is the receipt — the reply may say less than the
    // record, never the opposite of it.
    if (a.status === 'done' && a.effect !== 'read') {
      facts.push({ kind: 'receipt', text: a.sentence, state: 'ran' });
    }
  }
  for (const q of open) {
    facts.push({ kind: 'ask', text: q.sentence, state: 'held' });
    facts.push({ kind: 'code', text: q.code, state: null });
  }
  for (const c of closed) {
    facts.push({ kind: 'closure', text: `Question ${c.id} closed: ${c.why}.`, state: null });
  }
  for (const n of notes) facts.push({ kind: 'note', text: n, state: null });
  return facts;
}
