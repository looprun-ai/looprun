/** Everything between a proposed call and a recorded act, for all origins through
 *  the SAME method: coerce against the declared schema, canonical identity, Rulebook
 *  verdict, route by verdict kind, StatusClerk grading, masking on record — the
 *  stored form is the only stored form. */
import type { Act, CallCtx, CanonicalCallData, Json, OwedRead, RawCall, StateSnapshot,
              ToolAnswer } from '../contract/vocabulary.js';
import { TurnFailure } from '../contract/vocabulary.js';
import type { ToolFact } from '../contract/vocabulary.js';
import type { ToolPort, RecordsPort } from '../contract/ports.js';
import { CanonicalCall, canonicalJson, isJson } from '../contract/canonical-call.js';
import { deepFreeze } from '../contract/freeze.js';
import type { CompiledAgent } from '../cards/cards.js';
import type { Rulebook } from './rulebook.js';
import type { GradeInput, StatusClerk } from './status-clerk.js';
import type { ActionHistory } from './action-history.js';
import type { ConsentDesk } from './consent-desk.js';
import type { DisclosureDesk } from './disclosure-desk.js';
import type { Masker } from './masker.js';
import type { TurnDraft } from './session.js';

/** The guard-ctx identity form: guards check the REAL args; masking happens at the
 *  record seam through the Masker. */
const mask = (v: unknown): Json => (isJson(v) ? v : null);

export interface CallRunnerDeps {
  readonly compiled: CompiledAgent;
  readonly rulebook: Rulebook;
  readonly clerk: StatusClerk;
  readonly history: ActionHistory;
  readonly toolPort: ToolPort;
  readonly recordsPort: RecordsPort | null;
  /** The per-session question desk; the hold route issues through it. */
  readonly consent: ConsentDesk;
  /** The record-seam masker: stored calls, results and the simulated line. */
  readonly masker: Masker;
  /** The compiled disclosure recipes; the hold route reads and renders through it. */
  readonly disclosure: DisclosureDesk;
  /** Tools whose simulation mutated state this session — plain consent for them. */
  readonly revoked: Set<string>;
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
    return this.runChecked(raw, origin, draft, true);
  }

  private async runChecked(raw: RawCall, origin: Act['origin'], draft: TurnDraft,
                           mayOwe: boolean): Promise<Act> {
    const { rulebook, clerk, history, recordsPort, compiled } = this.deps;
    const fact = compiled.facts.tools[raw.tool];
    if (!fact) {
      return this.record(draft, {
        origin, call: deepFreeze({ tool: raw.tool, args: {}, key: `off-surface:${raw.tool}` }),
        effect: 'read', said: null, status: 'not-done', reason: 'blocked', evidence: 'engine',
        sentence: `${raw.tool} — not-done (no tool by that name is on this surface)`, result: null
      });
    }
    const coerced = CanonicalCall.of(raw.tool, raw.args, fact);
    if ('badArg' in coerced) {
      return this.record(draft, {
        origin, call: deepFreeze({ tool: raw.tool, args: {}, key: `bad-arg:${raw.tool}` }),
        effect: fact.effect, said: null, status: 'not-done', reason: 'blocked', evidence: 'engine',
        sentence: `${raw.tool} — not-done (arg '${coerced.badArg}' is missing or not usable as declared)`,
        result: null
      });
    }
    const call = coerced;
    const state = recordsPort?.snapshot() ?? null;
    const ctx = this.callCtx(call, fact, origin, state, draft);
    const verdict = origin === 'licence' ? { kind: 'allow' as const } : rulebook.checkPreTool(ctx);

    switch (verdict.kind) {
      case 'allow':
        return this.execute(call, fact, origin, state, draft);
      case 'refuse': {
        const rule = rulebook.guards().guards.find(g => g.name === verdict.guardName)?.rule ?? '';
        const grade = clerk.grade({ verdict, actId: '' }, fact.effect, state, state, draft);
        return this.record(draft, {
          origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect, said: grade.said,
          status: grade.status, reason: grade.reason, evidence: grade.evidence,
          sentence: `${this.head(call, fact)} — not-done (${rule} ${verdict.detail})`.trimEnd(),
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
          result: first.result
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
            result: null
          }, undefined, heldBefore.questionId);
        }
        // The declared reads run FIRST — origin engine, recorded — so the
        // before-tense can describe the already-fixed target.
        const reads = new Map<string, Act>();
        for (const owed of this.deps.disclosure.owedReads(call.tool, ctx.call)) {
          reads.set(owed.alias,
            await this.runChecked({ tool: owed.tool, args: owed.args }, 'engine', draft, false));
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
            result: null
          }, undefined, null, 'cap');
        }
        const tenses = this.deps.disclosure.tenses(call.tool, ctx.call, reads);
        let sentence = tenses.before ?? verdict.sentence;
        sentence += await this.simulatedLine(call, fact, draft);
        const question = this.deps.consent.hold(call, targetValue, sentence, draft,
          { after: tenses.after, later: tenses.later });
        const grade = clerk.grade({ verdict, actId: '' }, fact.effect, state, state, draft);
        return this.record(draft, {
          origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect, said: grade.said,
          status: grade.status, reason: grade.reason, evidence: grade.evidence,
          sentence: `${this.head(call, fact)} — not-done (held for your approval)`,
          result: null
        }, undefined, question.id, verdict.guardName);
      }
      case 'owe': {
        if (!mayOwe) return this.refuseUnpaidDebt(call, fact, origin, state, draft);
        for (const read of verdict.reads) {
          if (draft.microTried.includes(read.tool)) continue;
          const filled = await this.deps.microStep(read, ctx.call);
          if (filled === null || filled.tool !== read.tool) {
            draft.microTried.push(read.tool);
            continue;
          }
          await this.runChecked(filled, 'engine', draft, false);
        }
        return this.runChecked(raw, origin, draft, false);
      }
    }
  }

  /** The simulated run on hold: the tool's OWN parameter, the act's shared path,
   *  snapshots around it. A mutating simulation revokes itself for the session and
   *  the question falls back to the plain sentence. */
  private async simulatedLine(call: CanonicalCall, fact: ToolFact, draft: TurnDraft): Promise<string> {
    if (fact.simulation === null || this.deps.revoked.has(call.tool)) return '';
    const { recordsPort, toolPort, compiled } = this.deps;
    const before = recordsPort?.snapshot() ?? null;
    let answer: ToolAnswer | null = null;
    try {
      answer = await toolPort.call({ tool: call.tool,
        args: { ...call.args, [fact.simulation.arg]: fact.simulation.value } });
    } catch {
      answer = null;
    }
    const after = recordsPort?.snapshot() ?? null;
    if (before !== null && after !== null && canonicalJson(before) !== canonicalJson(after)) {
      draft.corrections.push({ kind: 'simulationRevoked', tool: call.tool });
      this.deps.revoked.add(call.tool);
      return '';
    }
    if (answer === null || answer.done === 'no') return '';
    return `\n${compiled.wording.sentence.simulatedResult} ${JSON.stringify(this.deps.masker.maskData(answer.result))}`;
  }

  private async execute(call: CanonicalCall, fact: ToolFact, origin: Act['origin'],
                        before: StateSnapshot | null, draft: TurnDraft): Promise<Act> {
    const { clerk, recordsPort, toolPort, rulebook } = this.deps;
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
    const after = recordsPort?.snapshot() ?? null;
    const grade = clerk.grade(input, fact.effect, before, after, draft);
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
      result: this.deps.masker.maskData(result)
    }, id);
    if ('answer' in input && grade.status === 'done') {
      const resultCtx = deepFreeze({
        call: act.call, result: act.result, state: after,
        userText: draft.userText, turnActs: [...draft.acts], pastActs: this.deps.history.pastActs()
      });
      for (const violation of rulebook.checkPostTool(resultCtx)) {
        draft.corrections.push({ kind: 'redrive', guardName: violation.guardName, detail: violation.detail });
      }
    }
    return act;
  }

  /** The debt could not be paid this turn: the act refuses with the owning rule —
   *  the turn goes on and the delivery carries the sentence; never a dead turn. */
  private refuseUnpaidDebt(call: CanonicalCall, fact: ToolFact, origin: Act['origin'],
                           state: StateSnapshot | null, draft: TurnDraft): Act {
    const owner = this.deps.rulebook.guards().guards.find(g =>
      g.on === 'preTool' && (g.tools.length === 0 || g.tools.includes(call.tool)) && 'owe' in g);
    const grade = this.deps.clerk.grade(
      { verdict: { kind: 'refuse', guardName: owner?.name ?? 'onlyAfter', detail: '' }, actId: '' },
      fact.effect, state, state, draft);
    return this.record(draft, {
      origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect, said: grade.said,
      status: grade.status, reason: grade.reason, evidence: grade.evidence,
      sentence: `${this.head(call, fact)} — not-done (${owner?.rule ?? ''} The required read did not succeed this conversation.)`,
      result: null
    });
  }

  private callCtx(call: CanonicalCall, fact: ToolFact, origin: Act['origin'],
                  state: StateSnapshot | null, draft: TurnDraft): CallCtx {
    return deepFreeze({
      call: call.data(mask), effect: fact.effect, consented: origin === 'licence',
      state, userText: draft.userText,
      userTexts: [draft.userText, ...this.deps.history.sealed().map(r => r.userText)],
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
