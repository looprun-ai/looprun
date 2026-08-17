/** Everything between a proposed call and a recorded act, for all origins through
 *  the SAME method: coerce against the declared schema, canonical identity, Rulebook
 *  verdict, route by verdict kind, StatusClerk grading, masking on record — the
 *  stored form is the only stored form. */
import type { Act, CallCtx, Json, RawCall, StateSnapshot } from '../contract/vocabulary.js';
import { TurnFailure } from '../contract/vocabulary.js';
import type { ToolFact } from '../contract/vocabulary.js';
import type { ToolPort, RecordsPort } from '../contract/ports.js';
import { CanonicalCall, isJson } from '../contract/canonical-call.js';
import { deepFreeze } from '../contract/freeze.js';
import type { CompiledAgent } from '../cards/cards.js';
import type { Rulebook } from './rulebook.js';
import type { GradeInput, StatusClerk } from './status-clerk.js';
import type { ActionHistory } from './action-history.js';
import type { TurnDraft } from './session.js';

/** The record-seam masker; the Masker collaborator replaces the function, not the seam. */
const mask = (v: unknown): Json => (isJson(v) ? v : null);

export interface CallRunnerDeps {
  readonly compiled: CompiledAgent;
  readonly rulebook: Rulebook;
  readonly clerk: StatusClerk;
  readonly history: ActionHistory;
  readonly toolPort: ToolPort;
  readonly recordsPort: RecordsPort | null;
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
          origin, call: call.data(mask), effect: fact.effect, said: grade.said,
          status: grade.status, reason: grade.reason, evidence: grade.evidence,
          sentence: `${this.head(call, fact)} — not-done (${rule} ${verdict.detail})`.trimEnd(),
          result: null
        });
      }
      case 'restate': {
        const first = draft.acts.find(a => a.id === verdict.actId)
          ?? history.pastActs().find(a => a.id === verdict.actId);
        if (!first) throw new TurnFailure('construction', `restate points at unknown act '${verdict.actId}'`);
        return this.record(draft, {
          origin, call: call.data(mask), effect: fact.effect, said: first.said,
          status: first.status, reason: first.reason, evidence: 'engine',
          sentence: `${this.head(call, fact)} — ${first.status} (already ran; first result restated)`,
          result: first.result
        });
      }
      case 'owe': {
        if (!mayOwe) throw new TurnFailure('construction', `owed reads did not satisfy the guard on ${call.tool}`);
        for (const read of verdict.reads) {
          await this.runChecked({ tool: read.tool, args: read.args }, 'engine', draft, false);
        }
        return this.runChecked(raw, origin, draft, false);
      }
      default:
        throw new TurnFailure('construction', `verdict '${verdict.kind}' has no phase-1 route`);
    }
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
    const act = this.record(draft, {
      origin, call: call.data(mask), effect: fact.effect, said: grade.said,
      status: grade.status, reason: grade.reason, evidence: grade.evidence,
      sentence: `${this.head(call, fact)} — ${grade.status}`, result: mask(result)
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

  private callCtx(call: CanonicalCall, fact: ToolFact, origin: Act['origin'],
                  state: StateSnapshot | null, draft: TurnDraft): CallCtx {
    return deepFreeze({
      call: call.data(mask), effect: fact.effect, consented: origin === 'licence',
      state, userText: draft.userText, turnActs: [...draft.acts],
      pastActs: this.deps.history.pastActs()
    });
  }

  private head(call: CanonicalCall, fact: ToolFact): string {
    const target = fact.target !== null ? call.args[fact.target] : undefined;
    const printable = typeof target === 'string' || typeof target === 'number' || typeof target === 'boolean'
      ? String(target) : null;
    return printable !== null ? `${call.tool}(${printable})` : `${call.tool}()`;
  }

  private record(draft: TurnDraft, act: Omit<Act, 'id' | 'turn' | 'questionId'>, id?: string): Act {
    return this.deps.history.add({ ...act, id: id ?? this.deps.history.mint(),
      turn: draft.turn, questionId: null }, draft);
  }
}
