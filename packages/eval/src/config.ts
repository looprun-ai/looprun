/**
 * @looprun/eval — project config resolution + structural validation (`looprun-eval check`).
 *
 * `looprun.eval.config.{ts,mts,js,mjs}` at the project root is BOTH the eval contract and the
 * agentspec skill's "am I in a looprun project" sentinel. Resolution walks up from cwd
 * (override: $LOOPRUN_ROOT).
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createJiti } from 'jiti';
import { CASE_ID_RE } from './types.js';
import type { EvalCase, EvalConfig } from './types.js';

const CONFIG_NAMES = ['looprun.eval.config.ts', 'looprun.eval.config.mts', 'looprun.eval.config.js', 'looprun.eval.config.mjs'];

export function findConfigPath(startDir = process.cwd()): string | null {
  let dir = resolve(process.env.LOOPRUN_ROOT ?? startDir);
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface LoadedConfig {
  config: EvalConfig;
  configPath: string;
  projectRoot: string;
}

export async function loadConfig(startDir = process.cwd()): Promise<LoadedConfig> {
  const configPath = findConfigPath(startDir);
  if (!configPath) {
    throw new Error(
      'looprun-eval: no looprun.eval.config.{ts,js} found walking up from ' +
        `${startDir} — run \`looprun-eval init\` in your project root (or set $LOOPRUN_ROOT).`,
    );
  }
  const jiti = createJiti(import.meta.url);
  const mod = (await jiti.import(configPath)) as { default?: EvalConfig } & EvalConfig;
  const config = (mod.default ?? mod) as EvalConfig;
  if (!config || typeof config !== 'object' || !config.domain) {
    throw new Error(`looprun-eval: ${configPath} must default-export an EvalConfig (missing "domain").`);
  }
  return { config, configPath, projectRoot: dirname(configPath) };
}

export interface CheckIssue {
  level: 'error' | 'warn';
  message: string;
}

const WORLD_SEAMS = ['exec', 'advanceTurn', 'ingestAttachment'] as const;

/** Structural validation — no LLM calls. Returns issues (empty = green). */
export function checkConfig(config: EvalConfig): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const err = (message: string) => issues.push({ level: 'error', message });
  const warn = (message: string) => issues.push({ level: 'warn', message });

  if (!config.specs || !Object.keys(config.specs).length) err('specs: empty — export the generated bundle.');
  if (!config.cases?.length) err('cases: empty — generate the eval set first.');
  if (!config.toolDefs?.length) err('toolDefs: empty.');
  if (typeof config.worldFactory !== 'function') err('worldFactory: missing.');

  // Theme resolution per spec.
  for (const [id, spec] of Object.entries(config.specs ?? {})) {
    if (!config.theme && !spec.theme && !spec.surface.systemPrompt) {
      err(`spec "${id}": no theme (config.theme or spec.theme).`);
    }
    if (spec.id !== id) warn(`spec key "${id}" differs from spec.id "${spec.id}".`);
  }

  // Case ids + caseMap coverage (every case exactly once).
  const caseIds = new Set<string>();
  for (const c of config.cases ?? []) {
    if (!CASE_ID_RE.test(c.id)) err(`case "${c.id}": id must match NN-slug (${CASE_ID_RE}).`);
    if (caseIds.has(c.id)) err(`case "${c.id}": duplicate id.`);
    caseIds.add(c.id);
    if (!c.expectations?.rubric?.length) err(`case "${c.id}": empty rubric.`);
    if (!c.turns?.length) err(`case "${c.id}": no turns.`);
  }
  const mapped = new Map<string, string>();
  for (const [agent, ids] of Object.entries(config.caseMap ?? {})) {
    if (!config.specs?.[agent]) err(`caseMap: agent "${agent}" is not in specs.`);
    for (const id of ids) {
      if (!caseIds.has(id)) err(`caseMap: "${id}" (agent ${agent}) is not a known case.`);
      if (mapped.has(id)) err(`caseMap: case "${id}" mapped to both "${mapped.get(id)}" and "${agent}".`);
      mapped.set(id, agent);
    }
  }
  for (const id of caseIds) if (!mapped.has(id)) err(`caseMap: case "${id}" is not mapped to any agent.`);

  // Tool references: spec surfaces + invariants must exist in toolDefs.
  const defNames = new Set((config.toolDefs ?? []).map((d) => d.name));
  for (const [id, spec] of Object.entries(config.specs ?? {})) {
    for (const t of spec.surface.tools) if (!defNames.has(t)) err(`spec "${id}": tool "${t}" has no toolDef.`);
  }
  for (const c of config.cases ?? []) {
    const inv = c.expectations?.invariants;
    for (const r of [...(inv?.requiredToolCalls ?? []), ...(inv?.forbiddenToolCalls ?? [])]) {
      if (!defNames.has(r.name)) err(`case "${c.id}": invariant tool "${r.name}" has no toolDef.`);
    }
  }

  // World seams: construct one world per distinct preset (seed 0) and probe the seam.
  const presets = [...new Set((config.cases ?? []).map((c) => c.setup?.preset).filter(Boolean))];
  for (const preset of presets) {
    try {
      const world = config.worldFactory(preset, 0);
      for (const m of WORLD_SEAMS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (world as any)[m] !== 'function') err(`world(preset "${preset}"): missing seam method ${m}().`);
      }
      if (!Array.isArray(world.toolCalls)) err(`world(preset "${preset}"): toolCalls must be an array.`);
      if (!Array.isArray(world.sseActions)) err(`world(preset "${preset}"): sseActions must be an array.`);
    } catch (e) {
      err(`worldFactory("${preset}", 0) threw: ${String((e as Error).message ?? e)}`);
    }
  }

  // Model env.
  const model = config.model ?? 'gemini-3.1-flash-lite-thinkoff';
  if (typeof model === 'string' && model.startsWith('gemini') && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    warn('GOOGLE_GENERATIVE_AI_API_KEY is not set — `looprun-eval run` with the default gemini subject will fail.');
  }

  return issues;
}

export function caseById(config: EvalConfig): Map<string, EvalCase> {
  return new Map(config.cases.map((c) => [c.id, c]));
}
