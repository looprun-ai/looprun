/**
 * @looprun-ai/eval — the guard-purity lint over USER project files (`looprun-eval lint`).
 *
 * The three file-local rule sets that keep generated specs deterministic by construction:
 *   1. BANNED tokens — clock / entropy / network / runtime-LLM calls inside spec/contract files.
 *   2. Stateful regex — /g|/y flags used with .test()/.exec() (lastIndex leaks across calls).
 *   3. Contract-persona law — a contract file may not carry a `persona:` key (persona lives on the spec).
 *
 * Guards see the FULL conversation (`GuardCtx.history` + `userText`), so reading user text is NOT a lint
 * finding. The two protections here are the no-regex law (text pattern-matching stays out of the config
 * surface; a grep-gate in core fails on any RegExp-typed guard param) and the intent-based tool-routing
 * ban (a loop-shaping law). Text judgment a generated spec genuinely needs is an `llmCheck` rubric.
 * Plus `--spec-laws` (subject-level): validateSpec warnings + no own systemPrompt.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateSpec } from '@looprun-ai/core';
import type { AgentSpec, AgentWorld, GuardCtx } from '@looprun-ai/core';
import type { GuardBinding } from '@looprun-ai/core/internal';

export interface LintViolation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

export const BANNED_TOKENS = [
  'Date.now(',
  'new Date(',
  'performance.now(',
  'process.hrtime',
  'Math.random(',
  'crypto.',
  'fetch(',
  'generateText(',
  'streamText(',
  'makeLanguageModel(',
  'createOpenAI(',
  'createGoogleGenerativeAI(',
];

const STATEFUL_RE = /\/[^/\n]+\/[a-z]*[gy][a-z]*\s*\.\s*(test|exec)\s*\(/;
const PERSONA_KEY_RE = /^\s*persona\s*:/;

export function lintSource(file: string, source: string): LintViolation[] {
  const out: LintViolation[] = [];
  const lines = source.split('\n');
  const isContract = /contract[^/]*\.(ts|js|mts|mjs)$/.test(file);

  lines.forEach((text, i) => {
    const line = i + 1;
    for (const token of BANNED_TOKENS) {
      if (text.includes(token)) {
        out.push({ file, line, rule: 'purity', message: `banned token ${token.replace(/\($/, '')} — guard surfaces must stay clock/entropy/network/LLM-free` });
      }
    }
    if (STATEFUL_RE.test(text)) {
      out.push({ file, line, rule: 'stateful-regex', message: 'a /g|/y regex used with .test()/.exec() leaks lastIndex across calls' });
    }
    if (isContract && PERSONA_KEY_RE.test(text)) {
      out.push({ file, line, rule: 'contract-persona', message: 'a contract carries no persona — persona lives on each spec (persona-on-spec law)' });
    }
  });
  return out;
}

function listSources(path: string): string[] {
  if (!existsSync(path)) return [];
  const st = statSync(path);
  if (st.isFile()) return /\.(ts|mts|js|mjs)$/.test(path) ? [path] : [];
  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    out.push(...listSources(join(path, entry)));
  }
  return out;
}

export function lintPaths(paths: string[]): LintViolation[] {
  const files = paths.flatMap(listSources);
  return files.flatMap((f) => lintSource(f, readFileSync(f, 'utf8')));
}

/** The subject-level spec laws (`--spec-laws`). */
export function lintSpecLaws(specs: Record<string, AgentSpec>): string[] {
  const out: string[] = [];
  for (const [id, spec] of Object.entries(specs ?? {})) {
    for (const w of validateSpec(spec)) out.push(`spec "${id}": ${w.message}`);
    if (spec.surface.systemPrompt) {
      out.push(`spec "${id}": carries its own systemPrompt — generated specs must use the assembled prompt renderer (contract + spec only)`);
    }
    // A MINTED id is positional: `${layer}:${kind}#${n}` counts installs, so inserting one guard above
    // silently re-points every case and every profile keyed on the ids below it. An explicit id is the
    // only stable name a case can target.
    for (const bound of [...spec.guards.onInput ?? [], ...spec.guards.preTool ?? [], ...spec.guards.postTool ?? [], ...spec.guards.onReply ?? []]) {
      if (/#\d+$/.test(bound.id)) {
        out.push(
          `spec "${id}": GUARD-ID-POSITIONAL: '${bound.id}' was minted from an install counter — a guard inserted above it re-points every case and profile that names it. Pass an explicit { id }`,
        );
      }
    }
  }
  return out;
}

// ── Spec-quality by EXECUTION (anti-drift law: read the runtime, never re-encode it) ─────────────
//
// These checks run against the ASSEMBLED spec objects. The unsat check EXECUTES the spec's own
// onReply check() functions over synthetic replies — no knowledge of any kind's internals, so it
// works for custom() guards too. The cycle check reads the structural metadata the kinds attach
// (`meta.before` on requiresBefore) plus `controls.chains` — never the guard source text.

/** Minimal inert world for synthetic guard execution (mirrors the runtime's static-instructions stub). */
function syntheticWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

/**
 * Worst-case minimal GuardCtx: empty observed action history, current turn, the reply populated — plus the
 * MINIMUM LEGAL DECLARATION (MI): a delivered `respond` always carries at least one intention, so an
 * absent `did` is a state no onReply guard can be in. The intention is a SPEECH one (`inform`), which
 * names no action history fact: the structured cross-checks stay silent on the synthetic ctx instead of
 * reporting an ungrounded claim this simulate invented, and the differential below keeps measuring what
 * it is meant to measure — whether the required STRING itself is what a sibling guard vetoes.
 */
function syntheticReplyCtx(reply: string): GuardCtx {
  return { args: {}, world: syntheticWorld(), observed: [], turnIndex: 0, userText: '', history: [], reply, did: [{ op: 'inform' }], producedThisTurn: [], attachmentsThisTurn: [] };
}

/** Neutral baseline reply — the differential control: a veto must be TRIGGERED BY the required
 *  string itself (fires with it, silent without it), not by the synthetic reply shape. */
const BASELINE_REPLY = 'Here is the update you asked for.';

async function runCheck(b: GuardBinding, reply: string): Promise<{ violation: string | null; threw?: string }> {
  try {
    const v = await b.guard.check(syntheticReplyCtx(reply));
    return { violation: v ?? null };
  } catch (e) {
    return { violation: null, threw: (e as Error).message };
  }
}

/**
 * UNSAT-RISK: a reply requirement no reply can satisfy — guard X REQUIRES a string (the `records` of
 * mustAccountFor, each of which must be covered — via `meta.requiredStrings`) that another
 * onReply guard Y VETOES. Every required string is embedded in a synthetic worst-case reply and
 * every OTHER onReply check() of the same spec is EXECUTED over it; a check that throws on the
 * synthetic ctx is its own finding.
 *
 * SCOPE: the requirer keys on STRUCTURE (a `did` target), while the vetoers that can
 * contradict it are the text-reading ones (`llmCheck` rubrics, `custom` behavior checks, mutable
 * reply prose) — the required target still has to be SAYABLE. So the simulate embeds the target in the
 * reply text; it is not claiming the coverage rule itself is text-matched.
 */
async function unsatReplyFindings(id: string, spec: AgentSpec): Promise<string[]> {
  const out: string[] = [];
  const bindings = (spec.guards.onReply ?? []).filter((b) => !b.disabled);
  const requirers = bindings.filter((b) => b.guard.meta?.requiredStrings?.length);
  const reportedThrows = new Set<string>();
  for (const x of requirers) {
    for (const s of x.guard.meta!.requiredStrings!) {
      const withString = `${BASELINE_REPLY} ${s}`;
      for (const y of bindings) {
        if (y.id === x.id) continue;
        const base = await runCheck(y, BASELINE_REPLY);
        const simulate = await runCheck(y, withString);
        if (simulate.threw && !reportedThrows.has(y.id)) {
          reportedThrows.add(y.id);
          out.push(`spec "${id}": UNSAT-RISK: guard ${y.id} check() THREW while simulating "${s}" (required by ${x.id}): ${simulate.threw}`);
          continue;
        }
        if (simulate.violation && !base.violation) {
          out.push(`spec "${id}": UNSAT-RISK: guard ${x.id} requires "${s}" while guard ${y.id} vetoes it (${simulate.violation})`);
        }
      }
    }
  }
  return out;
}

/**
 * ORDER-CYCLE: a deadlock by construction in the requires-graph — `requiresBefore` bindings
 * (tool T must come after every dep, via `meta.before`) plus `controls.chains` follow-ups
 * (`call` comes after `after`). A cycle means no permitted call order exists.
 */
function orderCycleFindings(id: string, spec: AgentSpec): string[] {
  const edges = new Map<string, Set<string>>(); // T → tools that must run BEFORE T
  const addEdge = (later: string, earlier: string): void => {
    if (!edges.has(later)) edges.set(later, new Set());
    edges.get(later)!.add(earlier);
  };
  for (const b of (spec.guards.preTool ?? []).filter((x) => !x.disabled)) {
    const before = b.guard.meta?.before;
    if (!before?.length || b.target === 'any') continue;
    for (const tool of b.target) for (const dep of before) addEdge(tool, dep);
  }
  for (const chain of spec.controls.chains ?? []) addEdge(chain.call, chain.after);

  const out: string[] = [];
  const done = new Set<string>();
  const visiting: string[] = [];
  const visit = (node: string): void => {
    const at = visiting.indexOf(node);
    if (at !== -1) {
      const cycle = [...visiting.slice(at), node];
      out.push(`spec "${id}": ORDER-CYCLE: ${cycle.join(' → ')} — each requires the next to run first; no permitted order exists (deadlock by construction)`);
      return;
    }
    if (done.has(node)) return;
    visiting.push(node);
    for (const dep of edges.get(node) ?? []) visit(dep);
    visiting.pop();
    done.add(node);
  };
  for (const node of edges.keys()) visit(node);
  return out;
}

/** The execution-based spec-quality checks (`--spec-laws` runs these alongside lintSpecLaws). */
export async function lintSpecExecution(specs: Record<string, AgentSpec>): Promise<string[]> {
  const out: string[] = [];
  for (const [id, spec] of Object.entries(specs ?? {})) {
    out.push(...(await unsatReplyFindings(id, spec)));
    out.push(...orderCycleFindings(id, spec));
  }
  return out;
}
