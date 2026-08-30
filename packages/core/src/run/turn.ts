/** THE one turn machine. Sequences only, decides nothing. The phase-1 walk: input
 *  guards over the arrived text (a deny answers the turn with the guard's own
 *  sentence — no model call) → model loop (serial per-call execution in emission
 *  order, engine-enforced) → finish checks and bounded redrives → compose → seal.
 *  All mutation goes to the TurnDraft; Session.seal commits atomically; a
 *  TurnFailure discards the draft so a retry starts clean. */
import type { Act, ChatOpts, Msg, Question, RawCall, ReportLine, ToolCard, TurnRecord,
              TurnReturned } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { ModelPort, ToolPort, RecordsPort } from '../contract/ports.js';
import type { CompiledAgent } from '../cards/cards.js';
import { CallRunner } from './call-runner.js';
import { canonicalAmount, carriedIds, figureRuns } from '../cards/catalog.js';
import { assembleFacts } from './delivery-facts.js';
import { ReplyComposer } from './reply-composer.js';
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

/** The return door a routed delivery carries: the desk hands the message back to the
 *  front desk instead of serving it. It is the turn's opening move or nothing — once
 *  an act is on the record the door is closed, and a call to it is dropped with the
 *  refusal sentence on the draft. A returning turn composes no reply and seals
 *  nothing, so the front desk re-routes against the tape it already had — and the
 *  discarded draft's model calls ride back with the return, the only place they
 *  are ever named. */
const RETURN_TOOL = 'notMine';
const RETURN_CLOSED = 'the return door closed once work began';
const RETURN_CARD: ToolCard = {
  name: RETURN_TOOL,
  does: 'Return this message to the front desk: it is not this desk\'s to perform. '
    + 'Valid only before any act.',
  schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] }
};

/** What this turn's done reads returned, one JSON string per distinct result —
 *  the composer's material, his to use, never owed. */
/** The report line the record contradicts: among the acts of that tool (and target,
 *  where the line names one), NONE settled with the word the line claims. An act
 *  retried into a different standing supports the word it reached — the record's
 *  own history is not a contradiction of its outcome. */
export function contradictedLine(report: readonly ReportLine[], acts: readonly Act[]):
    ReportLine | undefined {
  const wordOf = (a: Act): string => a.status === 'done' ? 'done'
    : a.status === 'unknown' ? 'unknown'
    : a.reason === 'held' ? 'held' : 'refused';
  return report.find(line => {
    const matching = acts.filter(a => a.call.tool === line.tool
      && (line.target === '' || JSON.stringify(a.call.args).includes(line.target)));
    return matching.length > 0 && !matching.some(a => wordOf(a) === line.word);
  });
}

export function readMaterial(acts: readonly Act[]): readonly string[] {
  return [...new Set(acts
    .filter(a => a.effect === 'read' && a.status === 'done' && a.result !== null)
    .map(a => JSON.stringify(a.result)))];
}

/** A done read's identifiers are the record's answer. Prose that carries not one
 *  of them delivered nothing the reads returned — it pays a composer call with
 *  the material instead of shipping bare. Reads that return no identifiers (an
 *  empty log, a not-found) demand nothing. */
export function proseDropsReads(acts: readonly Act[], prose: string): boolean {
  const returned = new Set(readMaterial(acts).flatMap(m => carriedIds(m)));
  if (returned.size === 0) return false;
  const said = new Set(carriedIds(prose));
  return ![...returned].some(id => said.has(id));
}

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

  /** Built per run() on the metered port; delivers through compose, prose or floor. */
  private composer!: ReplyComposer;

  constructor(deps: TurnDeps) {
    this.deps = deps;
  }

  async run(session: Session, userText: string, opts: ChatOpts = {}):
    Promise<TurnRecord | TurnReturned> {
    const { compiled, seat, rulebook, masker, promptWriter: pw, finishDesk: fd, deliveryWriter: dw } = this.deps;
    const returnable = opts.returnable === true;
    const history = session.history;
    const desk = session.consent;
    const draft = session.draft();
    draft.userText = userText;
    draft.servedBy = seat.serving();
    draft.grounded.push(...(opts.grounded ?? []));
    // Every model call this turn — the main loop, the owed-read micro-step and the
    // judged pass alike — books its cost on the draft; zeros where the port has no
    // numbers.
    const seatPort = seat.port();
    const port: ModelPort = { step: async input => {
      const step = await seatPort.step(input);
      draft.usage.modelCalls += 1;
      draft.usage.inputTokens += step.usage?.inputTokens ?? 0;
      draft.usage.outputTokens += step.usage?.outputTokens ?? 0;
      draft.usage.cachedInputTokens += step.usage?.cachedInputTokens ?? 0;
      draft.usage.reasoningTokens += step.usage?.reasoningTokens ?? 0;
      return step;
    } };

    // The composer books its calls on the same metered port as every other step.
    this.composer = new ReplyComposer(port, seat.llmParams({}));

    const inputCtx = deepFreeze({ userText, turnActs: [...draft.acts], pastActs: history.pastActs() });
    const inputVerdict = rulebook.checkInput(inputCtx);
    if (inputVerdict.kind === 'refuse') {
      const rule = rulebook.guards().guards.find(g => g.name === inputVerdict.guardName)?.rule ?? '';
      draft.closedBy = 'engine';
      draft.delivery = { by: 'floor', retried: false, facts: [] };
      draft.text = masker.maskProse(
        dw.compose(`${rule} ${inputVerdict.detail}`.trim(), draft.acts, desk.open(), draft.closed));
      return session.seal(draft);
    }

    // What OTHER desks said since this desk's last visit rides in as plain text:
    // delivered words, no acts, nothing executable.
    const foreign = (opts.before ?? []).flatMap(x => [
      { role: 'user' as const, text: x.userText },
      { role: 'assistant' as const, text: x.replyText }
    ]);
    // The model's memory of a past turn is its delivered text; the LAST TWO turns
    // also carry their own record lines — what just ran and what did not, frames
    // the operator never sees. A delivered wording can drift; the record cannot,
    // and bounding it to two turns keeps the window's cost flat.
    const sealed = history.sealed();
    const recorded = new Set(sealed.slice(-2));
    const messages: Msg[] = [
      ...sealed.flatMap(r => [
        { role: 'user' as const, text: r.userText },
        { role: 'assistant' as const, text: !recorded.has(r) || r.acts.length === 0
          ? r.text
          : `${r.text}\n${r.acts.map(a => a.sentence).join('\n')}` }
      ]),
      ...foreign,
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
    // The five-minute clock is read before the answer: a lapsed code is gone.
    desk.expireByClock(draft);
    for (const q of desk.readAnswer(userText, draft)) {
      const held = desk.held(q.id);
      const act = await runner.run({ tool: held.tool, args: held.args }, 'licence', draft);
      if (act.status === 'done' || act.status === 'unknown') {
        desk.markExecuted(q.id, draft.turn, act.sentence, act.result);
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
    // The turn's opening move — the only place the return door is open.
    let opening = true;

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
        // The return door goes FIRST — the finish is last on every surface, and
        // forceFinish targets the last card.
        tools: returnable ? [RETURN_CARD, ...pw.toolCards(), fd.toolCard()]
          : [...pw.toolCards(), fd.toolCard()],
        forceFinish: forced,
        llmParams: seat.llmParams({})
      });
      const step = await port.step(stepInput);
      const split = fd.split(step.calls);
      const finish = split.finish;
      draft.corrections.push(...split.corrections);

      // The return, or the closed door. An opening return leaves the turn with no
      // record at all; every later one is dropped and the loop carries on. The draft
      // must be empty of EVERY kind of work the turn can have done before the model
      // spoke: an executed act, an approval the desk consumed, and a question the
      // desk closed — a decline runs no call, and dropping the draft would erase the
      // operator's own NO from every record there is.
      const returning = returnable ? split.domain.find(c => c.tool === RETURN_TOOL) : undefined;
      if (returning !== undefined) {
        if (opening && draft.acts.length === 0
          && draft.consumed.length === 0 && draft.closed.length === 0) {
          return deepFreeze({ returned: { reason: String(returning.args['reason'] ?? '') },
                             usage: { ...draft.usage } });
        }
        draft.corrections.push({ kind: 'returnRefused', detail: RETURN_CLOSED });
      }
      const domain = returning === undefined ? split.domain
        : split.domain.filter(c => c.tool !== RETURN_TOOL);
      opening = false;

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
        return await this.engineClose(session, draft);
      }

      if (finish !== null) {
        const judge = new Judge(port, seat.llmParams({}));
        const closed = await this.tryFinish(finish, draft, messages, history.pastActs(),
          desk.open(), [...desk.staleAnswers(userText, draft.turn), ...desk.laterTexts(draft.turn),
            ...desk.codeNotices(userText)], judge);
        if (closed === 'sealed') return session.seal(draft);
        retriesUsed += 1;
        if (retriesUsed > compiled.limits.retries) return await this.engineClose(session, draft);
        continue;
      }

      if (forced) return await this.engineClose(session, draft);
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
    // Every figure the message states is one the records carry: the user's words,
    // the turn's and the history's args, results and sentences, the open questions
    // and the notes. A figure worked out at the desk grounds on nothing.
    const evidence = new Set<string>();
    const feed = (t: string): void => {
      for (const run of figureRuns(t)) evidence.add(canonicalAmount(run));
    };
    feed(draft.userText);
    for (const m of messages) if (m.role === 'user') feed(m.text);
    for (const a of [...draft.acts, ...pastActs]) {
      feed(JSON.stringify(a.call.args));
      feed(JSON.stringify(a.result ?? null));
      feed(a.sentence);
    }
    for (const q of open) feed(`${q.code} ${q.sentence}`);
    for (const n of notes) feed(n);
    const ungrounded = [...new Set(figureRuns(parsed.finish.message).map(canonicalAmount))]
      .filter(x => !evidence.has(x));
    if (ungrounded.length > 0) {
      violations.push({ guardName: 'figureIsGrounded',
        detail: `the message states ${ungrounded.join(', ')} and no record this turn carries `
          + `${ungrounded.length > 1 ? 'them' : 'it'} — state only figures the records show, `
          + `written as the records write them` });
    }
    // A report line the settled record contradicts is known to disagree with what
    // happened: corrected, never delivered.
    const contradiction = contradictedLine(parsed.finish.report, draft.acts);
    if (contradiction !== undefined) {
      violations.push({ guardName: 'reportContradictsRecord',
        detail: `your report says ${contradiction.word} for ${contradiction.tool}; the record `
          + `disagrees — write every report line from the record, not from intention` });
    }
    // A judged guard declaring tools binds the same way the deterministic reply
    // walk does: it is asked only on a turn whose acts touched one of them.
    const acted = new Set(draft.acts.map(a => a.call.tool));
    const judgedBound = compiled.judged.filter(g => g.tools.length === 0
      || g.tools.some(t => acted.has(t)));
    if (violations.length === 0 && judgedBound.length > 0) {
      for (const v of await judge.run(judgedBound, replyCtx, messages)) {
        if (v.verdict === 'violation') {
          // The redrive must TEACH: the guard's own rule is the correction.
          const rule = compiled.judged.find(g => g.name === v.guardName)?.rule ?? '';
          violations.push({ guardName: v.guardName, detail: v.detail ?? rule });
        }
        if (v.verdict === 'unreadable') {
          // An answer nobody can read decides nothing, so the rule stands unmet and the
          // reply is corrected — a judged rule is never waved through on silence.
          draft.corrections.push({ kind: 'judgeUnreadable', guardName: v.guardName });
          violations.push({ guardName: v.guardName,
            detail: 'the judge answer was unreadable — treated as a violation' });
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
    // Nothing owed and no open question: the prose IS the delivery, no call spent —
    // unless it dropped every identifier its reads returned, which pays one
    // composer call with the material. Anything on the table: one composer call,
    // gated, floored on failure.
    const facts = assembleFacts(draft.acts, open, draft.closed, notes);
    const floor = (): string => dw.compose(parsed.finish.message, draft.acts, open,
      draft.closed, notes);
    const composed = facts.length === 0
      ? (proseDropsReads(draft.acts, parsed.finish.message)
        ? await this.composer.deliver(draft.userText, facts, parsed.finish.message,
            floor, readMaterial(draft.acts))
        : { text: parsed.finish.message, by: 'prose' as const, retried: false })
      : await this.composer.deliver(draft.userText, facts, parsed.finish.message, floor,
        readMaterial(draft.acts));
    draft.delivery = { by: composed.by, retried: composed.retried, facts };
    let text = composed.text;
    for (const rewrite of compiled.rewrites) text = rewrite.apply(text);
    draft.text = this.deps.masker.maskProse(text);
    return 'sealed';
  }

  private async engineClose(session: Session, draft: TurnDraft): Promise<TurnRecord> {
    const { finishDesk: fd, deliveryWriter: dw } = this.deps;
    draft.corrections.push({ kind: 'forcedFinish' });
    draft.closedBy = 'engine';
    draft.finish = null;
    const open = session.consent.open();
    const notes = [...session.consent.staleAnswers(draft.userText, draft.turn),
      ...session.consent.laterTexts(draft.turn),
      ...session.consent.codeNotices(draft.userText)];
    const facts = assembleFacts(draft.acts, open, draft.closed, notes);
    const floor = (): string => dw.compose(fd.closure(draft.acts), draft.acts, open,
      draft.closed, notes);
    // The desk never spoke this turn, so what its reads returned has no prose to
    // ride: the results go to the composer as material — his to use, never owed.
    const material = readMaterial(draft.acts);
    const composed = facts.length === 0
      ? { text: floor(), by: 'floor' as const, retried: false }
      : await this.composer.deliver(draft.userText, facts, '', floor, material);
    draft.delivery = { by: composed.by, retried: composed.retried, facts };
    let text = composed.text;
    for (const rewrite of this.deps.compiled.rewrites) text = rewrite.apply(text);
    draft.text = this.deps.masker.maskProse(text);
    return session.seal(draft);
  }
}
