/** Everything between a proposed call and a recorded act, for all origins through
 *  the SAME method: coerce against the declared schema, canonical identity, Rulebook
 *  verdict, route by verdict kind, StatusClerk grading, masking on record — the
 *  stored form is the only stored form. */
import type { Act, CallCtx, CanonicalCallData, Json, OwedRead, RawCall,
              StateSnapshot } from '../contract/vocabulary.js';
import { TurnFailure } from '../contract/vocabulary.js';
import type { ToolFact } from '../contract/vocabulary.js';
import type { ToolPort } from '../contract/ports.js';
import { CanonicalCall, isJson } from '../contract/canonical-call.js';
import { deepFreeze } from '../contract/freeze.js';
import type { CompiledAgent } from '../cards/cards.js';
import type { Rulebook } from './rulebook.js';
import type { GradeInput, StatusClerk } from './status-clerk.js';
import type { ReadsLog } from './reads-log.js';
import type { ActionHistory } from './action-history.js';
import type { ConsentDesk } from './consent-desk.js';
import type { DisclosureDesk } from './disclosure-desk.js';
import type { Masker } from './masker.js';
import type { TurnDraft } from './session.js';

/** The world's refusal in words: the refusal's own detail sentence when it
 *  carries one, the honest {refused} sentence otherwise, the raw result last. */
function refusedSentence(result: Json): string {
  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    const refused = (result as { readonly [k: string]: Json }).refused;
    if (typeof refused === 'string') return refused;
    if (typeof refused === 'object' && refused !== null && !Array.isArray(refused)) {
      const detail = (refused as { readonly [k: string]: Json }).detail;
      if (typeof detail === 'string') return detail;
    }
    if (refused !== undefined) return JSON.stringify(refused);
  }
  return JSON.stringify(result);
}

/** The guard-ctx identity form: guards check the REAL args; masking happens at the
 *  record seam through the Masker. */
const mask = (v: unknown): Json => (isJson(v) ? v : null);

export interface CallRunnerDeps {
  readonly compiled: CompiledAgent;
  readonly rulebook: Rulebook;
  readonly clerk: StatusClerk;
  readonly history: ActionHistory;
  readonly toolPort: ToolPort;
  /** The session's reads log: every done answer lands here, masked, on the clock. */
  readonly reads: ReadsLog;
  /** The per-session question desk; the hold route issues through it. */
  readonly consent: ConsentDesk;
  /** The record-seam masker: stored calls and results. */
  readonly masker: Masker;
  /** The compiled disclosure recipes; the hold route reads and renders through it. */
  readonly disclosure: DisclosureDesk;
  /** ONE forced micro-step on the session's own seat: the model fills the owed
   *  read's args over a single-tool surface. null = the model produced no usable
   *  call. The Turn supplies it — model I/O stays the sequencer's job. */
  readonly microStep: (read: OwedRead, held: CanonicalCallData) => Promise<RawCall | null>;
}

export class CallRunner {
  private readonly deps: CallRunnerDeps;

  constructor(deps: CallRunnerDeps) {
    this.deps = deps;
  }

  async run(raw: RawCall, origin: Act['origin'], draft: TurnDraft): Promise<Act> {
    return this.runChecked(raw, origin, draft, this.oweBudget(raw.tool));
  }

  /** One micro-step round per guard that can owe on this tool — every debt gets its
   *  turn to be paid, and the walk still terminates. */
  private oweBudget(tool: string): number {
    return this.deps.rulebook.guards().guards.filter(g =>
      g.on === 'preTool' && (g.tools.length === 0 || g.tools.includes(tool)) && 'owe' in g).length;
  }

  private async runChecked(raw: RawCall, origin: Act['origin'], draft: TurnDraft,
                           oweRounds: number): Promise<Act> {
    const { rulebook, clerk, history, compiled } = this.deps;
    const fact = compiled.facts.tools[raw.tool];
    if (!fact) {
      return this.record(draft, {
        origin, call: deepFreeze({ tool: raw.tool, args: {}, key: `off-surface:${raw.tool}` }),
        effect: 'read', said: null, status: 'not-done', reason: 'blocked', evidence: 'engine',
        sentence: `${raw.tool} — not-done (no tool by that name is on this surface)`,
        owed: null, result: null
      });
    }
    const coerced = CanonicalCall.of(raw.tool, raw.args, fact);
    if ('badArg' in coerced) {
      return this.record(draft, {
        origin, call: deepFreeze({ tool: raw.tool, args: {}, key: `bad-arg:${raw.tool}` }),
        effect: fact.effect, said: null, status: 'not-done', reason: 'blocked', evidence: 'engine',
        sentence: `${raw.tool} — not-done (arg '${coerced.badArg}' is missing or not usable as declared)`,
        owed: null, result: null
      });
    }
    const call = coerced;
    const ctx = this.callCtx(call, fact, origin, draft);
    const verdict = origin === 'licence' ? { kind: 'allow' as const } : rulebook.checkPreTool(ctx);

    switch (verdict.kind) {
      case 'allow':
        return this.execute(call, fact, origin, draft);
      case 'refuse': {
        const rule = rulebook.guards().guards.find(g => g.name === verdict.guardName)?.rule ?? '';
        const grade = clerk.grade({ verdict, actId: '' }, fact.effect, draft);
        return this.record(draft, {
          origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect, said: grade.said,
          status: grade.status, reason: grade.reason, evidence: grade.evidence,
          sentence: `${this.head(call, fact)} — not-done (${`${rule} ${verdict.detail}`.trim()})`,
          owed: { kind: 'refusal', text: `${rule} ${verdict.detail}`.trim() },
          result: null
        }, undefined, null, verdict.guardName);
      }
      case 'restate': {
        const first = draft.acts.find(a => a.id === verdict.actId)
          ?? history.pastActs().find(a => a.id === verdict.actId);
        if (!first) throw new TurnFailure('construction', `restate points at unknown act '${verdict.actId}'`);
        // A restated write carries its outcome in words: the consumed question's
        // after-tense, filled from the first result, answers the re-proposal.
        const outcome = first.status === 'done'
          ? this.deps.disclosure.withResult(this.deps.consent.afterText(call.key), first.result)
          : null;
        return this.record(draft, {
          origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect, said: first.said,
          status: first.status, reason: first.reason, evidence: 'engine',
          sentence: `${this.head(call, fact)} — ${first.status} (already ran; first result restated)${
            outcome === null ? '' : `. ${outcome}`}`,
          owed: null, result: first.result
        });
      }
      case 'hold': {
        const targetRaw = fact.target !== null ? call.args[fact.target] : undefined;
        const targetValue = typeof targetRaw === 'string' ? targetRaw : null;
        // A call re-held THIS TURN restates at once: the standing question is the
        // answer, no disclosure re-runs, and the record tells the model to stop
        // asking and close the turn.
        const heldBefore = draft.acts.find(a => a.reason === 'held'
          && a.call.tool === call.tool
          && (targetValue === null || a.call.args[fact.target ?? ''] === targetValue));
        if (heldBefore) {
          return this.record(draft, {
            origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect,
            said: null, status: 'not-done', reason: 'held', evidence: 'engine',
            sentence: `${this.head(call, fact)} — not-done (already held; the question stands — stop retrying and close the turn)`,
            owed: null, result: null
          }, undefined, heldBefore.questionId);
        }
        // The declared reads run FIRST — origin engine, recorded — so the
        // before-tense can describe the already-fixed target.
        const reads = new Map<string, Act>();
        for (const owed of this.deps.disclosure.owedReads(call.tool, ctx.call)) {
          reads.set(owed.alias,
            await this.runChecked({ tool: owed.tool,
              args: this.deps.disclosure.fillOwed(owed, reads) }, 'engine', draft, 0));
        }
        // The declared cap outranks the ask: a call whose arg exceeds what the
        // owed read answered is refused with the record's own figures — the
        // desk never asks about an act the records rule out.
        const capSentence = this.deps.disclosure.overCap(call.tool, ctx.call, reads);
        if (capSentence !== null) {
          return this.record(draft, {
            origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect,
            said: null, status: 'not-done', reason: 'blocked', evidence: 'engine',
            sentence: `${this.head(call, fact)} — not-done (${capSentence})`,
            owed: { kind: 'refusal', text: capSentence }, result: null
          }, undefined, null, 'cap');
        }
        // An ask that cannot name its object is never asked: when a declared
        // tense finds no value in the reads, the call is refused — the card's
        // empty sentence speaks, or the engine's plain default.
        const emptySentence = this.deps.disclosure.emptyRefusal(call.tool, ctx.call, reads);
        if (emptySentence !== null) {
          return this.record(draft, {
            origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect,
            said: null, status: 'not-done', reason: 'blocked', evidence: 'engine',
            sentence: `${this.head(call, fact)} — not-done (${emptySentence})`,
            owed: { kind: 'refusal', text: emptySentence }, result: null
          }, undefined, null, 'empty');
        }
        const tenses = this.deps.disclosure.tenses(call.tool, ctx.call, reads);
        const sentence = tenses.before ?? verdict.sentence;
        const question = this.deps.consent.hold(call, targetValue, sentence, draft,
          { after: tenses.after, later: tenses.later });
        const grade = clerk.grade({ verdict, actId: '' }, fact.effect, draft);
        return this.record(draft, {
          origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect, said: grade.said,
          status: grade.status, reason: grade.reason, evidence: grade.evidence,
          sentence: `${this.head(call, fact)} — not-done (${this.deps.compiled.wording.status.held})`,
          owed: null, result: null
        }, undefined, question.id, verdict.guardName);
      }
      case 'owe': {
        if (oweRounds <= 0) {
          return this.refuseUnpaidDebt(call, fact, origin, draft, verdict);
        }
        let paid = false;
        for (const read of verdict.reads) {
          // A declared relation fills the read engine-side: the args are the held
          // call's own values under declared renames — no model call. The forced
          // micro-step survives only for an undeclared surface, whose read wants
          // arguments the declaration does not carry.
          if (Object.keys(read.args).length > 0 || !this.requiresArgs(read.tool)) {
            await this.runChecked({ tool: read.tool, args: read.args }, 'engine', draft, 0);
            paid = true;
            continue;
          }
          if (draft.microTried.includes(read.tool)) continue;
          const filled = await this.deps.microStep(read, ctx.call);
          if (filled === null || filled.tool !== read.tool) {
            draft.microTried.push(read.tool);
            continue;
          }
          await this.runChecked(filled, 'engine', draft, 0);
          paid = true;
        }
        // A round that paid nothing can never pay anything: refuse now, in the
        // words of the guard whose debt stands.
        if (!paid) return this.refuseUnpaidDebt(call, fact, origin, draft, verdict);
        return this.runChecked(raw, origin, draft, oweRounds - 1);
      }
    }
  }

  private async execute(call: CanonicalCall, fact: ToolFact, origin: Act['origin'],
                        draft: TurnDraft): Promise<Act> {
    const { clerk, toolPort, rulebook } = this.deps;
    const id = this.deps.history.mint();
    let input: GradeInput;
    let result: Json = null;
    try {
      const answer = await toolPort.call({ tool: call.tool, args: call.args });
      input = { answer, actId: id };
      result = answer.result;
    } catch (e) {
      input = { threw: e instanceof Error ? e.message : String(e), actId: id };
    }
    const grade = clerk.grade(input, fact.effect, draft);
    draft.corrections.push(...grade.corrections);
    // The after-tense is offered on EVERY done call, reads included: the licence
    // path replays the consumed question's rendered text; an ordinary call
    // renders from its own args and result, and a sentence the result cannot
    // fill is silent — a refused call holds nothing to describe.
    const afterTense = grade.status !== 'done' ? null
      : origin === 'licence'
        ? this.deps.disclosure.withResult(this.deps.consent.afterText(call.key),
            this.deps.masker.maskData(result))
        : this.deps.disclosure.afterOf(call.tool,
            call.data(v => this.deps.masker.maskData(v)), this.deps.masker.maskData(result));
    const act = this.record(draft, {
      origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect, said: grade.said,
      status: grade.status, reason: grade.reason, evidence: grade.evidence,
      sentence: afterTense === null
        ? `${this.head(call, fact)} — ${grade.status}`
        : `${this.head(call, fact)} — ${grade.status}. ${afterTense}`,
      // The operator is owed the words either way: the after-tense receipt on a
      // done write, and on a refusal the world's OWN sentence — the act ran, and
      // what the surface answered is the only account of why it did not land.
      owed: grade.status === 'done'
        ? (fact.effect !== 'read' && afterTense !== null
            ? { kind: 'receipt', text: afterTense } : null)
        : grade.said === 'no'
          ? { kind: 'refusal', text: refusedSentence(result) } : null,
      result: this.deps.masker.maskData(result)
    }, id);
    if ('answer' in input && grade.status === 'done') {
      const target = fact.target !== null ? call.args[fact.target] : undefined;
      this.deps.reads.record(call.tool, typeof target === 'string' ? target : '', act.result);
      const resultCtx = deepFreeze({
        call: act.call, result: act.result,
        userText: draft.userText, turnActs: [...draft.acts], pastActs: this.deps.history.pastActs()
      });
      for (const violation of rulebook.checkPostTool(resultCtx)) {
        draft.corrections.push({ kind: 'postToolFinding', guardName: violation.guardName, detail: violation.detail });
      }
    }
    return act;
  }

  /** The debt could not be paid this turn: the act refuses with the rule of the
   *  guard that raised it — the turn goes on and the delivery carries the sentence;
   *  never a dead turn. */
  private refuseUnpaidDebt(call: CanonicalCall, fact: ToolFact, origin: Act['origin'],
                           draft: TurnDraft,
                           debt: { readonly guardName: string; readonly rule: string }): Act {
    const grade = this.deps.clerk.grade(
      { verdict: { kind: 'refuse', guardName: debt.guardName, detail: '' }, actId: '' },
      fact.effect, draft);
    return this.record(draft, {
      origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect, said: grade.said,
      status: grade.status, reason: grade.reason, evidence: grade.evidence,
      sentence: `${this.head(call, fact)} — not-done (${debt.rule} The required read did not succeed this conversation.)`,
      owed: { kind: 'refusal',
        text: `${debt.rule} The required read did not succeed this conversation.`.trim() },
      result: null
    });
  }

  /** Whether a read's declared schema requires any argument at all. */
  private requiresArgs(tool: string): boolean {
    const schema = this.deps.compiled.facts.tools[tool]?.schema;
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return false;
    const required = (schema as { readonly required?: Json }).required;
    return Array.isArray(required) && required.length > 0;
  }

  private callCtx(call: CanonicalCall, fact: ToolFact, origin: Act['origin'],
                  draft: TurnDraft): CallCtx {
    return deepFreeze({
      call: call.data(mask), effect: fact.effect, consented: origin === 'licence',
      reads: this.deps.reads, userText: draft.userText,
      userTexts: [draft.userText, ...this.deps.history.sealed().map(r => r.userText)],
      grounded: [...draft.grounded],
      turnActs: [...draft.acts],
      pastActs: this.deps.history.pastActs()
    });
  }

  private head(call: CanonicalCall, fact: ToolFact): string {
    const target = fact.target !== null ? call.args[fact.target] : undefined;
    const printable = typeof target === 'string' || typeof target === 'number' || typeof target === 'boolean'
      ? String(target) : null;
    return printable !== null ? `${call.tool}(${printable})` : `${call.tool}()`;
  }

  private record(draft: TurnDraft, act: Omit<Act, 'id' | 'turn' | 'questionId' | 'guard'>,
                 id?: string, questionId: string | null = null,
                 guard: string | null = null): Act {
    return this.deps.history.add({ ...act, id: id ?? this.deps.history.mint(),
      turn: draft.turn, questionId, guard }, draft);
  }
}
