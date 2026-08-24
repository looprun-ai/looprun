/** Composes the delivered text: the desk's prose, then the engine's own record — one
 *  line per call, never two. A call that ran and a later refusal to run it again are
 *  ONE act on the record, and the act that changed the world is the one that speaks.
 *  A write that ran speaks its whole declared sentence — the receipt of a world
 *  change. A refusal prints its rule, because the rule is the news. A read that ran
 *  prints only on a turn that puts a question up: the reads are the evidence the
 *  decision is asked over. Every open question rides every delivery with its code;
 *  every question closure prints. */
import type { Act, Question, QuestionClose } from '../contract/vocabulary.js';
import { canonicalAmount, figureRuns } from '../cards/catalog.js';

const idsOf = (text: string): readonly string[] => text.match(/[a-z]+_[a-z0-9]*[0-9][a-z0-9]*/g) ?? [];
const amountsOf = (text: string): ReadonlySet<string> =>
  new Set(figureRuns(text).map(canonicalAmount));

/** The operator reads facts, not tool frames: the delivery strips the
 *  'tool(target) — status.' prefix and speaks the sentence body alone; a refusal
 *  speaks the rule inside its parentheses. A line that would strip to nothing keeps
 *  its original form — something must say what happened. */
function unframed(sentence: string): string {
  const refusal = sentence.match(/^[a-zA-Z]+\([^)]*\) — not-done \((.+)\)$/s);
  if (refusal !== null && refusal[1].trim() !== '') return refusal[1].trim();
  const done = sentence.match(/^[a-zA-Z]+\([^)]*\) — [a-z-]+\.?\s*(.*)$/s);
  if (done !== null && done[1].trim() !== '') return done[1].trim();
  return sentence;
}

/** The prose covers a record sentence when every id and every figure the sentence
 *  states already appears in the prose — then the sentence has nothing to add. */
function covers(message: string, sentence: string): boolean {
  if (message === '') return false;
  for (const id of idsOf(sentence)) if (!message.includes(id)) return false;
  const said = amountsOf(message);
  for (const figure of amountsOf(sentence)) if (!said.has(figure)) return false;
  return true;
}

const RANK: Readonly<Record<string, number>> = { done: 3, unknown: 2, held: 1, refused: 0 };

const wordOf = (a: Act): string =>
  a.status === 'done' ? 'done'
  : a.status === 'unknown' ? 'unknown'
  : a.reason === 'held' ? 'held' : 'refused';

export class DeliveryWriter {
  compose(message: string, acts: readonly Act[], open: readonly Question[],
          closed: readonly { readonly id: string; readonly why: QuestionClose }[],
          notes: readonly string[] = [], rich = false): string {
    const lines: string[] = [];
    if (message !== '') lines.push(message);
    for (const act of this.record(acts, rich, message)) lines.push(act);
    for (const note of notes) lines.push(note);
    for (const q of open) {
      // Prose that carries the ask's own statement word for word, and its code, IS the
      // approval line — nothing is left for the engine to add.
      if (message.includes(q.code) && message.includes(q.sentence)) continue;
      lines.push(`[${q.code}] ${q.sentence}`);
    }
    for (const c of closed) lines.push(`Question ${c.id} closed: ${c.why}.`);
    // Every block breathes: the prose, each record fact, each question — one
    // paragraph apiece.
    return lines.join('\n\n');
  }

  /** What the MODEL re-reads as its own past turn: the prose it wrote plus every
   *  settled act sentence, reads included — the delivery slims for the operator, and
   *  the model's memory never does. */
  modelView(message: string, acts: readonly Act[], open: readonly Question[]): string {
    const lines: string[] = [];
    if (message !== '') lines.push(message);
    for (const a of this.settled(acts)) {
      if (wordOf(a) === 'held') continue;
      lines.push(a.sentence);
    }
    for (const q of open) lines.push(`[${q.code}] ${q.sentence}`);
    return lines.join('\n');
  }

  /** One act per call: a call that ran and a later refusal to run it again are one
   *  act on the record, and the act that changed the world is the one that stands. */
  settled(acts: readonly Act[]): readonly Act[] {
    const strongest = new Map<string, Act>();
    for (const a of acts) {
      const held = strongest.get(a.call.key);
      if (held === undefined || RANK[wordOf(a)] > RANK[wordOf(held)]) strongest.set(a.call.key, a);
    }
    return [...strongest.values()];
  }

  /** One line per call, and only where the prose left a fact out: a sentence whose
   *  every id and figure the prose already states prints nothing. A successful read
   *  is the model's memory, not the operator's — except a pure-text read (no id, no
   *  figure: a policy, a rule) on a turn that puts a question up: that quote is the
   *  ground the decision is asked on, and no fact-check can see it in the prose. */
  private record(acts: readonly Act[], rich: boolean, message = ''): readonly string[] {
    const asking = acts.some(a => a.reason === 'held' && a.questionId !== null);
    const lines: string[] = [];
    for (const a of this.settled(acts)) {
      const word = wordOf(a);
      if (a.effect === 'read' && word === 'done') {
        const pureText = idsOf(a.sentence).length === 0 && amountsOf(a.sentence).size === 0;
        // The quote is the ground the ask stands on: fact-coverage cannot see it in
        // the prose, so vacuous coverage never hides it.
        if (asking && pureText) lines.push(unframed(a.sentence));
        continue;
      }
      if (word === 'held') continue;
      if (!rich && covers(message, a.sentence)) continue;
      lines.push(unframed(a.sentence));
    }
    return lines;
  }
}
