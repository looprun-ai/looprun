/** The deterministic FLOOR of delivery, spoken: the prose, one SENTENCE per act
 *  (reads included — the result decides what prints), every open question with its
 *  code inside the engine's human instruction, every question closure. The desk's own
 *  words deliver above this; when the desk cannot carry every fact, this floor does —
 *  nothing engine-known is ever lost, and no act-log line or bare code reaches the
 *  operator. */
import type { Act, Question, QuestionClose } from '../contract/vocabulary.js';
import { spokenActSentence } from './delivery-facts.js';

export class DeliveryWriter {
  compose(message: string, acts: readonly Act[], open: readonly Question[],
          closed: readonly { readonly id: string; readonly why: QuestionClose }[],
          notes: readonly string[] = []): string {
    const lines: string[] = [];
    if (message !== '') lines.push(message);
    for (const act of acts) lines.push(spokenActSentence(act.sentence));
    for (const note of notes) lines.push(note);
    for (const q of open) {
      lines.push(`${q.sentence} To proceed, send just this code: ${q.code}.`);
    }
    for (const c of closed) lines.push(`Question ${c.id} closed: ${c.why}.`);
    return lines.join('\n');
  }
}
