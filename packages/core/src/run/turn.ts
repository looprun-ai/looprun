/** THE one turn machine. Sequences only, decides nothing. The phase-1 walk: input
 *  guards over the arrived text (a deny answers the turn with the guard's own
 *  sentence — no model call) → model loop (serial per-call execution in emission
 *  order, engine-enforced) → finish checks and bounded redrives → compose → seal.
 *  All mutation goes to the TurnDraft; Session.seal commits atomically; a
 *  TurnFailure discards the draft so a retry starts clean. */
import type { Act, Msg, Question, RawCall, TurnRecord } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { ToolPort, RecordsPort } from '../contract/ports.js';
import type { CompiledAgent } from '../cards/cards.js';
import { CallRunner } from './call-runner.js';
import { DisclosureDesk } from './disclosure-desk.js';
import { Judge } from './judge.js';
import type { Masker } from './masker.js';
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
  readonly masker: Masker;
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
    const { compiled, seat, rulebook, masker, promptWriter: pw, finishDesk: fd, deliveryWriter: dw } = this.deps;
    const history = session.history;
    const desk = session.consent;
    const draft = session.draft();
    draft.userText = userText;
    draft.servedBy = seat.serving();
    const port = seat.port();

    const inputCtx = deepFreeze({ userText, turnActs: [...draft.acts], pastActs: history.pastActs() });
    const inputVerdict = rulebook.checkInput(inputCtx);
    if (inputVerdict.kind === 'refuse') {
      const rule = rulebook.guards().guards.find(g => g.name === inputVerdict.guardName)?.rule ?? '';
      draft.closedBy = 'engine';
      draft.text = masker.maskProse(
        dw.compose(`${rule} ${inputVerdict.detail}`.trim(), draft.acts, desk.open(), draft.closed));
      return session.seal(draft);
    }

    const messages: Msg[] = [
      ...history.sealed().flatMap(r => [
        { role: 'user' as const, text: r.userText },
        { role: 'assistant' as const, text: r.text }
      ]),
      { role: 'user', text: userText }
    ];

    // The owed-read micro-step: same frozen system prefix, the same state tail the
    // main steps carry, the conversation so far, and a SINGLE tool on the surface —
    // the model fills the args, and can do nothing else.
    const microStep = async (read: { tool: string }, held: { tool: string; args: unknown }):
      Promise<RawCall | null> => {
      const card = pw.toolCards().find(t => t.name === read.tool);
      if (!card) return null;
      const instruction = `A rule requires ${read.tool} to run before ${held.tool}. `
        + `Choose the arguments from the conversation, the state, and the held call `
        + `${held.tool} ${JSON.stringify(held.args)}, and call ${read.tool} now — nothing else.`;
      const microRaw = this.deps.recordsPort?.snapshot() ?? null;
      const microNote = this.deps.compiled.facts.note ?? null;
      const microVisible = this.deps.compiled.facts.tail ?? null;
      const microShown = microRaw === null ? null
        : microVisible === null ? microRaw
        : Object.fromEntries(Object.entries(microRaw).filter(([e]) => microVisible.includes(e)));
      const microState = microRaw !== null && microNote !== null ? microNote(microRaw)
        : microShown === null ? null : masker.maskState(microShown);
      const microTail = pw.tail(userText, microState, desk.open());
      const step = await port.step(deepFreeze({
        system: microTail === '' ? pw.system() : `${pw.system()}\n${microTail}`,
        messages: [...messages, { role: 'user' as const, text: instruction }],
        tools: [card],
        forceFinish: false,
        llmParams: seat.llmParams({})
      }));
      return step.calls.find(c => c.tool === read.tool) ?? null;
    };
    const runner = new CallRunner({ compiled, rulebook, clerk: this.deps.clerk, history,
      toolPort: this.deps.toolPort, recordsPort: this.deps.recordsPort,
      consent: desk, masker, disclosure: new DisclosureDesk(compiled.disclosureBindings),
      revoked: session.revokedSimulations, microStep });

    // A consumed approval executes ENGINE-side, before the model speaks: the desk
    // holds the executable call, so a paraphrase can never drift the args. The
    // executed act supersedes every open sibling for its (tool, target). The answer
    // is read BEFORE the sweep — the user typed against the delivery where the code
    // was live, so an approval landing in the expiring turn still lands.
    for (const q of desk.readAnswer(userText, draft)) {
      const held = desk.held(q.id);
      const act = await runner.run({ tool: held.tool, args: held.args }, 'licence', draft);
      if (act.status === 'done' || act.status === 'unknown') {
        desk.markExecuted(q.id, draft.turn, act.sentence);
        const fact = compiled.facts.tools[held.tool];
        const targetRaw = fact?.target != null ? held.args[fact.target] : undefined;
        desk.closeSiblings(held.tool, typeof targetRaw === 'string' ? targetRaw : null, q.id, draft);
      }
    }
    if (draft.acts.length > 0) {
      messages.push({ role: 'acts', acts: [...draft.acts] });
    }
    desk.sweep(draft.turn, compiled.limits.questionTurns, draft);

    let callsUsed = 0;
    let retriesUsed = 0;
    let forced = false;

    for (;;) {
      const raw = this.deps.recordsPort?.snapshot() ?? null;
      // The declared NOTE outranks any record dump: the world speaks its
      // whole-turn conditions in sentences, identifiers withheld.
      const note = compiled.facts.note ?? null;
      const visible = compiled.facts.tail ?? null;
      const shown = raw === null ? null
        : visible === null ? raw
        : Object.fromEntries(Object.entries(raw).filter(([entity]) => visible.includes(entity)));
      const state = raw !== null && note !== null ? note(raw)
        : shown === null ? null : masker.maskState(shown);
      const tail = pw.tail(userText, state, desk.open());
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

      const actsBefore = draft.acts.length;
      for (const call of domain) {
        // A forced turn has one move left — the finish; disobedient calls never run.
        if (forced) break;
        if (callsUsed >= compiled.limits.calls) { forced = true; continue; }
        // The FIRST question ends the exchange: later calls in the same emission
        // never run — one ask, one answer, one turn.
        if (draft.acts.slice(actsBefore).some(a => a.reason === 'held' && a.questionId !== null)) {
          break;
        }
        callsUsed += 1;
        await runner.run(call, 'model', draft);
      }
      // The model SEES what its calls did — results and denials alike — so it can
      // react within this turn's own ceilings.
      if (draft.acts.length > actsBefore) {
        messages.push({ role: 'acts', acts: draft.acts.slice(actsBefore) });
      }
      // A newly raised question closes the turn from the engine's side: the ask
      // IS the turn's outcome, and every further model step would be spent
      // re-proposing the very call the question already carries.
      if (draft.acts.slice(actsBefore).some(a => a.reason === 'held' && a.questionId !== null)) {
        return this.engineClose(session, draft);
      }

      if (finish !== null) {
        const judge = new Judge(port, seat.llmParams({}));
        const closed = await this.tryFinish(finish, draft, messages, history.pastActs(),
          desk.open(), [...desk.staleAnswers(userText, draft.turn), ...desk.laterTexts(draft.turn)], judge);
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

  /** 'sealed' = the finish landed clean · 'redrive' = correction sent. The reply
   *  pipe: deterministic checks (honesty included) → the judged pass on the
   *  session's own seat → rewrites → prose scrub → compose. */
  private async tryFinish(finish: RawCall, draft: TurnDraft, messages: Msg[],
                          pastActs: readonly Act[], open: readonly Question[],
                          notes: readonly string[],
                          judge: Judge): Promise<'sealed' | 'redrive'> {
    const { compiled, rulebook, finishDesk: fd, deliveryWriter: dw, promptWriter: pw } = this.deps;
    const parsed = fd.parse(finish.args);
    if (!parsed.ok) {
      messages.push({ role: 'user', text: pw.correction([parsed.detail]) });
      return 'redrive';
    }
    const replyCtx = deepFreeze({
      message: parsed.finish.message, report: parsed.finish.report,
      userText: draft.userText, turnActs: [...draft.acts], pastActs
    });
    const violations = [...rulebook.checkReply(replyCtx)];
    if (violations.length === 0 && compiled.judged.length > 0) {
      for (const v of await judge.run(compiled.judged, replyCtx, messages)) {
        if (v.verdict === 'violation') {
          // The redrive must TEACH: the guard's own rule is the correction.
          const rule = compiled.judged.find(g => g.name === v.guardName)?.rule ?? '';
          violations.push({ guardName: v.guardName, detail: v.detail ?? rule });
        }
        if (v.verdict === 'unreadable') {
          draft.corrections.push({ kind: 'judgeUnreadable', guardName: v.guardName });
          const policy = compiled.judged.find(g => g.name === v.guardName)?.judgePolicy;
          if (policy !== 'passOnFails') {
            violations.push({ guardName: v.guardName,
              detail: 'the judge answer was unreadable — treated as a violation' });
          }
        }
      }
    }
    if (violations.length > 0) {
      for (const v of violations) draft.corrections.push({ kind: 'redrive', guardName: v.guardName, detail: v.detail });
      // The model EDITS its rejected finish rather than regenerating blind: the
      // attempt rides back as its own words, the correction names what to change.
      messages.push({ role: 'assistant', text: `My finish attempt:\n${parsed.finish.message}\nreport: ${
        parsed.finish.report.map(r => `${r.tool} ${r.target}: ${r.word}`).join(' · ') || '(no rows)'}` });
      messages.push({ role: 'user', text: pw.correction(violations.map(v => v.detail)) });
      return 'redrive';
    }
    draft.finish = parsed.finish;
    draft.closedBy = 'model';
    let text = dw.compose(parsed.finish.message, draft.acts, open, draft.closed, notes);
    for (const rewrite of compiled.rewrites) text = rewrite.apply(text);
    draft.text = this.deps.masker.maskProse(text);
    return 'sealed';
  }

  private engineClose(session: Session, draft: TurnDraft): TurnRecord {
    const { finishDesk: fd, deliveryWriter: dw } = this.deps;
    draft.corrections.push({ kind: 'forcedFinish' });
    draft.closedBy = 'engine';
    draft.finish = null;
    let text = dw.compose(fd.closure(draft.acts), draft.acts,
      session.consent.open(), draft.closed,
      [...session.consent.staleAnswers(draft.userText, draft.turn), ...session.consent.laterTexts(draft.turn)]);
    for (const rewrite of this.deps.compiled.rewrites) text = rewrite.apply(text);
    draft.text = this.deps.masker.maskProse(text);
    return session.seal(draft);
  }
}
