/** THE one turn machine. Sequences only, decides nothing. The phase-1 walk: input
 *  guards over the arrived text (a deny answers the turn with the guard's own
 *  sentence — no model call) → model loop (serial per-call execution in emission
 *  order, engine-enforced) → finish checks and bounded redrives → the figure walk and
 *  the prose reader over the DELIVERED words (both close paths; the floor is literal
 *  and exempt) → seal. All mutation goes to the TurnDraft; Session.seal commits
 *  atomically; a TurnFailure discards the draft so a retry starts clean.
 *
 *  ONE writer answers the operator: the desk, in the conversation it has been reading.
 *  The turn's OWED FACTS gate its message — they ride numbered in the prompt, the
 *  finish names the ids its message expresses, and a miss redrives the same model on
 *  the same prefix with the record's own sentence quoted back. When the ENGINE closes
 *  the turn — a consent question raised, the retries spent — the desk is given one
 *  more step on that same prefix to write the closing reply, and the same funnel
 *  charges it. */
import type { Act, ChatOpts, Correction, FinishPayload, Msg, Question, RawCall, ReportLine,
              StepInput, ToolCard, TurnRecord, TurnReturned } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { ModelPort, ToolPort, RecordsPort } from '../contract/ports.js';
import type { CompiledAgent } from '../cards/cards.js';
import { CallRunner } from './call-runner.js';
import { canonicalAmount, carriedIds, figureRuns } from '../cards/catalog.js';
import { assembleFacts, closeInstruction, engineLabels, factIdMisses, gateMisses,
         isCodeShaped, unowedFactIds, withoutFactLabels } from './delivery-facts.js';
import type { DeliveryFact } from './delivery-facts.js';
import { languageReference, readProse } from './prose-reader.js';
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

/** What the records of this turn carry, harvested once: every canonical AMOUNT and
 *  every IDENTIFIER. The sources are the OPERATOR'S own messages, the turn's and the
 *  history's args, results and sentences, and the turn's own owed facts — every line
 *  the engine mints and demands the reply carry is a record the reply may stand on.
 *  The engine's own corrections are not records and never ground anything — a figure
 *  named in a redrive stays as ungrounded as it was. */
export interface GroundedRecords {
  readonly amounts: ReadonlySet<string>;
  readonly ids: ReadonlySet<string>;
}

export function groundedRecords(operatorTexts: readonly string[], acts: readonly Act[],
                                facts: readonly DeliveryFact[]): GroundedRecords {
  const amounts = new Set<string>();
  const ids = new Set<string>();
  // A record's IDENTIFIERS leave its text before its figures are counted, the same walk
  // the delivered side performs: the digits painted inside `inv_7001` are that invoice's
  // name, and they ground no amount — a reply stating 7001 as a balance answers for it.
  const feed = (t: string): void => {
    let bare = t;
    for (const id of carriedIds(t)) {
      ids.add(id);
      bare = bare.split(id).join(' ');
    }
    for (const run of figureRuns(bare)) amounts.add(canonicalAmount(run));
  };
  for (const t of operatorTexts) feed(t);
  for (const a of acts) {
    feed(JSON.stringify(a.call.args));
    feed(JSON.stringify(a.result ?? null));
    feed(a.sentence);
  }
  for (const f of facts) feed(f.text);
  return { amounts, ids };
}

/** Every canonical amount a text states that the records do not carry. A figure worked
 *  out at the desk — a product, a sum — grounds on nothing. Two things leave the text
 *  first: this prompt's own fact labels, whose number counts the block and names no
 *  amount, and the identifiers THE RECORDS CARRY, so the digits inside a record's name
 *  for a thing are never read as an amount. A token that merely wears the shape of an
 *  identifier and names nothing on the record stays in the text and answers for its
 *  digits. */
export function ungroundedAmounts(text: string, records: GroundedRecords): readonly string[] {
  let bare = withoutFactLabels(text);
  for (const id of carriedIds(text)) {
    if (records.ids.has(id)) bare = bare.split(id).join(' ');
  }
  return [...new Set(figureRuns(bare).map(canonicalAmount))]
    .filter(x => !records.amounts.has(x));
}

/** The one sentence both walks send back — the desk's draft and the delivered words
 *  answer to the same law. */
export function ungroundedSentence(subject: string, ungrounded: readonly string[]): string {
  return `${subject} states ${ungrounded.join(', ')} and no record this turn carries `
    + `${ungrounded.length > 1 ? 'them' : 'it'} — state only figures the records show, `
    + `written as the records write them`;
}

/** What this turn's done reads returned, one JSON string per distinct result. */
export function readMaterial(acts: readonly Act[]): readonly string[] {
  return [...new Set(acts
    .filter(a => a.effect === 'read' && a.status === 'done' && a.result !== null)
    .map(a => JSON.stringify(a.result)))];
}

/** A done read's identifiers are the record's answer. Prose that carries not one
 *  of them delivered nothing the reads returned — an identifier the operator already
 *  typed is not an answer, it is the question read back. Reads that return no
 *  identifiers (an empty log, a not-found) demand nothing. */
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

/** The desk rewrites its closing reply twice on a refusal, and the floor delivers after
 *  that: nothing engine-known is ever lost to a third miss. */
const CLOSE_REDRIVES = 2;

export class Turn {
  private readonly deps: TurnDeps;

  /** The metered port of the run in flight — every call it serves books its cost. */
  private metered!: ModelPort;

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

    this.metered = port;

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
    // The model's memory of a past turn is its delivered text and its own record
    // lines — what ran and what did not, frames the operator never sees. A
    // delivered wording can drift; the record cannot. The tape is APPEND-ONLY:
    // what a turn carries is decided when it seals, and no later turn edits those
    // bytes again. A retention rule shaped as "the last N turns" is a rewrite
    // rule, and every slide of that window deletes record lines the model has
    // already read, forcing everything behind the deletion to be read again.
    const sealed = history.sealed();
    const messages: Msg[] = [
      ...sealed.flatMap(r => [
        { role: 'user' as const, text: r.userText },
        { role: 'assistant' as const, text: r.acts.length === 0
          ? r.text
          : `${r.text}\n${r.acts.map(a => a.sentence).join('\n')}` }
      ]),
      ...foreign,
      { role: 'user', text: userText }
    ];
    // What the OPERATOR wrote — this turn's message and every earlier one. The
    // figure walks ground on these and never on the engine's own corrections.
    const operatorTexts = [...sealed.map(r => r.userText),
      ...(opts.before ?? []).map(x => x.userText), userText];
    // The turn's owed words, as they stand right now: what the desk must express and
    // what the engine charges it against, one assembly serving both.
    const notesNow = (): readonly string[] => [
      ...desk.staleAnswers(userText, draft.turn), ...desk.laterTexts(draft.turn),
      ...desk.codeNotices(userText)];
    const owedNow = (): readonly DeliveryFact[] =>
      assembleFacts(draft.acts, desk.open(), draft.closed, notesNow());

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
      // The micro-step writes no reply, so it is owed no facts: one read, nothing else.
      const microTail = pw.tail(userText, microState, desk.open(), []);
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
      reads: session.reads, consent: desk, masker,
      disclosure: new DisclosureDesk(compiled.disclosureBindings),
      microStep });

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
      const owed = owedNow();
      const tail = pw.tail(userText, state, desk.open(), owed);
      // The close step carries this same prefix WITHOUT the owed block. Its one
      // numbered list is the post-call list the closing order prints, so the facts
      // are stated once, under one numbering, in the request that asks for them.
      const closeTail = pw.tail(userText, state, desk.open(), []);
      const closeSystem = closeTail === '' ? pw.system() : `${pw.system()}\n${closeTail}`;
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
        return await this.engineClose(session, draft, operatorTexts, messages, stepInput,
          closeSystem);
      }

      if (finish !== null) {
        const judge = new Judge(port, seat.llmParams({}));
        const closed = await this.tryFinish(finish, draft, messages, operatorTexts,
          history.pastActs(), desk.open(), notesNow(), owed, judge);
        if (closed === 'sealed') return session.seal(draft);
        retriesUsed += 1;
        if (retriesUsed > compiled.limits.retries) {
          return await this.engineClose(session, draft, operatorTexts, messages, stepInput,
            closeSystem);
        }
        continue;
      }

      if (forced) {
        return await this.engineClose(session, draft, operatorTexts, messages, stepInput,
          closeSystem);
      }
      if (callsUsed >= compiled.limits.calls || domain.length === 0) {
        forced = true;
        messages.push({ role: 'user', text: fd.force() });
      }
    }
  }

  /** EVERY DETERMINISTIC REFUSAL a closing message earns: the declared reply guards,
   *  the owed facts (carried, expressed, and never invented), the figure walk and the
   *  engine's own labels. One funnel — the writer is the same desk either way.
   *
   *  `reportIsKept` says whether this turn seals the report the desk files. A turn the
   *  MODEL closes seals it, so the rulers that read it charge it: the honesty floor and
   *  a report line the record contradicts. A turn the ENGINE closes discards it, and a
   *  refusal earned on a discarded line would cost the operator the deterministic floor
   *  — the record dump — in exchange for nothing any record holds. */
  private replyViolations(finish: FinishPayload, draft: TurnDraft,
                          pastActs: readonly Act[], facts: readonly DeliveryFact[],
                          records: GroundedRecords, reportIsKept: boolean):
    readonly { readonly guardName: string; readonly detail: string }[] {
    const replyCtx = deepFreeze({
      message: finish.message, report: finish.report,
      userText: draft.userText, turnActs: [...draft.acts], pastActs
    });
    const violations = [...(reportIsKept
      ? this.deps.rulebook.checkReply(replyCtx)
      : this.deps.rulebook.checkDeliveredReply(replyCtx))];
    // THE OWED FACTS CHARGE THE DESK'S OWN MESSAGE. Every literal the records mint —
    // an id, a figure, a code — must ride in it exactly.
    const owedMisses = gateMisses(facts, finish.message);
    if (owedMisses.length > 0) {
      violations.push({ guardName: 'owedFactIsCarried',
        detail: `your message does not carry ${owedMisses.join(', ')} — write ${
          owedMisses.length > 1 ? 'them' : 'it'} as the records write ${
          owedMisses.length > 1 ? 'them' : 'it'}; digits stay digits` });
    }
    // And every owed fact must be EXPRESSED: the finish names the ids its message
    // states, and a missing id is sent back with the record's own sentence quoted.
    for (const id of factIdMisses(finish.facts, facts)) {
      const fact = facts[Number(id.slice(1)) - 1];
      violations.push({ guardName: 'owedFactIsExpressed',
        detail: `your finish does not name ${id} among the facts your message expresses. `
          + `Its record line: ${fact.text} — state it in your own words and name ${id}` });
    }
    // The list is read in both directions. An id this turn owes no fact for names a
    // record line that does not exist, and a list that can name anything says nothing.
    const unowed = unowedFactIds(finish.facts, facts);
    if (unowed.length > 0) {
      violations.push({ guardName: 'claimedFactIsOwed',
        detail: `your finish names ${unowed.join(', ')} and this turn owes no such fact — `
          + `${facts.length === 0 ? 'nothing is numbered for you this turn'
            : `the ids numbered for you are ${facts.map((_, i) => `F${i + 1}`).join(', ')}`}` });
    }
    const ungrounded = ungroundedAmounts(finish.message, records);
    if (ungrounded.length > 0) {
      violations.push({ guardName: 'figureIsGrounded',
        detail: ungroundedSentence('the message', ungrounded) });
    }
    // The numbered ids and their state tags are bookkeeping between the engine and the
    // desk. One of them in the message is an internal token bolted onto the words the
    // operator reads, and the walk that would catch its digits cannot say why.
    const labels = engineLabels(finish.message);
    if (labels.length > 0) {
      violations.push({ guardName: 'engineLabelIsUnspoken',
        detail: `your message carries ${labels.join(', ')} — ${
          labels.length > 1 ? 'those are labels' : 'that is a label'} of this prompt, `
          + 'never words the operator reads; say the fact in your own words instead' });
    }
    // A report line the settled record contradicts is known to disagree with what
    // happened: corrected, never delivered.
    const contradiction = reportIsKept ? contradictedLine(finish.report, draft.acts) : undefined;
    if (contradiction !== undefined) {
      violations.push({ guardName: 'reportContradictsRecord',
        detail: `your report says ${contradiction.word} for ${contradiction.tool}; the record `
          + `disagrees — write every report line from the record, not from intention` });
    }
    return violations;
  }

  /** 'sealed' = the finish landed clean · 'redrive' = correction sent. The reply
   *  pipe: the deterministic funnel → the judged pass on the session's own seat →
   *  the delivered walk → seal. The message the desk wrote IS the delivery. */
  private async tryFinish(finish: RawCall, draft: TurnDraft, messages: Msg[],
                          operatorTexts: readonly string[],
                          pastActs: readonly Act[], open: readonly Question[],
                          notes: readonly string[], facts: readonly DeliveryFact[],
                          judge: Judge): Promise<'sealed' | 'redrive'> {
    const { compiled, finishDesk: fd, promptWriter: pw } = this.deps;
    const parsed = fd.parse(finish.args);
    if (!parsed.ok) {
      messages.push({ role: 'user', text: pw.correction([parsed.detail]) });
      return 'redrive';
    }
    const records = groundedRecords(operatorTexts, [...draft.acts, ...pastActs], facts);
    const violations = [...this.replyViolations(parsed.finish, draft, pastActs, facts,
      records, true)];
    // Nothing owed and the prose still dropped every identifier its reads returned:
    // the turn answered with words that carry none of what it looked up.
    if (facts.length === 0 && proseDropsReads(draft.acts, parsed.finish.message)) {
      violations.push({ guardName: 'readIsSpoken',
        detail: 'your message names none of the identifiers this turn\'s reads returned — '
          + 'state what the records answered, spelled as they spell it' });
    }
    // A judged guard declaring tools binds the same way the deterministic reply
    // walk does: it is asked only on a turn whose acts touched one of them.
    const acted = new Set(draft.acts.map(a => a.call.tool));
    const judgedBound = compiled.judged.filter(g => g.tools.length === 0
      || g.tools.some(t => acted.has(t)));
    if (violations.length === 0 && judgedBound.length > 0) {
      const replyCtx = deepFreeze({
        message: parsed.finish.message, report: parsed.finish.report,
        userText: draft.userText, turnActs: [...draft.acts], pastActs
      });
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
    // The words the operator would receive, read at the seam where they exist.
    const text = this.rewrite(parsed.finish.message);
    // An unspoken read is the ONE violation whose correction may cost the operator the
    // whole turn: a desk that read the roster and came back with a question names no
    // roster row, and the record dump the floor would deliver destroys the question.
    // The redrive still fires — the words are kept in case the retries run out.
    if (violations.length === 1 && violations[0].guardName === 'readIsSpoken'
      && this.deliveryRefusal(text, draft, records, facts, operatorTexts) === null) {
      draft.unspokenReadReply = text;
    }
    const refusal = violations.length > 0 ? null
      : this.deliveryRefusal(text, draft, records, facts, operatorTexts);
    if (refusal !== null) draft.corrections.push(refusal.mark);
    if (violations.length > 0 || refusal !== null) {
      for (const v of violations) {
        draft.corrections.push({ kind: 'redrive', guardName: v.guardName, detail: v.detail });
      }
      this.sendBack(messages, parsed.finish,
        refusal === null ? violations.map(v => v.detail) : [refusal.sentence]);
      return 'redrive';
    }
    draft.finish = parsed.finish;
    draft.closedBy = 'model';
    draft.delivery = { by: 'prose', retried: false, facts };
    draft.text = this.deps.masker.maskProse(text);
    return 'sealed';
  }

  /** The model EDITS its rejected finish rather than regenerating blind: the attempt
   *  rides back as its own words, the correction names what to change. */
  private sendBack(messages: Msg[], finish: FinishPayload, details: readonly string[]): void {
    messages.push({ role: 'assistant', text: `My finish attempt:\n${finish.message}\nreport: ${
      finish.report.map(r => `${r.tool} ${r.target}: ${r.word}`).join(' · ') || '(no rows)'}` });
    messages.push({ role: 'user', text: this.deps.promptWriter.correction(details) });
  }

  /** The declared rewrites, applied to every candidate the operator could receive. */
  private rewrite(text: string): string {
    let out = text;
    for (const r of this.deps.compiled.rewrites) out = r.apply(out);
    return out;
  }

  /** What the words the operator would receive are read for: the figure walk first —
   *  the SAME law the desk's own draft answered to, one stage later — then the prose
   *  reader. Returns the correction to send and the mark it leaves, or null. */
  private deliveryRefusal(text: string, draft: TurnDraft, records: GroundedRecords,
                          facts: readonly DeliveryFact[],
                          operatorTexts: readonly string[]):
    { readonly sentence: string; readonly mark: Correction } | null {
    const ungrounded = ungroundedAmounts(text, records);
    if (ungrounded.length > 0) {
      const sentence = ungroundedSentence('your reply', ungrounded);
      return { sentence, mark: { kind: 'deliveryFigure', detail: sentence } };
    }
    const rules = [...this.deps.rulebook.guards().guards.map(g => g.rule),
      ...this.deps.compiled.judged.map(g => g.rule)];
    const found = readProse({ text, userText: languageReference(operatorTexts),
      acts: draft.acts, owed: facts.map(f => f.text), rules });
    if (found === null) return null;
    return { sentence: found.sentence,
      mark: { kind: 'proseReader', check: found.check, detail: found.sentence } };
  }

  /** THE DESK'S CLOSE-STEP. The engine ended the turn — a consent question stands, or
   *  the retries are spent — so no finish of the model's closed it, and the desk is
   *  given one more step in ITS OWN conversation to write the words the operator
   *  reads: the same system, the same tool cards, the same acts, and one user message
   *  carrying the numbered owed facts and the order to write. The same funnel charges
   *  what comes back, and a refusal redrives the desk on that same prefix. */
  private async engineClose(session: Session, draft: TurnDraft,
                            operatorTexts: readonly string[], messages: Msg[],
                            drive: StepInput, closeSystem: string): Promise<TurnRecord> {
    const { finishDesk: fd, deliveryWriter: dw } = this.deps;
    draft.corrections.push({ kind: 'forcedFinish' });
    draft.closedBy = 'engine';
    draft.finish = null;
    const open = session.consent.open();
    const notes = [...session.consent.staleAnswers(draft.userText, draft.turn),
      ...session.consent.laterTexts(draft.turn),
      ...session.consent.codeNotices(draft.userText)];
    const facts = assembleFacts(draft.acts, open, draft.closed, notes);
    const floor = (): string => this.rewrite(dw.compose(fd.closure(draft.acts), draft.acts,
      open, draft.closed, notes));
    const records = groundedRecords(operatorTexts,
      [...draft.acts, ...session.history.pastActs()], facts);
    const delivered = await this.closeStep(draft, messages, drive, closeSystem, facts,
      records, session.history.pastActs(), operatorTexts);
    // The close step's words first, then the words an unspoken read refused, then the
    // floor. A turn that wrote nothing an operator can use gets the record lines; a
    // turn that wrote a question keeps it.
    const kept = delivered ?? (draft.unspokenReadReply === null ? null
      : { text: draft.unspokenReadReply, retried: true });
    draft.delivery = { by: kept === null ? 'floor' : delivered === null ? 'prose' : 'desk',
      retried: kept === null || kept.retried, facts };
    draft.text = this.deps.masker.maskProse(kept === null ? floor() : kept.text);
    return session.seal(draft);
  }

  /** The close-step itself: null when the desk cannot be asked or does not pay. */
  private async closeStep(draft: TurnDraft, messages: Msg[], drive: StepInput,
                          closeSystem: string, facts: readonly DeliveryFact[],
                          records: GroundedRecords, pastActs: readonly Act[],
                          operatorTexts: readonly string[]):
    Promise<{ readonly text: string; readonly retried: boolean } | null> {
    // A turn owing nothing has no reply for the desk to write, and a bare world code
    // standing where an authored sentence should carries no sentence to render:
    // the floor delivers, literal, and no call is spent.
    if (facts.length === 0) return null;
    if (facts.some(f => f.kind !== 'code' && isCodeShaped(f.text))) return null;

    const fd = this.deps.finishDesk;
    // The loop may already have ordered the finish on its way out. The closing order
    // below says the same thing over the turn's own facts, so the earlier line is
    // dropped rather than stated twice.
    const order = fd.force();
    const last = messages[messages.length - 1];
    const priors = last !== undefined && last.role === 'user' && last.text === order
      ? messages.slice(0, -1) : messages;
    const conversation: Msg[] = [...priors,
      { role: 'user', text: closeInstruction(facts) }];
    for (let attempt = 0; attempt <= CLOSE_REDRIVES; attempt++) {
      const step = await this.metered.step(deepFreeze({
        system: closeSystem, messages: [...conversation], tools: drive.tools,
        forceFinish: true, llmParams: drive.llmParams
      }));
      const finish = fd.split(step.calls).finish;
      if (finish === null) {
        conversation.push({ role: 'user', text: order });
        continue;
      }
      const parsed = fd.parse(finish.args);
      if (!parsed.ok) {
        conversation.push({ role: 'user',
          text: this.deps.promptWriter.correction([parsed.detail]) });
        continue;
      }
      const violations = this.replyViolations(parsed.finish, draft, pastActs, facts,
        records, false);
      const text = this.rewrite(parsed.finish.message);
      const refusal = violations.length > 0 ? null
        : this.deliveryRefusal(text, draft, records, facts, operatorTexts);
      if (violations.length === 0 && refusal === null) {
        return { text, retried: attempt > 0 };
      }
      // The words the desk actually wrote go on the record, ahead of the rulers that
      // refused them: a floored close reads back the way a floored loop does.
      draft.corrections.push({ kind: 'closeRefused', attempt, text });
      if (refusal !== null) draft.corrections.push(refusal.mark);
      for (const v of violations) {
        draft.corrections.push({ kind: 'redrive', guardName: v.guardName, detail: v.detail });
      }
      this.sendBack(conversation, parsed.finish,
        refusal === null ? violations.map(v => v.detail) : [refusal.sentence]);
    }
    return null;
  }
}
