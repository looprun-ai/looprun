/** Composes the delivered text: the model's prose, one record line per act (reads
 *  included — the result decides what prints), every open question with its code in
 *  EVERY delivery, every denial, every question closure. Every engine-known fact
 *  reaches the user deterministically — never only through model prose. */
import type { Act, Question, QuestionClose } from '../contract/vocabulary.js';

export class DeliveryWriter {
  compose(message: string, acts: readonly Act[], open: readonly Question[],
          closed: readonly { readonly id: string; readonly why: QuestionClose }[]): string {
    const lines: string[] = [];
    if (message !== '') lines.push(message);
    for (const act of acts) lines.push(act.sentence);
    for (const q of open) lines.push(`[${q.code}] ${q.sentence}`);
    for (const c of closed) lines.push(`Question ${c.id} closed: ${c.why}.`);
    return lines.join('\n');
  }
}
