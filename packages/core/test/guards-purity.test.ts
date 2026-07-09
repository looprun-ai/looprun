/**
 * THE LAW SUITE (purity + firewall) — CI-enforced on every push/PR.
 *
 * T1 purity: guard-surface source may not touch clock / entropy / network / a runtime LLM call —
 * that is what keeps `check()` deterministic by construction.
 * S-1 firewall: GuardCtx exposes NO user text — guards key on args/world/observed only (the magnet
 * firewall).
 * Statefulness: no /g|/y regex used with .test()/.exec() (lastIndex leaks across calls).
 * Theme law: TrunkTheme carries no persona (persona-on-spec law).
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

describe('S-1 firewall (GuardCtx exposes no user text)', () => {
  it('GuardCtx has no user-text key', () => {
    const rules = readFileSync(join(CORE_SRC, 'rules.ts'), 'utf8');
    const block = rules.match(/export interface GuardCtx \{[\s\S]*?\n\}/)?.[0];
    expect(block, 'GuardCtx interface not found').toBeTruthy();
    for (const key of ['userText', 'messages', 'history', 'userMessage', 'prompt']) {
      expect(block!, `GuardCtx must not expose "${key}"`).not.toMatch(new RegExp(`\\b${key}\\??:`));
    }
  });
});

describe('theme-persona law (persona lives on the spec, never the theme)', () => {
  it('TrunkTheme has no persona key', () => {
    const trunk = readFileSync(join(CORE_SRC, 'trunk.ts'), 'utf8');
    const block = trunk.match(/export interface TrunkTheme \{[\s\S]*?\n\}/)?.[0];
    expect(block, 'TrunkTheme interface not found').toBeTruthy();
    expect(block!).not.toMatch(/\bpersona\??:/);
  });
});
