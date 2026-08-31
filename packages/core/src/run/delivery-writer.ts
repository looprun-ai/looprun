/** The deterministic FLOOR of delivery: the prose, one record line per act (reads
 *  included — the result decides what prints), every open question with its code,
 *  every denial, every question closure. The desk's own words deliver above this;
 *  when the desk cannot carry every fact, this floor does — nothing engine-known is
 *  ever lost. */
import type { Act, Question, QuestionClose } from '../contract/vocabulary.js';

export class DeliveryWriter {
  compose(message: string, acts: readonly Act[], open: readonly Question[],
          closed: readonly { readonly id: string; readonly why: QuestionClose }[],
          notes: readonly string[] = []): string {
    const lines: string[] = [];
    if (message !== '') lines.push(message);
    for (const act of acts) lines.push(act.sentence);
    for (const note of notes) lines.push(note);
    for (const q of open) lines.push(`[${q.code}] ${q.sentence}`);
    for (const c of closed) lines.push(`Question ${c.id} closed: ${c.why}.`);
    return lines.join('\n');
  }
}
