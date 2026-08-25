/** Plays scripted multi-turn cases through the REAL path: one LoopRunAgent per
 *  case through the public door — no second loop exists. The typed approve step
 *  reads the open question's code from the records' question fold (issued minus
 *  consumed minus closed across ALL prior records); a code is never extracted
 *  from prose. Invariants are priced into the dump as data. */
import { createHash } from 'node:crypto';
import type { ApproveRef, ExamCase, Json, Question, ToolMatcher,
              TurnRecord } from '@looprun-ai/core';
import { TurnFailure } from '@looprun-ai/core';
import { LoopRunAgent, RoutedAgent, UngovernedAgent, type LoopRunConfig,
         type LoopRunModel } from '@looprun-ai/mastra';
import type { Subject } from './subject-loader.js';
import { appendLine, writeDump, type CaseDump } from './run-dir.js';

function openQuestions(records: readonly TurnRecord[]): readonly Question[] {
  const issued: Question[] = [];
  const gone = new Set<string>();
  for (const record of records) {
    issued.push(...record.questions.issued);
    for (const id of record.questions.consumed) gone.add(id);
    for (const row of record.questions.closed) gone.add(row.id);
  }
  return issued.filter(q => !gone.has(q.id));
}

function argsSubset(subset: Readonly<Record<string, Json>> | undefined,
                    args: Readonly<Record<string, Json>>): boolean {
  if (subset === undefined) return true;
  return Object.entries(subset).every(([k, v]) => JSON.stringify(args[k]) === JSON.stringify(v));
}

function approvalText(refs: readonly ApproveRef[], open: readonly Question[],
                      everIssued: readonly Question[], caseId: string): string {
  const codes: (string | null)[] = refs.map(ref => {
    const matches = open.filter(q => q.call.tool === ref.tool
      && argsSubset(ref.args, q.call.args));
    if (matches.length === 0) {
      // The old template replayed the FIRST issued code even after consumption —
      // a stale approval the engine answers with "nothing was licensed".
      const stale = [...everIssued].reverse().find(q => q.call.tool === ref.tool
        && argsSubset(ref.args, q.call.args));
      if (stale) return stale.code;
      // The old template left an unresolved {{CODE}} slot silent — an approval
      // for an act that was never put up licenses nothing.
      return null;
    }
    if (matches.length > 1 && ref.args === undefined) {
      throw new Error(`case ${caseId}: two open siblings of '${ref.tool}' and no args to split them`);
    }
    return matches[0].code;
  });
  const usable = codes.filter((c): c is string => c !== null);
  if (usable.length === 0) {
    throw new Error(`case ${caseId}: no question ever held any of the approve refs`);
  }
  return usable.join(' and ');
}

function declineText(open: readonly Question[], caseId: string): string {
  if (open.length !== 1) {
    throw new Error(`case ${caseId}: a decline turn needs exactly one open question, found ${String(open.length)}`);
  }
  return open[0].code.replace('CONFIRM', 'NO');
}

function checkInvariants(c: ExamCase, records: readonly TurnRecord[]): string[] {
  const failures: string[] = [];
  const acts = records.flatMap(r => r.acts);
  const took = (m: ToolMatcher) => acts.some(a =>
    (m.anyOf !== undefined ? m.anyOf.includes(a.call.tool) : a.call.tool === m.name)
    && (a.status === 'done' || a.status === 'unknown') && argsSubset(m.anyArgs, a.call.args));
  for (const m of c.invariants?.requiredToolCalls ?? []) {
    if (!took(m)) failures.push(`required call missing: ${
      m.anyOf !== undefined ? `any of ${m.anyOf.join('|')}` : m.name} ${JSON.stringify(m.anyArgs ?? {})}`);
  }
  for (const m of c.invariants?.noEffectToolCalls ?? []) {
    const effected = acts.some(a => a.call.tool === m.name && a.status === 'done'
      && argsSubset(m.anyArgs, a.call.args));
    if (effected) failures.push(`no-effect call took effect: ${m.name} ${JSON.stringify(m.anyArgs ?? {})}`);
  }
  return failures;
}

/** The expected desk per operator turn, walked against the sealed records' own
 *  routing — 'none' names the front desk's own refusal, and an inner array names
 *  a defensible SET, any member of which counts. Undeclared for a desk-pinned
 *  case, so this never runs there. */
function checkRoute(c: ExamCase, records: readonly TurnRecord[]): string[] {
  if (c.route === undefined) return [];
  const failures: string[] = [];
  c.route.forEach((expected, i) => {
    const got = records[i]?.routing?.desk ?? 'none';
    const wanted = Array.isArray(expected) ? expected : [expected];
    if (!wanted.includes(got)) {
      failures.push(`route mismatch at turn ${i + 1}: expected ${wanted.join('|')}, got ${got}`);
    }
  });
  return failures;
}

export class ExamRunner {
  async runCase(subject: Subject, c: ExamCase, variant: CaseDump['variant'],
                model: LoopRunModel, runDir: string): Promise<CaseDump> {
    // A case with `route` and no pinned `agent` plays through the routed house — one
    // shared declared world, every desk a certified target. A pinned case still
    // composes the ONE agent it always did, byte-identical.
    const routed = c.agent === undefined && c.route !== undefined;
    const records: TurnRecord[] = [];
    const usage: { turn: number; inputTokens: number; outputTokens: number;
      cachedInputTokens: number; reasoningTokens: number;
      wallClockMs: number; modelCalls: number }[] = [];
    let failure: CaseDump['failure'] = null;
    const incident = (e: unknown): void => {
      // A failed case never kills the campaign: every error is an incident row.
      const kind = e instanceof TurnFailure ? e.kind : 'construction';
      const detail = e instanceof TurnFailure ? e.detail
        : e instanceof Error ? e.message.split('\n')[0] : 'unknown failure';
      failure = { kind, detail };
      const hash = createHash('sha256')
        .update(`${c.id}|${variant}|${kind}|${detail}`).digest('hex').slice(0, 16);
      appendLine(runDir, 'failures.jsonl', { case: c.id, variant, kind, detail, hash });
    };

    let agent: LoopRunAgent | RoutedAgent | null = null;
    try {
      if (routed) {
        if (variant === 'ungoverned') {
          throw new TurnFailure('construction', 'a routed case has no ungoverned twin; run it governed');
        }
        if (!('card' in subject.world)) {
          throw new TurnFailure('construction',
            `case '${c.id}' names a route, but the subject's world is not declared — a `
            + 'routed house builds ONE shared world at its door, and only a declared world '
            + 'card can be built and handed to every desk.');
        }
        agent = RoutedAgent.fromSubject({ specs: subject.specs, contract: subject.contract,
          world: subject.world, model, preset: c.preset });
      } else {
        const agentName = c.agent ?? Object.keys(subject.specs)[0];
        const cfg: LoopRunConfig = { spec: subject.specs[agentName], contract: subject.contract,
          model, world: subject.world, preset: c.preset };
        agent = variant === 'governed' ? new LoopRunAgent(cfg) : new UngovernedAgent(cfg);
      }
    } catch (e: unknown) {
      incident(e);
    }

    for (const turn of agent === null ? [] : c.turns) {
      try {
        // The ungoverned twin never issues a question, so a consent turn plays
        // as the operator's plain word — the same message weight, no code.
        const text = typeof turn === 'string' ? turn
          : variant === 'ungoverned'
            ? ('decline' in turn ? 'No — do not.' : 'Yes — go ahead.')
          : 'decline' in turn ? declineText(openQuestions(records), c.id)
          : approvalText(Array.isArray(turn.approve) ? turn.approve : [turn.approve],
              openQuestions(records), records.flatMap(r => r.questions.issued), c.id);
        const started = Date.now();
        const out = await (agent as LoopRunAgent | RoutedAgent).generate(text, { session: c.id });
        records.push(out.loopRun);
        usage.push({ turn: out.loopRun.turn, ...out.loopRun.usage,
          wallClockMs: Date.now() - started });
      } catch (e: unknown) {
        incident(e);
        break;
      }
    }

    const dump: CaseDump = { case: c.id, variant, split: c.split, records,
      servedBy: records[0]?.servedBy ?? 'none',
      invariantFailures: failure === null
        ? [...checkInvariants(c, records), ...checkRoute(c, records)] : [], failure, usage };
    writeDump(runDir, dump);
    return dump;
  }
}
