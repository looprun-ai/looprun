/**
 * THE LAW SUITE (purity + full-context) — CI-enforced on every push/PR.
 *
 * T1 purity: guard-surface source may not touch clock / entropy / network / a runtime LLM call —
 * that is what keeps `check()` deterministic by construction.
 * Full-context law: GuardCtx DOES expose the user's
 * text — `userText` (this turn) and `history[].userText` (prior turns). Guards are deterministic
 * code, so "influence" does not apply; intent-based tool routing stays banned as a loop law and text
 * pattern-matching stays banned by the no-regex law — neither is this suite's job.
 * Statefulness: no /g|/y regex used with .test()/.exec() (lastIndex leaks across calls).
 * Contract law: DomainContract carries no persona (persona-on-spec law).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = join(HERE, '..', 'src');
const MASTRA_SRC = join(HERE, '..', '..', 'mastra', 'src');

/** Files that legitimately DRIVE the loop (clock for latency, the LLM via the framework). */
const RUNNER_ONLY = new Set(['agent.ts', 'run-conversation.ts', 'session.ts', 'compile.ts']);

const BANNED = [
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

function listTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

function purityViolations(source: string, banned: string[] = BANNED): string[] {
  const hits: string[] = [];
  for (const token of banned) {
    if (source.includes(token)) hits.push(token);
  }
  return hits;
}

describe('T1 purity lint (guard surface)', () => {
  const files = [...listTs(CORE_SRC), ...listTs(MASTRA_SRC)];

  it('scans a non-empty guard surface', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of listTs(CORE_SRC)) {
    it(`core/${relative(CORE_SRC, file)} is pure`, () => {
      const hits = purityViolations(readFileSync(file, 'utf8'));
      expect(hits, `${file} touches banned tokens`).toEqual([]);
    });
  }

  for (const file of listTs(MASTRA_SRC)) {
    const base = file.split('/').pop()!;
    if (RUNNER_ONLY.has(base)) continue; // the loop legitimately uses the clock + drives the LLM
    it(`mastra/${relative(MASTRA_SRC, file)} is pure`, () => {
      const hits = purityViolations(readFileSync(file, 'utf8'));
      expect(hits, `${file} touches banned tokens`).toEqual([]);
    });
  }

  // SELF-TEST: prove the lint FIRES (a lint that cannot fail is no law).
  it('flags a banned token (self-test)', () => {
    expect(purityViolations('const t = Date.now();')).toContain('Date.now(');
    expect(purityViolations('await fetch("http://x")')).toContain('fetch(');
    expect(purityViolations('const r = await generateText({})')).toContain('generateText(');
  });
});

describe('stateful-regex lint', () => {
  const files = [...listTs(CORE_SRC), ...listTs(MASTRA_SRC)];
  const statefulUse = /\/[^/\n]+\/[a-z]*[gy][a-z]*\s*\.\s*(test|exec)\s*\(/;

  for (const file of files) {
    it(`${file.includes('/mastra/') ? 'mastra' : 'core'}/${file.split('/src/')[1]} has no /g|/y .test()/.exec()`, () => {
      const lines = readFileSync(file, 'utf8').split('\n');
      const bad = lines.filter((l) => statefulUse.test(l));
      expect(bad, `${file} uses a stateful-flag regex with .test/.exec`).toEqual([]);
    });
  }

  it('flags a stateful use (self-test)', () => {
    expect(statefulUse.test('if (/abc/g.test(x)) {}')).toBe(true);
    expect(statefulUse.test('if (/abc/i.test(x)) {}')).toBe(false);
  });
});

describe('no-regex-param law (guard factory surface carries zero RegExp-typed params)', () => {
  // THE BOUNDARY: the ban is on GUARD FACTORY PARAMETERS and on guard checks over
  // CONVERSATION text. Text judgment is `llmCheck`'s job — its verdict is a host adjudicator's, never a
  // closure-held pattern. What this gate does NOT ban: an internal lint that scans SOURCE/ARTIFACT text
  // (lint-subject, world input validation) may still use a RegExp INTERNALLY — that is not a guard
  // reading conversation text; `argFormat(field, pattern: string)` validates a tool-arg value at the
  // input boundary (its param is a `string`, not a RegExp); `jargonScrub`'s egress rewrite builds a
  // regex from author strings; module-local helpers (`matches`, `allMatches`) legitimately take a
  // RegExp. The gate targets ONLY the signatures of `): Guard {` / `): ReplyMutator {` factories.
  const GUARDS_DIR = join(CORE_SRC, 'guards');

  /** Extract each guard/mutator FACTORY signature (param list + return marker) from a guards file. */
  function factorySignatures(source: string): { name: string; sig: string }[] {
    const out: { name: string; sig: string }[] = [];
    const re = /export function (\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const from = m.index;
      const rest = source.slice(from);
      // The signature ends at the FIRST return marker `): Guard {` / `): ReplyMutator {` after the name.
      const end = rest.search(/\)\s*:\s*(?:Guard|ReplyMutator)\s*\{/);
      if (end === -1) continue; // not a guard/mutator factory (helper returning boolean/string/etc.)
      out.push({ name: m[1], sig: rest.slice(0, end) });
    }
    return out;
  }

  it('scans a non-empty factory surface', () => {
    const sigs = listTs(GUARDS_DIR).flatMap((f) => factorySignatures(readFileSync(f, 'utf8')));
    expect(sigs.length).toBeGreaterThanOrEqual(20);
    expect(sigs.map((s) => s.name)).toContain('confirmFirst');
  });

  for (const file of listTs(GUARDS_DIR)) {
    it(`guards/${relative(GUARDS_DIR, file)} exposes no RegExp-typed factory param`, () => {
      const offenders = factorySignatures(readFileSync(file, 'utf8'))
        .filter((s) => /\bRegExp\b/.test(s.sig))
        .map((s) => s.name);
      expect(offenders, `${file}: factories with a RegExp-typed param — text judgment is llmCheck's job`).toEqual([]);
    });
  }

  // SELF-TEST: plant the defect — a factory with a RegExp param must be caught.
  it('flags a RegExp-typed factory param (self-test)', () => {
    const planted = 'export function evilGuard(opts: { claimRe: RegExp }): Guard {\n  return {} as never;\n}';
    const offenders = factorySignatures(planted).filter((s) => /\bRegExp\b/.test(s.sig)).map((s) => s.name);
    expect(offenders).toContain('evilGuard');
    // and a legitimate helper taking a RegExp is NOT a factory (no `): Guard {`), so it is ignored:
    expect(factorySignatures('export function matches(re: RegExp): boolean { return true; }')).toEqual([]);
  });
});

describe('full-context law (GuardCtx exposes the user text)', () => {
  it('GuardCtx exposes userText and history', () => {
    const rules = readFileSync(join(CORE_SRC, 'rules.ts'), 'utf8');
    const block = rules.match(/export interface GuardCtx \{[\s\S]*?\n\}/)?.[0];
    expect(block, 'GuardCtx interface not found').toBeTruthy();
    for (const key of ['userText', 'history']) {
      expect(block!, `GuardCtx must expose "${key}" (full-context law)`).toMatch(new RegExp(`\\b${key}\\??:`));
    }
  });
});

describe('domain-persona law (persona lives on the spec, never the domain contract)', () => {
  it('DomainContract has no persona key', () => {
    const trunk = readFileSync(join(CORE_SRC, 'trunk.ts'), 'utf8');
    const block = trunk.match(/export interface DomainContract \{[\s\S]*?\n\}/)?.[0];
    expect(block, 'DomainContract interface not found').toBeTruthy();
    expect(block!).not.toMatch(/\bpersona\??:/);
  });
});
