/**
 * @looprun-ai/eval — `looprun-eval validate`: three offline layers over a subject, so the exam is
 * policed by the instrument rather than by subject-minted lints and tests.
 *
 *   1. SCHEMA      — every config the subject ships (`norms/*.json`, `evals/cases.json`) parses under
 *                    its zod loader. A malformed config fails HERE, by name, not mid-run after spend.
 *   2. REFERENCES  — every `targets` id names a guard in the assembled inventory; every `setup.preset`
 *                    constructs; every case routes to a real agent; reverse-coverage (a guard no case
 *                    targets) is reported as ADVISORY with a justification hook.
 *   3. PREMISE     — premise coherence, applied to every case with NO hand exclusions: an exclusion
 *                    list is a way to hide an incoherent case. It replays a case's required writes
 *                    in declaration order against the world its preset builds and asks whether the
 *                    case's premise is even reachable:
 *                    a required write the world REFUSES (the case can never pass), a forbidden write
 *                    the world ACCEPTS (the case forbids nothing — accept-when-should-forbid), a
 *                    forbidden READ (forbidding a query enforces nothing — read-side). Consent-timing
 *                    entries (`confirmed:true`) are the two-step's own business and are skipped;
 *                    chains the replayer cannot construct (multi-turn) are SKIPPED LOUDLY and counted
 *                    against a reached-verdict FLOOR — because pass-by-inability is exactly how a
 *                    real defect survives a green board.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentSpec, AgentWorld } from '@looprun-ai/core';
import type { ReqCall, Subject, SubjectCase } from './subject.js';
import { loadNormsConfig, NormsConfigError } from './norms-config.js';
import { parseCasesConfig, CasesConfigError } from './cases-config.js';
import { loadWorldConfig, WorldConfigError } from './world-config.js';

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
  /** World-model layers (spec §3b) — run ONLY when the subject ships `gen/world.json`; empty otherwise. */
  world: string[];
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
    if (!targeted.has(id)) advisory.push(`references: guard "${id}" is targeted by no case (reverse-coverage) — justify it in the actionHistory or add a case`);
  }
  return { blocking, advisory };
}

// ── Layer 3: PREMISE COHERENCE ───────────────────────────────────────────────────────────────────

type WriteVerdict = 'accepted' | 'refused' | 'read';

/** Classify what the world did with a replayed call: a write it accepted, a write it refused, or a
 *  read (no state effect). Keys on the deterministic-world conventions the honesty layer already
 *  relies on: `ok:false`/`success:false` = refused; a pushed `toolCalls` entry with `tookEffect:true`
 *  = an accepted write; anything else = a read.
 *
 *  CAVEAT: the replay uses only the invariant's `anyArgs` SUBSET. When that subset omits an arg the
 *  tool's own schema declares REQUIRED, the world's RECEPTION layer refuses the call before any premise
 *  gate runs (an INVALID_ / MISSING_ reception error) — a refusal that says nothing about the premise. Such a call is
 *  detected up-front (see {@link missingRequiredArgs}) and SKIPPED as inconclusive rather than replayed,
 *  so a reception refusal is never misread as "the required write can never pass". Even when every
 *  required arg is present, an `anyArgs` that under-specifies the ENTITY (e.g. it pins a status but not
 *  the target id) may resolve a DIFFERENT record than the case means — anchor `anyArgs` to the entity
 *  when the premise verdict must be trusted. */
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

/** The declared REQUIRED args per tool, read from each toolDef's `inputSchema.required`. A tool with
 *  no `required` array contributes an empty set (nothing to under-specify). */
function requiredArgsByTool(subject: Subject): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const def of subject.toolDefs ?? []) {
    const schema = def.inputSchema as { required?: unknown } | undefined;
    const req = Array.isArray(schema?.required) ? schema.required.filter((x): x is string => typeof x === 'string') : [];
    out.set(def.name, req);
  }
  return out;
}

/** The schema-required args a replayed call would NOT carry. When non-empty the world's RECEPTION layer
 *  would refuse the call for the missing arg — a refusal orthogonal to the premise — so the replay is
 *  INCONCLUSIVE and must be skipped, not classified. */
function missingRequiredArgs(reqByTool: Map<string, string[]>, call: ReqCall): string[] {
  const required = reqByTool.get(call.name) ?? [];
  const provided = call.anyArgs ?? {};
  return required.filter((k) => !(k in provided));
}

export interface PremiseReport {
  /** Real premise defects — a case that can never pass / forbids nothing / read-side, plus the floor
   *  breach. Consumed as blocking. */
  blocking: string[];
  /** Inconclusive skips — multi-turn, preset threw, under-specified replay. Loud but not a failure. */
  advisory: string[];
  /** Cases the replayer could actually reach a verdict on. */
  reached: number;
  total: number;
  /** Cases the instrument declined jurisdiction over (subset-pinned invariant, no verdict landed).
   *  These leave the floor DENOMINATOR — they are legitimate exam design, not inability. */
  outOfJurisdiction: number;
  /** The floor applied (ratio). */
  floor: number;
}

/**
 * Premise coherence over a subject's cases, split into {@link PremiseReport.blocking} real defects and
 * {@link PremiseReport.advisory} inconclusive skips.
 *
 * The reached-verdict FLOOR guards against a suite passing by INABILITY — cases the replayer cannot
 * reach. Multi-turn (cross-turn state) and preset-threw ARE inability: they stay in the floor
 * DENOMINATOR, and when too many pile up the floor breaches (blocking). An UNDER-SPECIFIED replay is a
 * different thing entirely — the invariant deliberately pins only a subset of the call's args (the
 * runner matches on that subset), so the premise instrument is DECLINING JURISDICTION over it, not
 * failing to reach it. Those cases are advisory AND leave the denominator: floor = reached / (total −
 * outOfJurisdiction).
 */
export function checkPremiseCoherence(subject: Subject, opts: ValidateOptions = {}): PremiseReport {
  const floor = opts.reachedFloor ?? DEFAULT_REACHED_FLOOR;
  const blocking: string[] = [];
  const advisory: string[] = [];
  const cases = subject.cases ?? [];
  const reqByTool = requiredArgsByTool(subject);
  let reached = 0;
  let outOfJurisdiction = 0;

  for (const c of cases) {
    // A multi-turn case's later writes depend on state earlier turns build from user input the
    // replayer has no way to reproduce. Rather than replay a wrong world, SKIP LOUDLY (advisory).
    if ((c.turns?.length ?? 0) > 1) {
      advisory.push(`premise: SKIPPED "${c.id}": multi-turn (${c.turns.length} turns) — the replayer cannot construct cross-turn state; verify its premise by hand`);
      continue;
    }

    const preset = c.setup?.preset ?? 'default';
    let world: AgentWorld;
    try {
      world = subject.makeWorld(preset);
    } catch (e) {
      // A preset that throws is a references-layer defect; here we simply cannot reach a verdict.
      advisory.push(`premise: SKIPPED "${c.id}": preset "${preset}" threw (${(e as Error).message}) — cannot replay`);
      continue;
    }

    const inv = c.expectations?.invariants;
    let verdictReached = false; // any call this case actually replayed to a premise verdict
    let underSpecSkip = false; // any call skipped as inconclusive for a missing required arg

    for (const call of inv?.requiredToolCalls ?? []) {
      if (isConsentTiming(call)) continue;
      const missing = missingRequiredArgs(reqByTool, call);
      if (missing.length) {
        underSpecSkip = true;
        advisory.push(`premise: SKIPPED "${c.id}": required write "${call.name}"${argNote(call)} omits schema-required arg(s) ${missing.join(', ')} — out of the premise instrument's jurisdiction (subset-pinned invariant; the replay would hit RECEPTION, not the premise gate)`);
        continue;
      }
      verdictReached = true;
      if (replay(world, call) === 'refused') {
        blocking.push(`premise: "${c.id}": required write "${call.name}"${argNote(call)} is REFUSED by preset "${preset}" — the case can never pass`);
      }
    }
    for (const call of inv?.forbiddenToolCalls ?? []) {
      if (isConsentTiming(call)) continue;
      const missing = missingRequiredArgs(reqByTool, call);
      if (missing.length) {
        underSpecSkip = true;
        advisory.push(`premise: SKIPPED "${c.id}": forbidden entry "${call.name}"${argNote(call)} omits schema-required arg(s) ${missing.join(', ')} — out of the premise instrument's jurisdiction (subset-pinned invariant; the replay would hit RECEPTION, not the premise gate)`);
        continue;
      }
      verdictReached = true;
      const verdict = replay(world, call);
      if (verdict === 'read') {
        blocking.push(`premise: "${c.id}": forbidden entry "${call.name}"${argNote(call)} is a read-side tool (no write effect) — forbidding it enforces nothing`);
      } else if (verdict === 'accepted') {
        blocking.push(`premise: "${c.id}": forbidden write "${call.name}"${argNote(call)} is ACCEPTED by preset "${preset}" — the case forbids nothing (the preset never puts it in a refusing state)`);
      }
    }

    // A case whose ONLY skip is under-specification (and no other call landed a verdict) is out of the
    // instrument's jurisdiction — a subset-pinned invariant, legitimate exam design. It leaves the floor
    // denominator entirely. Everything else (a verdict landed, no invariants, or a consent-timing-only
    // skip) is reached — those are intentional exclusions, not inability.
    if (underSpecSkip && !verdictReached) outOfJurisdiction++;
    else reached++;
  }

  const total = cases.length;
  const denom = total - outOfJurisdiction; // inability floor: jurisdiction declines leave the denominator
  if (denom > 0 && reached / denom < floor) {
    blocking.push(
      `premise: reached-verdict floor breached: ${reached}/${denom} reachable cases reached (${(reached / denom).toFixed(2)}) < floor ${floor} — too many cases the replayer cannot construct; the exam is passing by inability`,
    );
  }
  return { blocking, advisory, reached, total, outOfJurisdiction, floor };
}

const argNote = (call: ReqCall): string => (call.anyArgs && Object.keys(call.anyArgs).length ? ` (${JSON.stringify(call.anyArgs)})` : '');

// ── Layer 4: WORLD MODEL (spec §3b) — only when the subject ships gen/world.json ─────────────────────

/** The raw world.json shape the world layers introspect (tool/arg/preset structure). */
interface RawArg {
  name: string;
  type: string;
  optional?: boolean;
}
interface RawTool {
  twoStep?: boolean;
  args?: RawArg[];
  custom?: string;
}
interface RawWorld {
  tools?: Record<string, RawTool>;
  presets?: Record<string, unknown>;
}

const NON_CONFIRM_TYPES = new Set(['string', 'number', 'boolean']);

/** Synthesize a minimal, type-correct arg set for a tool so RECEPTION never throws on a missing
 *  required arg. `confirmed` is excluded (the two-step simulate/confirm lever the identity check drives). */
function synthArgs(args: RawArg[] | undefined, includeOptional: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of args ?? []) {
    if (a.name === 'confirmed') continue;
    if (a.optional && !includeOptional) continue;
    if (!NON_CONFIRM_TYPES.has(a.type)) continue;
    out[a.name] = a.type === 'number' ? 1 : a.type === 'boolean' ? false : 'x';
  }
  return out;
}

/** The gate DECISION a call resolved to: the deny error string, or null when gates passed (simulation or
 *  effect). Simulate and confirm must land the SAME decision — that IS simulate≡confirm identity. */
function gateDecision(result: unknown): string | null {
  const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
  return r.ok === false ? String(r.error ?? 'DENIED') : null;
}

const stable = (v: unknown): string => JSON.stringify(v);

/**
 * The three world layers over a subject that ships `gen/world.json`:
 *   1. PRESET DISTINGUISHABILITY — every declared preset (other than `default`) yields a projection
 *      DIFFERENT from default's; an indistinguishable preset is dead wiring (the wrong-record class).
 *   2. SIMULATE≡CONFIRM IDENTITY — for every `twoStep` tool, a simulate and a confirm resolve the SAME gate
 *      decision (mechanical, via the 3a machinery: gates run before the two-step branch).
 *   3. DETERMINISM — the same preset + the same call sequence yields a deep-equal projection, run twice
 *      (catches a `custom` executor that reaches for a clock or RNG).
 *
 * Returns issue strings (empty = clean, or no world.json = nothing to check).
 */
export function checkWorldModel(subjectDir: string): string[] {
  const path = join(subjectDir, 'gen', 'world.json');
  if (!existsSync(path)) return []; // TS worlds ship no `gen/world.json` — nothing to check here.

  const issues: string[] = [];
  let raw: RawWorld;
  let factory: (preset?: string) => AgentWorld;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as RawWorld;
    factory = loadWorldConfig(raw);
  } catch (e) {
    const msg = e instanceof WorldConfigError ? e.message : (e as Error).message;
    return [`world: gen/world.json failed to load: ${msg}`]; // schema-layer already reported it too.
  }

  const presetNames = Object.keys(raw.presets ?? {});
  const tools = raw.tools ?? {};

  // 1. Preset distinguishability.
  let defaultProj: string;
  try {
    defaultProj = stable(factory('default').projection());
  } catch (e) {
    return [`world: the 'default' preset does not construct: ${(e as Error).message}`];
  }
  for (const preset of presetNames) {
    if (preset === 'default') continue;
    try {
      if (stable(factory(preset).projection()) === defaultProj) {
        issues.push(`world: preset "${preset}" is INDISTINGUISHABLE from default — its projection is byte-identical, so the preset seeds nothing (a wrong-record / dead-preset defect)`);
      }
    } catch (e) {
      issues.push(`world: preset "${preset}" does not construct: ${(e as Error).message}`);
    }
  }

  // 2. Simulate ≡ confirm identity, per twoStep tool.
  for (const [name, tool] of Object.entries(tools)) {
    if (!tool.twoStep) continue;
    const args = synthArgs(tool.args, true);
    try {
      const simulate = gateDecision(factory('default').exec(name, args));
      const confirm = gateDecision(factory('default').exec(name, { ...args, confirmed: true }));
      if (simulate !== confirm) {
        issues.push(`world: twoStep tool "${name}" breaks simulate≡confirm identity — simulate gate decision ${JSON.stringify(simulate)} ≠ confirm ${JSON.stringify(confirm)}`);
      }
    } catch (e) {
      issues.push(`world: twoStep tool "${name}" threw during the simulate≡confirm check: ${(e as Error).message}`);
    }
  }

  // 3. Determinism: same preset + same synthesized sequence ⇒ deep-equal projection, twice.
  const sequence = Object.entries(tools).map(([name, t]) => ({ name, args: synthArgs(t.args, false) }));
  for (const preset of presetNames) {
    const run = (): string => {
      const w = factory(preset);
      for (const call of sequence) {
        try {
          w.exec(call.name, call.args);
        } catch {
          /* a synthesized call the world rejects is fine — determinism is about REPEATABILITY */
        }
      }
      return stable(w.projection());
    };
    try {
      if (run() !== run()) {
        issues.push(`world: preset "${preset}" is NON-DETERMINISTIC — the same call sequence produced two different projections (a clock/RNG leaked into the world)`);
      }
    } catch (e) {
      issues.push(`world: preset "${preset}" threw during the determinism check: ${(e as Error).message}`);
    }
  }

  return issues;
}

// ── Orchestration ────────────────────────────────────────────────────────────────────────────────

/** Run all three layers. `subjectDir` feeds the schema layer (JSON on disk); `subject` is the loaded
 *  bundle the reference + premise layers reason over. */
export function validateSubjectConfig(subjectDir: string, subject: Subject, opts: ValidateOptions = {}): ValidateReport {
  const references = checkReferences(subject);
  const premise = checkPremiseCoherence(subject, opts);
  return {
    schema: checkSchema(subjectDir),
    references: references.blocking,
    premise: premise.blocking,
    world: checkWorldModel(subjectDir),
    advisory: [...references.advisory, ...premise.advisory],
  };
}
