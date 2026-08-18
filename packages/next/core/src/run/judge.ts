/** The ONLY model-judged escape: composes each declared judgeQuery into a one-step,
 *  closed-format yes/no and sends it through the session's OWN seat — no JudgePort
 *  exists, so no interface can carry a third-party endpoint. The composed question
 *  may quote the sealed history; guards read the user's text only as exact literals —
 *  judging MEANING happens here, on the session's own seat. The answer format is
 *  fixed tokens; UNREADABLE is a first-class verdict priced by the guard's declared
 *  judgePolicy. */
import type { LlmParams, Msg, ReplyCtx } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { ModelPort } from '../contract/ports.js';
import type { JudgedGuard } from '../cards/cards.js';

export interface JudgeVerdict { readonly guardName: string;
                                readonly verdict: 'violation' | 'none' | 'unreadable';
                                readonly detail: string | null }

const SYSTEM = 'You are checking ONE rule against ONE reply. '
  + 'Answer with exactly one word: YES if the rule is violated, NO if it is not.';

export class Judge {
  private readonly port: ModelPort;
  private readonly llmParams: LlmParams;

  constructor(port: ModelPort, llmParams: LlmParams) {
    this.port = port;
    this.llmParams = llmParams;
  }

  async run(guards: readonly JudgedGuard[], ctx: ReplyCtx,
            history: readonly Msg[]): Promise<readonly JudgeVerdict[]> {
    const verdicts: JudgeVerdict[] = [];
    for (const guard of guards) {
      const question = [
        `RULE: ${guard.rule}`,
        `QUESTION: ${guard.judgeQuery}`,
        `THE USER SAID: ${ctx.userText}`,
        `THE REPLY: ${ctx.message}`,
        `THE REPORT: ${JSON.stringify(ctx.report)}`,
        `THE RECORDED ACTS: ${ctx.turnActs.map(a => a.sentence).join(' · ') || 'none'}`,
        'Answer exactly YES or NO.'
      ].join('\n');
      const step = await this.port.step(deepFreeze({
        system: SYSTEM,
        messages: [...history, { role: 'user' as const, text: question }],
        tools: [],
        forceFinish: false,
        llmParams: this.llmParams
      }));
      let word = '';
      for (const c of step.text.trim()) {
        if (c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '.') break;
        word += c;
      }
      word = word.toUpperCase();
      verdicts.push(word === 'YES'
        ? { guardName: guard.name, verdict: 'violation',
            detail: 'the judge answered YES to the declared question' }
        : word === 'NO'
          ? { guardName: guard.name, verdict: 'none', detail: null }
          : { guardName: guard.name, verdict: 'unreadable', detail: null });
    }
    return verdicts;
  }
}
