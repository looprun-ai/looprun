/**
 * @looprun-ai/eval — `looprun-eval validate`: three offline layers over a subject, replacing the
 * subject-minted lints/tests that used to police the exam by hand.
 *
 *   1. SCHEMA      — every config the subject ships (`norms/*.json`, `evals/cases.json`) parses under
 *                    its zod loader. A malformed config fails HERE, by name, not mid-run after spend.
 *   2. REFERENCES  — every `targets` id names a guard in the assembled inventory; every `setup.preset`
 *                    constructs; every case routes to a real agent; reverse-coverage (a guard no case
 *                    targets) is reported as ADVISORY with a justification hook.
 *   3. PREMISE     — premise coherence, generalizing the run's `premise.test.ts` WITHOUT its hand
 *                    exclusions. It replays a case's required writes in declaration order against the
 *                    world its preset builds and asks whether the case's premise is even reachable:
 *                    a required write the world REFUSES (the case can never pass), a forbidden write
 *                    the world ACCEPTS (the case forbids nothing — accept-when-should-forbid), a
 *                    forbidden READ (forbidding a query enforces nothing — read-side). Consent-timing
 *                    entries (`confirmed:true`) are the two-step's own business and are skipped;
 *                    chains the replayer cannot construct (multi-turn) are SKIPPED LOUDLY and counted
 *                    against a reached-verdict FLOOR — because pass-by-inability is exactly how the
 *                    Atlas defects survived a green board.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentSpec, AgentWorld } from '@looprun-ai/core';
import type { ReqCall, Subject, SubjectCase } from './subject.js';
import { loadNormsConfig, NormsConfigError } from './norms-config.js';
import { parseCasesConfig, CasesConfigError } from './cases-config.js';

/** The default reached-verdict floor: at least half the cases must be replayable, or the suite is
 *  policing itself by inability. A RATIO, tunable per subject — never a hardcoded count. */
export const DEFAULT_REACHED_FLOOR = 0.5;

export interface ValidateOptions {
  /** Minimum fraction of cases the premise replayer must actually reach (default {@link DEFAULT_REACHED_FLOOR}). */
  reachedFloor?: number;
}

export interface ValidateReport {
  schema: string[];
  references: string[];
  premise: string[];
  /** Advisory-only lines (reverse-coverage) — reported, but not a failure. */
  advisory: string[];
}

// ── Layer 1: SCHEMA ───────────────────────────────────────────────────────────────────────────────

/** Parse every JSON config the subject dir ships. A subject that installs guards through TS keeps
 *  working (no `norms/*.json` = nothing to schema-check); a JSON exam is validated by its loader. */
export function checkSchema(subjectDir: string): string[] {
  const issues: string[] = [];
  let normsFiles: string[] = [];
  try {
    normsFiles = readdirSync(join(subjectDir, 'norms')).filter((f) => f.endsWith('.json'));
  } catch {
    /* no norms dir — nothing to schema-check */
  }
  for (const f of normsFiles) {
    try {
      loadNormsConfig(JSON.parse(readFileSync(join(subjectDir, 'norms', f), 'utf8')));
    } catch (e) {
      const msg = e instanceof NormsConfigError ? e.message : `norms/${f}: ${(e as Error).message}`;
      issues.push(`schema: norms/${f}: ${msg}`);
    }
  }
  try {
    const raw = readFileSync(join(subjectDir, 'evals', 'cases.json'), 'utf8');
    try {
      parseCasesConfig(JSON.parse(raw));
    } catch (e) {
      const msg = e instanceof CasesConfigError ? e.message : (e as Error).message;
      issues.push(`schema: evals/cases.json: ${msg}`);
    }
  } catch {
    /* no cases.json — the subject authors cases in TS; nothing to schema-check */
  }
  return issues;
}

// ── Layer 2: REFERENCES ─────────────────────────────────────────────────────────────────────────

const allGuardIds = (spec: AgentSpec): string[] => [
  ...(spec.guards.onInput ?? []), ...(spec.guards.preTool ?? []),
  ...(spec.guards.postTool ?? []), ...(spec.guards.onReply ?? []),
].filter((b) => !b.disabled).map((b) => b.id);

const authoredGuardIds = (spec: AgentSpec): string[] => [
  ...(spec.guards.onInput ?? []), ...(spec.guards.preTool ?? []),
  ...(spec.guards.postTool ?? []), ...(spec.guards.onReply ?? []),
].filter((b) => !b.disabled && b.layer !== 'minimal').map((b) => b.id);

function routedAgent(subject: Subject, c: SubjectCase): string | undefined {
  const explicit = subject.caseAgent?.[c.id];
  if (explicit) return explicit;
  const ids = Object.keys(subject.specs ?? {});
  return ids.length === 1 ? ids[0] : undefined;
}

/** References: targets exist, presets construct, every case routes. Reverse-coverage → advisory[]. */
export function checkReferences(subject: Subject): { blocking: string[]; advisory: string[] } {
  const blocking: string[] = [];
  const advisory: string[] = [];

  const inventory = new Set<string>();
  const authored = new Set<string>();
  for (const spec of Object.values(subject.specs ?? {})) {
    for (const id of allGuardIds(spec)) inventory.add(id);
    for (const id of authoredGuardIds(spec)) authored.add(id);
  }

  const targeted = new Set<string>();
  const presetCache = new Map<string, string | undefined>(); // preset → construction error (or undefined = ok)
  for (const c of subject.cases ?? []) {
    const agent = routedAgent(subject, c);
    if (!agent) blocking.push(`references: case "${c.id}" routes to no agent (no CASE_AGENT entry, and the subject has multiple specs)`);
    else if (!subject.specs[agent]) blocking.push(`references: case "${c.id}" routes to unknown agent "${agent}"`);

    for (const t of c.targets ?? []) {
      targeted.add(t);
      if (!inventory.has(t)) blocking.push(`references: case "${c.id}" targets "${t}", which names no guard in the assembled inventory`);
    }

    const preset = c.setup?.preset ?? 'default';
    if (!presetCache.has(preset)) {
      try {
        subject.makeWorld(preset);
        presetCache.set(preset, undefined);
      } catch (e) {
        presetCache.set(preset, (e as Error).message);
      }
    }
    const err = presetCache.get(preset);
    if (err) blocking.push(`references: case "${c.id}" declares preset "${preset}", which fails to construct: ${err}`);
  }

  for (const id of authored) {
    if (!targeted.has(id)) advisory.push(`references: guard "${id}" is targeted by no case (reverse-coverage) — justify it in the ledger or add a case`);
  }
  return { blocking, advisory };
}

// ── Layer 3: PREMISE COHERENCE ───────────────────────────────────────────────────────────────────

type WriteVerdict = 'accepted' | 'refused' | 'read';

/** Classify what the world did with a replayed call: a write it accepted, a write it refused, or a
 *  read (no state effect). Keys on the deterministic-world conventions the honesty layer already
 *  relies on: `ok:false`/`success:false` = refused; a pushed `toolCalls` entry with `tookEffect:true`
 *  = an accepted write; anything else = a read. */
function replay(world: AgentWorld, call: ReqCall): WriteVerdict {
  const before = Array.isArray(world.toolCalls) ? world.toolCalls.length : 0;
  const res = world.exec(call.name, (call.anyArgs ?? {}) as Record<string, unknown>);
  const after = Array.isArray(world.toolCalls) ? world.toolCalls.length : 0;
  const entry = after > before ? (world.toolCalls[after - 1] as Record<string, unknown> | undefined) : undefined;
  const r = (res && typeof res === 'object' ? res : {}) as Record<string, unknown>;
  const entryResult = (entry?.result && typeof entry.result === 'object' ? entry.result : {}) as Record<string, unknown>;
  if (r.ok === false || r.success === false || entryResult.ok === false || entryResult.success === false) return 'refused';
  if (entry?.tookEffect === true) return 'accepted';
  return 'read';
}

/** A consent-timing entry — the two-step protocol's own business (`confirmed:true`), never a premise
 *  defect. Skipped, not fired. */
const isConsentTiming = (call: ReqCall): boolean => call.anyArgs?.confirmed === true;

export interface PremiseReport {
  issues: string[];
  /** Cases the replayer could actually reach a verdict on. */
  reached: number;
  total: number;
  /** The floor applied (ratio). */
  floor: number;
}

/**
 * Premise coherence over a subject's cases. Returns fired issues plus the reached/total accounting the
 * floor is computed from. A case is NOT reached when the replayer cannot construct its chain
 * (multi-turn); every such skip is a LOUD line, and when too many pile up the floor itself fires.
 */
export function checkPremiseCoherence(subject: Subject, opts: ValidateOptions = {}): PremiseReport {
  const floor = opts.reachedFloor ?? DEFAULT_REACHED_FLOOR;
  const issues: string[] = [];
  const cases = subject.cases ?? [];
  let reached = 0;

  for (const c of cases) {
    // A multi-turn case's later writes depend on state earlier turns build from user input the
    // replayer has no way to reproduce. Rather than replay a wrong world, SKIP LOUDLY.
    if ((c.turns?.length ?? 0) > 1) {
      issues.push(`premise: SKIPPED "${c.id}": multi-turn (${c.turns.length} turns) — the replayer cannot construct cross-turn state; verify its premise by hand`);
      continue;
    }
    reached++;

    let world: AgentWorld;
    try {
      world = subject.makeWorld(c.setup?.preset ?? 'default');
    } catch (e) {
      // A preset that throws is a references-layer defect; here we simply cannot reach a verdict.
      reached--;
      issues.push(`premise: SKIPPED "${c.id}": preset "${c.setup?.preset ?? 'default'}" threw (${(e as Error).message}) — cannot replay`);
      continue;
    }

    const inv = c.expectations?.invariants;
    for (const call of inv?.requiredToolCalls ?? []) {
      if (isConsentTiming(call)) continue;
      if (replay(world, call) === 'refused') {
        issues.push(`premise: "${c.id}": required write "${call.name}"${argNote(call)} is REFUSED by preset "${c.setup?.preset ?? 'default'}" — the case can never pass`);
      }
    }
    for (const call of inv?.forbiddenToolCalls ?? []) {
      if (isConsentTiming(call)) continue;
      const verdict = replay(world, call);
      if (verdict === 'read') {
        issues.push(`premise: "${c.id}": forbidden entry "${call.name}"${argNote(call)} is a read-side tool (no write effect) — forbidding it enforces nothing`);
      } else if (verdict === 'accepted') {
        issues.push(`premise: "${c.id}": forbidden write "${call.name}"${argNote(call)} is ACCEPTED by preset "${c.setup?.preset ?? 'default'}" — the case forbids nothing (the preset never puts it in a refusing state)`);
      }
    }
  }

  const total = cases.length;
  if (total > 0 && reached / total < floor) {
    issues.push(
      `premise: reached-verdict floor breached: ${reached}/${total} cases reached (${(reached / total).toFixed(2)}) < floor ${floor} — too many cases skipped; the exam is passing by inability`,
    );
  }
  return { issues, reached, total, floor };
}

const argNote = (call: ReqCall): string => (call.anyArgs && Object.keys(call.anyArgs).length ? ` (${JSON.stringify(call.anyArgs)})` : '');

// ── Orchestration ────────────────────────────────────────────────────────────────────────────────

/** Run all three layers. `subjectDir` feeds the schema layer (JSON on disk); `subject` is the loaded
 *  bundle the reference + premise layers reason over. */
export function validateSubjectConfig(subjectDir: string, subject: Subject, opts: ValidateOptions = {}): ValidateReport {
  const references = checkReferences(subject);
  return {
    schema: checkSchema(subjectDir),
    references: references.blocking,
    premise: checkPremiseCoherence(subject, opts).issues,
    advisory: references.advisory,
  };
}
