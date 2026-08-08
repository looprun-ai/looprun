/**
 * @looprun-ai/eval — subject-level laws: does the EXAM cover what shipped, and does the WORLD tell
 * the runtime the truth.
 *
 * These two families catch the same species of defect and it is the worst species there is: a
 * failure with no symptom. A guard no case targets passes in both variants of a discrimination run —
 * it is not an alarm, not a failure, not anything; it is certified as coverage and never fired. A
 * world that returns its refusals as successful-looking results disarms the entire honesty layer
 * behind a green board: the guards are installed, the inventory shows them, the suite passes, and
 * not one of them can fire because nothing ever reports a failure.
 *
 * Both are decidable offline, against the deterministic world and the assembled specs.
 */
import type { AgentSpec, AgentWorld } from '@looprun-ai/core';
import type { Subject, SubjectCase } from './subject.js';

/** A name the lint is confident no real world declares. */
const IMPOSSIBLE_PRESET = '__looprun_lint_no_such_preset__';

/** Tools whose name asserts a write. Narrow on purpose — a false accusation here costs trust. */
const WRITE_NAME_RE = /^(create|update|delete|remove|set|add|send|issue|void|cancel|charge|release|pay|refund|resolve|place|transfer|retire|book|schedule|assign|close|open|apply|record)/;

/** Fields a world uses to explain a refusal it chose to RETURN instead of throw. */
const REFUSAL_FIELD_RE = /^(reason|error|refused|denied|blocked|rejected|failure|violation)$/i;

const guardIds = (spec: AgentSpec): string[] => [
  ...(spec.guards.onInput ?? []), ...(spec.guards.preTool ?? []),
  ...(spec.guards.postTool ?? []), ...(spec.guards.onReply ?? []),
].filter((b) => !b.disabled).map((b) => b.id);

/**
 * The guards a case is expected to target: the ones this BUNDLE chose.
 *
 * `always` is excluded — those two are the invariants the constructor installs on every spec in every
 * domain, and the engine proves them in its own suite. Demanding a per-subject case for each would
 * file the same finding against every bundle ever generated, which is how a census stops being read.
 * Every other priority stays in: `consent` arrives from this bundle's `destructiveTools`, `honesty`
 * from its `contract.writeTools`, `changeAllowed` from the bundle's own `contract.guards` binding at
 * that priority. Each is a declaration this bundle made, so exercising it is this bundle's job.
 */
const authoredGuardIds = (spec: AgentSpec): string[] => [
  ...(spec.guards.onInput ?? []), ...(spec.guards.preTool ?? []),
  ...(spec.guards.postTool ?? []), ...(spec.guards.onReply ?? []),
].filter((b) => !b.disabled && b.priority !== 'always').map((b) => b.id);

/** Which agent serves a case: the explicit routing map, else the single agent of a one-agent bundle. */
function routedAgent(subject: Subject, c: SubjectCase): string | undefined {
  const explicit = subject.caseAgent?.[c.id];
  if (explicit) return explicit;
  const ids = Object.keys(subject.specs ?? {});
  return ids.length === 1 ? ids[0] : undefined;
}

/** Every string a rubric item puts in front of the judge. */
const rubricText = (c: SubjectCase): string =>
  (c.expectations?.rubric ?? []).map((r) => `${r.id} ${r.description}`).join(' ');

/**
 * EXAM COVERAGE. `targets` is how a case says which rule it exists to prove; without it the question
 * "does this suite exercise the governance we ship?" has no answer at all.
 */
function coverageFindings(subject: Subject): string[] {
  const out: string[] = [];
  const inventory = new Set<string>();   // everything installed — what a target may legally name
  for (const spec of Object.values(subject.specs ?? {})) {
    for (const id of guardIds(spec)) inventory.add(id);
  }

  // A guard id is not unique across lanes: two specs may install `agent:sharedGate`, and a case that
  // targets it on one lane says nothing about the copy on the other. The diff is per (agent, guardId)
  // so a copy no case on ITS lane can reach still reads as uncovered.
  const key = (agent: string, id: string) => `${agent} ${id}`;
  const targeted = new Set<string>();
  for (const c of subject.cases ?? []) {
    const agent = routedAgent(subject, c);
    const spec = agent ? subject.specs[agent] : undefined;

    if (!c.targets?.length) {
      out.push(`case "${c.id}": CASE-WITHOUT-TARGET: names no rule it tests — without it, "does the suite exercise what we ship" is unanswerable`);
    }
    for (const t of c.targets ?? []) {
      if (agent) targeted.add(key(agent, t));
      if (!inventory.has(t)) {
        out.push(`case "${c.id}": PHANTOM-TARGET: targets '${t}', which matches no guard in the assembled inventory — remap it at the wire, or the case is proving nothing`);
      } else if (spec && !guardIds(spec).includes(t)) {
        out.push(`case "${c.id}": TARGET-ON-ANOTHER-AGENT: targets '${t}', installed on a different agent than the one this case routes to (${agent}) — the case can never reach it`);
      }
    }

    if (spec) {
      const surface = new Set(spec.surface.tools);
      const text = rubricText(c);
      for (const tok of new Set(text.match(/\b[a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*\b/g) ?? [])) {
        const known = Object.values(subject.specs).some((s) => s.surface.tools.includes(tok));
        if (known && !surface.has(tok)) {
          out.push(`case "${c.id}": RUBRIC-TOOL-OFF-SURFACE: a rubric item names '${tok}', which agent ${agent} does not have — the case cannot be passed as written`);
        }
      }
    }
  }

  for (const [agent, spec] of Object.entries(subject.specs ?? {})) {
    for (const id of authoredGuardIds(spec)) {
      if (targeted.has(key(agent, id))) continue;
      out.push(
        `GUARD-NEVER-TARGETED: '${id}' on agent ${agent} shipped and no case on that lane targets it — a guard the exam never exercises passes in BOTH variants of a discrimination run, so it reads as coverage while never having fired. Repair one of: write a case whose preset makes it deny; give the world the preset that condition needs. A gap here cannot be accepted, only closed`,
      );
    }
  }
  return out;
}

/** Construct a preset, reporting how it failed rather than letting the lint die. */
function tryPreset(make: (p?: string) => AgentWorld, preset: string): { world?: AgentWorld; error?: string } {
  try {
    return { world: make(preset) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * WORLD LAWS. Two questions, both answerable without a model: does a mis-typed preset fail loudly,
 * and does a refused write read as a failure to the runtime.
 */
function worldFindings(subject: Subject): string[] {
  const out: string[] = [];
  if (typeof subject.makeWorld !== 'function') return out;

  // Every preset the cases actually declare has to construct. A case whose preset throws is an exam
  // defect that only surfaces mid-run, after the spend.
  const declared = new Set<string>();
  for (const c of subject.cases ?? []) if (c.setup?.preset) declared.add(c.setup.preset);
  for (const p of declared) {
    const r = tryPreset(subject.makeWorld, p);
    if (r.error) out.push(`world: DECLARED-PRESET-THROWS: a case declares preset '${p}' and constructing it throws: ${r.error}`);
  }

  // A mis-typed preset name must not fall back in silence — that puts the case in the wrong state
  // and every assertion after it grades the wrong world.
  const unknown = tryPreset(subject.makeWorld, IMPOSSIBLE_PRESET);
  if (!unknown.error) {
    out.push('world: ACCEPTS-ANY-PRESET: the factory took an unknown preset name without throwing — a mis-typed setup.preset silently becomes the default, and the case then grades a state nobody chose');
  }

  // THE REFUSAL-AS-RESULT TRAP. The honesty kinds default to "the call executed", not "the action
  // took effect". A world that RETURNS its refusal instead of failing leaves `ok` true, and every
  // one of them short-circuits to null. Nothing else in the battery can see this.
  const simulate = tryPreset(subject.makeWorld, 'default');
  const world = simulate.world;
  if (world) {
    const writes = (subject.toolDefs ?? []).map((t) => t.name).filter((n) => WRITE_NAME_RE.test(n));
    for (const name of writes) {
      let result: unknown;
      try {
        result = world.exec(name, {});
      } catch {
        continue; // A throw is an honest failure — exactly what the runtime expects.
      }
      if (!result || typeof result !== 'object') continue;
      const r = result as Record<string, unknown>;
      if (r.ok === false || r.success === false) continue; // reported as a failure — correct.
      const refusalField = Object.keys(r).find((k) => REFUSAL_FIELD_RE.test(k) && r[k]);
      if (refusalField) {
        out.push(`world: REFUSED-WRITE-READS-OK: '${name}' returned a refusal ({${refusalField}: …}) with no ok:false — the runtime records that call as a SUCCESS, which disarms every honesty guard on this tool silently. Report a refused write as a failure, or pass the kind's own success predicate`);
      }
    }
  }
  return out;
}

/** A write the world carries out on the default preset and refuses on another is refused BY STATE —
 *  the differential is what makes the condition decidable without reading the world's source. */
function refusesWrite(world: AgentWorld, name: string): boolean {
  try {
    const r = world.exec(name, {}) as Record<string, unknown> | undefined;
    if (!r || typeof r !== 'object') return false;
    return r.ok === false || r.success === false;
  } catch {
    return false; // A throw on empty args is argument validation, not a state refusal.
  }
}

/** Does any preTool guard of this spec deny the call on this world? */
function anyGateDenies(spec: AgentSpec, world: AgentWorld, tool: string): boolean {
  return (spec.guards.preTool ?? []).filter((b) => !b.disabled).some((b) => {
    const target = b.target;
    if (Array.isArray(target) && !target.includes(tool)) return false;
    try {
      return typeof b.guard.check({
        tool, args: {}, world, observed: [], turnIndex: 0, userText: '', history: [], consent: [],
      } as never) === 'string';
    } catch {
      return false;
    }
  });
}

/**
 * A target the case can never make speak. The question is about STATE, not about the call list: a
 * guard bound to a tool the case never calls is doing its job when the case's forced path reaches it,
 * and it goes silent precisely when the agent complies. So the test is run BEFORE any compliance —
 * an empty `observed`, on the world the case declares — and a target that stays silent on every one
 * of them proves nothing wherever it is listed.
 *
 * Only world-dim gates are decidable this way: a guard that reads the acting call's arguments cannot
 * be evaluated without inventing them, and an invented argument is an invented accusation.
 */
const WORLD_GATE_KINDS = new Set(['precondition', 'consentRequired']);

function targetSilenceFindings(subject: Subject): string[] {
  const out: string[] = [];
  if (typeof subject.makeWorld !== 'function') return out;
  for (const c of subject.cases ?? []) {
    const agent = routedAgent(subject, c);
    const spec = agent ? subject.specs?.[agent] : undefined;
    if (!spec) continue;
    const world = tryPreset(subject.makeWorld, c.setup?.preset ?? 'default').world;
    if (!world) continue;
    for (const id of c.targets ?? []) {
      const bound = (spec.guards.preTool ?? []).find((b) => b.id === id && !b.disabled);
      if (!bound || !WORLD_GATE_KINDS.has(bound.guard.kind)) continue;
      const tools = Array.isArray(bound.target) ? bound.target : spec.surface.tools;
      const speaks = tools.some((tool) => {
        try {
          return typeof bound.guard.check({
            tool, args: {}, world, observed: [], turnIndex: 0, userText: '', history: [], consent: [],
          } as never) === 'string';
        } catch {
          return true; // A guard that throws here is a defect of its own; the execution lint owns it.
        }
      });
      if (!speaks) {
        out.push(
          `TARGET-SILENT-ON-EVERY-PRESET: case "${c.id}" targets '${id}', which is silent on preset '${c.setup?.preset ?? 'default'}' before the agent has done anything — ` +
            'the case grades a rule that cannot speak there. Run the case on the preset whose state the guard refuses, or target the rule the case really tests',
        );
      }
    }
  }
  return out;
}

/**
 * THE PARITY LAW. A world refuses a write under some condition; a preset is that condition made
 * reachable. Every lane that carries the write must have a spec-side gate that denies on that preset —
 * otherwise the refusal reaches the model as a tool failure and the lane's prose invents the reason.
 * One declaration satisfies it for every lane (a `writeTools` binding at priority `changeAllowed` on
 * `contract.guards`); six copies satisfy it too, and that is the shape this law exists to make
 * unnecessary rather than to forbid.
 */
function parityFindings(subject: Subject): string[] {
  const out: string[] = [];
  if (typeof subject.makeWorld !== 'function') return out;
  const base = tryPreset(subject.makeWorld, 'default').world;
  if (!base) return out;
  const declaredWrites = subject.contract?.writeTools;
  const writes = new Set(
    declaredWrites?.length
      ? declaredWrites
      : (subject.toolDefs ?? []).map((t) => t.name).filter((n) => WRITE_NAME_RE.test(n)),
  );
  const presets = new Set<string>();
  for (const c of subject.cases ?? []) if (c.setup?.preset && c.setup.preset !== 'default') presets.add(c.setup.preset);

  for (const preset of presets) {
    const world = tryPreset(subject.makeWorld, preset).world;
    if (!world) continue;
    for (const tool of writes) {
      if (!refusesWrite(world, tool) || refusesWrite(base, tool)) continue;
      for (const [agent, spec] of Object.entries(subject.specs ?? {})) {
        if (!spec.surface.tools.includes(tool)) continue;
        if (anyGateDenies(spec, world, tool)) continue;
        out.push(
          `WRITE-REFUSED-UNGATED: preset '${preset}' refuses '${tool}' and agent ${agent} carries it with no gate that denies there — ` +
            'the refusal reaches the model as a tool failure and the reply invents its reason. Declare a writeTools binding at priority changeAllowed on contract.guards, or gate the lane on the same condition',
        );
      }
    }
  }
  return out;
}

/** The subject-level battery: exam coverage + the world's ok/failed contract + write-gate parity. */
export function lintSubject(subject: Subject): string[] {
  return [
    ...coverageFindings(subject),
    ...worldFindings(subject),
    ...parityFindings(subject),
    ...targetSilenceFindings(subject),
  ];
}
