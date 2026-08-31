/** The turn's owed words as labeled facts, assembled pure: act facts in act order,
 *  then every open question as an ask fact and its code fact, then the question
 *  closures, then the notes — the same order the floor delivery prints. Each fact
 *  carries the state the reply must agree with; no fact names an internal tool.
 *
 *  A fact is NUMBERED by its position: F1, F2, F3 … The desk reads the numbered
 *  block before it writes, and its finish names the ids its message expresses. The
 *  ids are the engine's own labels — they never reach the operator. */
import type { Act, Question, QuestionClose } from '../contract/vocabulary.js';

export interface DeliveryFact {
  readonly kind: 'ask' | 'code' | 'receipt' | 'refusal' | 'closure' | 'note';
  readonly text: string;
  readonly state: 'ran' | 'refused' | 'held' | null;
}

/** What the reply must agree with about a fact whose act has a standing. */
export const STATE_TAG: Readonly<Record<'ran' | 'refused' | 'held', string>> = {
  ran: 'THIS RAN and took effect this turn',
  refused: 'this did NOT run — the records refuse it',
  held: 'this has NOT run — it stands held awaiting the operator\'s code. '
    + 'Use NO past tense about this act in any wording: not done, not processed, '
    + 'not recorded, not started, not "as requested" — it is waiting, nothing more'
};

/** The id a fact carries in the prompt and in the finish: F1, F2, F3 … */
export function factId(index: number): string {
  return `F${String(index + 1)}`;
}

/** The owed facts as the desk reads them — one numbered line each. */
export function numberedFactLines(facts: readonly DeliveryFact[]): string {
  return facts.map((f, i) => f.kind === 'code'
    ? `[${factId(i)}] The approval code for the ask above is: ${f.text} — the operator must send it alone.`
    : `[${factId(i)}] ${f.state === null ? '' : `[${STATE_TAG[f.state]}] `}${f.text}`).join('\n');
}

/** The ids a finish names, read the way a label is read: surrounding space is not part
 *  of an id and neither is the case of its letter. */
function claimedIds(claimed: readonly string[]): readonly string[] {
  return [...new Set(claimed.map(id => id.trim().toUpperCase()).filter(id => id !== ''))];
}

/** Every fact id the finish fails to name. Token comparison only — no word is read. */
export function factIdMisses(claimed: readonly string[], facts: readonly DeliveryFact[]):
  readonly string[] {
  const named = claimedIds(claimed);
  return facts.map((_, i) => factId(i)).filter(id => !named.includes(id));
}

/** Every id the finish names that this turn owes no fact for. A finish that claims an
 *  id the prompt never numbered has told the engine about a sentence that does not
 *  exist, and the whole list is worth as much as its worst entry. */
export function unowedFactIds(claimed: readonly string[], facts: readonly DeliveryFact[]):
  readonly string[] {
  const owed = facts.map((_, i) => factId(i));
  return claimedIds(claimed).filter(id => !owed.includes(id));
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
