/**
 * @looprun-ai/eval — subject loader. Resolves a generated subject directory into the pieces
 * the runner needs: the SPECS map + domain CONTRACT (+ optional CASE_AGENT routing) from
 * `norms/index`, the deterministic world factory from `gen/world`, the case pack from
 * `evals/cases`, the agent-facing tool defs from `gen/tools.json`, and the declared model
 * target from `ask/targets.json` (a transparent default — flags/env only override it).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderAssembledPrompt } from '@looprun-ai/core/internal';
import type { AgentSpec, AgentWorld, DomainContract, ToolDef } from '@looprun-ai/core';
import { parseCasesConfig } from './cases-config.js';
import { loadWorldConfig, type WorldConfigDeps } from './world-config.js';

export interface CaseTurn {
  userText: string;
}

export interface ReqCall {
  name: string;
  /** Shallow subset match: every key/value here must strictly equal the observed call's arg. */
  anyArgs?: Record<string, unknown>;
}

export interface CaseInvariants {
  requiredToolCalls?: ReqCall[];
  forbiddenToolCalls?: ReqCall[];
}

export interface RubricItem {
  id: string;
  description: string;
  critical?: boolean;
}

export interface SubjectCase {
  id: string;
  title?: string;
  setup?: { preset?: string; clearConversation?: boolean };
  turns: CaseTurn[];
  expectations?: { invariants?: CaseInvariants; rubric?: RubricItem[] };
  targets?: string[];
}

export interface Subject {
  dir: string;
  specs: Record<string, AgentSpec>;
  contract: DomainContract;
  caseAgent: Record<string, string>;
  cases: SubjectCase[];
  toolDefs: ToolDef[];
  makeWorld: (preset?: string) => AgentWorld;
}

/** The declared model target recorded by the subject's ASK phase (`ask/targets.json`). */
export interface DeclaredTarget {
  model?: string;
  provider?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  thinking?: boolean;
}

/** Read the first declared target from `ask/targets.json` (missing file = empty target). */
export function readDeclaredTarget(subjectDir: string): DeclaredTarget {
  try {
    const t = JSON.parse(readFileSync(join(subjectDir, 'ask', 'targets.json'), 'utf8'));
    return (Array.isArray(t.targets) ? t.targets[0] : t.targets) ?? {};
  } catch {
    return {};
  }
}

/** Pick the world constructor from the gen/world module: an explicit `worldFactory`
 *  export wins; otherwise the first exported class whose prototype carries `exec`. */
function resolveWorldFactory(mod: Record<string, unknown>): (preset?: string) => AgentWorld {
  const factory = mod.worldFactory;
  if (typeof factory === 'function' && !factory.prototype?.exec) {
    return (preset?: string) => (factory as (p?: string) => AgentWorld)(preset);
  }
  for (const value of Object.values(mod)) {
    if (typeof value === 'function' && typeof value.prototype?.exec === 'function') {
      const Ctor = value as new (preset?: string) => AgentWorld;
      return (preset?: string) => new Ctor(preset);
    }
  }
  throw new Error('gen/world exports no world factory (no class with an exec method)');
}

/** Tool defs come from gen/tools.json; the file uses `parameters`, the engine wants `inputSchema`. */
function readToolDefs(dir: string): ToolDef[] {
  const raw = JSON.parse(readFileSync(join(dir, 'gen', 'tools.json'), 'utf8')) as
    | Array<Record<string, unknown>>
    | { tools: Array<Record<string, unknown>> };
  const list = Array.isArray(raw) ? raw : raw.tools;
  if (!Array.isArray(list)) throw new Error('gen/tools.json: expected an array or a { tools: [] } object');
  return list.map((t) => ({
    name: String(t.name),
    description: String(t.description ?? ''),
    inputSchema: (t.inputSchema ?? t.parameters ?? { type: 'object', properties: {} }) as Record<string, unknown>,
  }));
}

const MODULE_EXTS = ['.ts', '.mts', '.js', '.mjs'];

/** Resolve a subject module by base path, trying .ts/.mts/.js/.mjs (TS subjects need a Node
 *  version with type stripping; plain-JS subjects run everywhere). */
function moduleUrl(dir: string, base: string): string {
  for (const ext of MODULE_EXTS) {
    const p = join(dir, base + ext);
    if (existsSync(p)) return pathToFileURL(p).href;
  }
  throw new Error(`${dir}/${base}.{ts,mts,js,mjs} not found`);
}

/** Read the JSON exam when it exists (`evals/cases.json` — spec §1). Structured data makes anchored
 *  edits trivial and bulk-regex corruption pointless. The JSON is self-routing, so it contributes a
 *  per-case `agent` map layered UNDER any explicit `norms/index` CASE_AGENT. */
function readCasesJson(dir: string): { cases: SubjectCase[]; caseAgent: Record<string, string> } | undefined {
  const path = join(dir, 'evals', 'cases.json');
  if (!existsSync(path)) return undefined;
  return parseCasesConfig(JSON.parse(readFileSync(path, 'utf8')));
}

/** Build the world factory: a `gen/world.json` (spec §3b) wins over the TS `gen/world` module. A
 *  json world needs no host `custom` wiring in the common case; when it does, deps carry it. */
async function resolveWorld(dir: string, load: (base: string) => Promise<Record<string, unknown>>, deps: WorldConfigDeps): Promise<(preset?: string) => AgentWorld> {
  const jsonPath = join(dir, 'gen', 'world.json');
  if (existsSync(jsonPath)) return loadWorldConfig(JSON.parse(readFileSync(jsonPath, 'utf8')), deps);
  return resolveWorldFactory(await load('gen/world'));
}

export async function loadSubject(subjectDir: string, deps: WorldConfigDeps = {}): Promise<Subject> {
  const dir = resolve(subjectDir);
  const load = (base: string) => import(moduleUrl(dir, base));

  const [norms, makeWorld] = await Promise.all([load('norms/index'), resolveWorld(dir, load, deps)]);

  const specs = norms.SPECS as Record<string, AgentSpec> | undefined;
  const contract = norms.CONTRACT as DomainContract | undefined;
  if (!specs || !Object.keys(specs).length) throw new Error(`${dir}/norms/index exports no SPECS map`);
  if (!contract) throw new Error(`${dir}/norms/index exports no CONTRACT`);

  // The JSON exam wins when present; otherwise fall back to the TS `evals/cases` module — a subject
  // may author its cases in either form, and both bundles must keep working.
  const explicitAgent = (norms.CASE_AGENT ?? {}) as Record<string, string>;
  const json = readCasesJson(dir);
  let cases: SubjectCase[];
  let caseAgent: Record<string, string>;
  if (json) {
    cases = json.cases;
    caseAgent = { ...json.caseAgent, ...explicitAgent };
  } else {
    const casesMod = await load('evals/cases');
    cases = (casesMod.default ?? casesMod.cases) as SubjectCase[];
    caseAgent = explicitAgent;
  }
  if (!Array.isArray(cases) || !cases.length) throw new Error(`${dir}/evals/cases exports no case array`);

  return {
    dir,
    specs,
    contract,
    caseAgent,
    cases,
    toolDefs: readToolDefs(dir),
    makeWorld,
  };
}

const WORLD_SEAMS = ['exec', 'advanceTurn', 'ingestAttachment'] as const;

/**
 * Structural preflight — no LLM calls. Returns issue strings (empty = clean): duplicate case
 * ids, cases with no turns or no expectations, spec-surface or invariant tool names with no
 * toolDef, CASE_AGENT routes to unknown specs/cases, and world-seam holes (one world simulated
 * per distinct preset). Reported as warnings by the CLI; a broken reference would otherwise
 * surface only mid-run as a confusing model/world error.
 */
export function validateSubject(subject: Subject): string[] {
  const issues: string[] = [];
  const defNames = new Set(subject.toolDefs.map((d) => d.name));

  const seen = new Set<string>();
  for (const c of subject.cases) {
    if (seen.has(c.id)) issues.push(`case "${c.id}": duplicate id`);
    seen.add(c.id);
    if (!c.turns?.length) issues.push(`case "${c.id}": no turns`);
    if (!c.expectations?.invariants && !c.expectations?.rubric?.length) {
      issues.push(`case "${c.id}": no invariants and no rubric — nothing to evaluate`);
    }
    const inv = c.expectations?.invariants;
    for (const r of [...(inv?.requiredToolCalls ?? []), ...(inv?.forbiddenToolCalls ?? [])]) {
      if (!defNames.has(r.name)) issues.push(`case "${c.id}": invariant tool "${r.name}" has no toolDef`);
    }
  }

  for (const [id, spec] of Object.entries(subject.specs)) {
    if (spec.id !== id) issues.push(`spec key "${id}" differs from spec.id "${spec.id}"`);
    for (const t of spec.surface.tools) {
      if (!defNames.has(t)) issues.push(`spec "${id}": tool "${t}" has no toolDef`);
    }
  }

  for (const [caseId, agent] of Object.entries(subject.caseAgent)) {
    if (!subject.specs[agent]) issues.push(`CASE_AGENT: case "${caseId}" routes to unknown spec "${agent}"`);
    if (!seen.has(caseId)) issues.push(`CASE_AGENT: "${caseId}" is not a known case`);
  }

  // World seams: one world per distinct preset, simulated structurally.
  const presets = [...new Set(subject.cases.map((c) => c.setup?.preset ?? 'default'))];
  for (const preset of presets) {
    try {
      const world = subject.makeWorld(preset);
      for (const m of WORLD_SEAMS) {
        if (typeof (world as Record<string, unknown>)[m] !== 'function') {
          issues.push(`world(preset "${preset}"): missing seam method ${m}()`);
        }
      }
      if (!Array.isArray(world.toolCalls)) issues.push(`world(preset "${preset}"): toolCalls must be an array`);
      if (!Array.isArray(world.sseActions)) issues.push(`world(preset "${preset}"): sseActions must be an array`);
    } catch (e) {
      issues.push(`makeWorld("${preset}") threw: ${String((e as Error).message ?? e)}`);
    }
  }
  return issues;
}

/** CASE_AGENT routing, with the single-spec fallback. */
export function agentForCase(subject: Subject, caseId: string): string {
  const routed = subject.caseAgent[caseId];
  if (routed && subject.specs[routed]) return routed;
  const ids = Object.keys(subject.specs);
  if (ids.length === 1) return ids[0];
  throw new Error(`case "${caseId}" has no CASE_AGENT route and the subject has ${ids.length} specs`);
}

/**
 * ASSEMBLED PROMPT-STATIC gate (fundamental for local serving: byte-identical assembled prompts are what the
 * llama.cpp prefix cache reuses). The engine renders the assembled prompt world-independently BY
 * CONSTRUCTION, so: (a) each agent's assembled prompt must be BYTE-IDENTICAL under different presets;
 * (b) all agents of the domain must share an identical HEAD (the contract's voice opens
 * every assembled prompt — per-agent divergence as late as possible). Returns human-readable failures.
 */
export function checkPromptStatic(subject: Subject, presets: [string, string]): string[] {
  const fails: string[] = [];
  const assembledPrompts: string[] = [];
  for (const [id, spec] of Object.entries(subject.specs)) {
    const a = renderAssembledPrompt(subject.makeWorld(presets[0]), spec, [], subject.contract);
    const b = renderAssembledPrompt(subject.makeWorld(presets[1]), spec, [], subject.contract);
    if (a !== b) fails.push(`${id}: the assembled prompt differs across presets ${presets[0]} vs ${presets[1]} (volatile state leaked into the assembled prompt)`);
    assembledPrompts.push(a);
  }
  if (assembledPrompts.length > 1) {
    const head = (x: string, y: string) => { let i = 0; while (i < x.length && x[i] === y[i]) i++; return i; };
    const shared = assembledPrompts.reduce((n, t) => Math.min(n, head(assembledPrompts[0], t)), assembledPrompts[0].length);
    if (shared < 200) fails.push(`shared assembled prompt head across agents is only ${shared} bytes — the contract voice must open every assembled prompt identically`);
  }
  return fails;
}
