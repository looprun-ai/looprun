/** THE one turn machine. Sequences only, decides nothing. The phase-1 walk: input
 *  guards over the arrived text (a deny answers the turn with the guard's own
 *  sentence — no model call) → model loop (serial per-call execution in emission
 *  order, engine-enforced) → finish checks and bounded redrives → compose → seal.
 *  All mutation goes to the TurnDraft; Session.seal commits atomically; a
 *  TurnFailure discards the draft so a retry starts clean. */
import type { Act, Msg, RawCall, TurnRecord } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { ToolPort, RecordsPort } from '../contract/ports.js';
import type { CompiledAgent } from '../cards/cards.js';
import { CallRunner } from './call-runner.js';
import type { Rulebook } from './rulebook.js';
import type { StatusClerk } from './status-clerk.js';
import type { ModelSeat } from './model-seat.js';
import type { PromptWriter } from './prompt-writer.js';
import type { FinishDesk } from './finish-desk.js';
import type { DeliveryWriter } from './delivery-writer.js';
import type { Session, TurnDraft } from './session.js';

export interface TurnDeps {
  readonly compiled: CompiledAgent;
  readonly seat: ModelSeat;
  readonly toolPort: ToolPort;
  readonly recordsPort: RecordsPort | null;
  readonly rulebook: Rulebook;
  readonly clerk: StatusClerk;
  readonly promptWriter: PromptWriter;
  readonly finishDesk: FinishDesk;
  readonly deliveryWriter: DeliveryWriter;
}

export class Turn {
  private readonly deps: TurnDeps;

  constructor(deps: TurnDeps) {
    this.deps = deps;
  }

  async run(session: Session, userText: string): Promise<TurnRecord> {
    const { compiled, seat, rulebook, promptWriter: pw, finishDesk: fd, deliveryWriter: dw } = this.deps;
    const history = session.history;
    const draft = session.draft();
    draft.userText = userText;
    draft.servedBy = seat.serving();
    const port = seat.port();
    const runner = new CallRunner({ compiled, rulebook, clerk: this.deps.clerk, history,
      toolPort: this.deps.toolPort, recordsPort: this.deps.recordsPort });

    const inputCtx = deepFreeze({ userText, turnActs: [...draft.acts], pastActs: history.pastActs() });
    const inputVerdict = rulebook.checkInput(inputCtx);
    if (inputVerdict.kind === 'refuse') {
      const rule = rulebook.guards().guards.find(g => g.name === inputVerdict.guardName)?.rule ?? '';
      draft.closedBy = 'engine';
      draft.text = dw.compose(`${rule} ${inputVerdict.detail}`.trim(), draft.acts, [], []);
      return session.seal(draft);
    }

    const messages: Msg[] = [
      ...history.sealed().flatMap(r => [
        { role: 'user' as const, text: r.userText },
        { role: 'assistant' as const, text: r.text }
      ]),
      { role: 'user', text: userText }
    ];

    let callsUsed = 0;
    let retriesUsed = 0;
    let forced = false;

    for (;;) {
      const state = this.deps.recordsPort?.snapshot() ?? null;
      const tail = pw.tail(userText, state, []);
      const stepInput = deepFreeze({
        system: tail === '' ? pw.system() : `${pw.system()}\n${tail}`,
        messages: [...messages],
        tools: [...pw.toolCards(), fd.toolCard()],
        forceFinish: forced,
        llmParams: seat.llmParams({})
      });
      const step = await port.step(stepInput);
      const { domain, finish, corrections } = fd.split(step.calls);
      draft.corrections.push(...corrections);

      for (const call of domain) {
        if (callsUsed >= compiled.limits.calls) { forced = true; continue; }
        callsUsed += 1;
        await runner.run(call, 'model', draft);
      }

      if (finish !== null) {
        const closed = this.tryFinish(finish, draft, messages, history.pastActs());
        if (closed === 'sealed') return session.seal(draft);
        retriesUsed += 1;
        if (retriesUsed > compiled.limits.retries) return this.engineClose(session, draft);
        continue;
      }

      if (forced) return this.engineClose(session, draft);
      if (callsUsed >= compiled.limits.calls || domain.length === 0) {
        forced = true;
        messages.push({ role: 'user', text: fd.force() });
      }
    }
  }

  /** 'sealed' = the finish landed clean · 'redrive' = correction sent. */
  private tryFinish(finish: RawCall, draft: TurnDraft, messages: Msg[],
                    pastActs: readonly Act[]): 'sealed' | 'redrive' {
    const { rulebook, finishDesk: fd, deliveryWriter: dw, promptWriter: pw } = this.deps;
    const parsed = fd.parse(finish.args);
    if (!parsed.ok) {
      messages.push({ role: 'user', text: pw.correction([parsed.detail]) });
      return 'redrive';
    }
    const replyCtx = deepFreeze({
      message: parsed.finish.message, report: parsed.finish.report,
      userText: draft.userText, turnActs: [...draft.acts], pastActs
    });
    const violations = rulebook.checkReply(replyCtx);
    if (violations.length > 0) {
      for (const v of violations) draft.corrections.push({ kind: 'redrive', guardName: v.guardName, detail: v.detail });
      messages.push({ role: 'user', text: pw.correction(violations.map(v => v.detail)) });
      return 'redrive';
    }
    draft.finish = parsed.finish;
    draft.closedBy = 'model';
    draft.text = dw.compose(parsed.finish.message, draft.acts, [], []);
    return 'sealed';
  }

  private engineClose(session: Session, draft: TurnDraft): TurnRecord {
    const { finishDesk: fd, deliveryWriter: dw } = this.deps;
    draft.corrections.push({ kind: 'forcedFinish' });
    draft.closedBy = 'engine';
    draft.finish = null;
    draft.text = dw.compose(fd.closure(draft.acts), draft.acts, [], []);
    return session.seal(draft);
  }
}
