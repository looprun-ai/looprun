/**
 * CATALOG ↔ CORE PARITY (the anti-drift gate) — `GUARD_CATALOG` (`src/guards/catalog.ts`) must list
 * EXACTLY the factory vocabulary `src/guards/` actually exports. It is the DATA the tutorial's guard
 * chapter is generated from, so an undocumented kind cannot reach the docs by omission, and a
 * documented kind cannot outlive its factory. Anchored to THIS core, not any external harness.
 *
 * There is no second, markdown lane. `packages/core/GUARDS.md` used to carry a hand-maintained kind
 * table and was gated here; it drifted anyway (it still read "29 kinds" after the split shipped 30),
 * because a name list a human retypes is exactly the artifact a name-only gate cannot keep honest.
 * GUARDS.md is now maintainer internals and points at the catalog instead — one vocabulary of record,
 * and this gate is the whole of it.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUARD_CATALOG } from '../src/guards/catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARDS_DIR = join(HERE, '..', 'src', 'guards');

/** The whole `src/guards/` directory as one blob — EVERY file, including `shared.ts`. The extractor
 *  below discriminates by return type, so the helpers are excluded on their signatures, not on their
 *  filename: a Guard-returning factory dropped into `shared.ts` must fail this gate, not escape it. */
function guardSources(): string {
  return readdirSync(GUARDS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(GUARDS_DIR, f), 'utf8'))
    .join('\n');
}

/**
 * The exported factory names in `src/guards/` that produce a Guard or a ReplyMutator — i.e. the catalog
 * vocabulary. Split the source into per-function slices (each `export function …` chunk), keep a slice
 * only when its signature returns `Guard` or `ReplyMutator`. This naturally includes `custom` and
 * `jargonScrub` and EXCLUDES the `canonArgs` helper (returns `string`).
 */
function exportedGuardFactories(source: string): string[] {
  const RETURNS_GUARDISH = /\):\s*(?:Guard|ReplyMutator)\s*\{/;
  return source
    .split(/(?=export function )/)
    .map((slice) => {
      const m = slice.match(/^export function (\w+)/);
      return m && RETURNS_GUARDISH.test(slice) ? m[1] : null;
    })
    .filter((n): n is string => n !== null);
}

describe('the factory extractor', () => {
  const factories = exportedGuardFactories(guardSources());

  it('extracts a non-empty vocabulary from src/guards/', () => {
    expect(factories.length).toBeGreaterThan(20);
  });

  it('includes the known anchors (canary that the extractor really works)', () => {
    // A guard added in the P8a/single-class port, the escape hatch, and the mutator must all be present.
    for (const anchor of ['noActAfterAskSameTurn', 'custom', 'jargonScrub', 'destructiveClaimRequiresSuccess']) {
      expect(factories, `extractor missed ${anchor}`).toContain(anchor);
    }
    // The pure helper is NOT a guard kind — it must NOT be counted as a factory.
    expect(factories, 'canonArgs is a helper, not a guard factory').not.toContain('canonArgs');
  });

  // SELF-TEST: the extractor must DISCRIMINATE (a parser that flags everything proves nothing).
  it('the return-type filter separates guards from helpers (self-test)', () => {
    const sample = [
      'export function aGuard(x: string): Guard {',
      '  return { kind: "a", dim: "run", check: () => null, prose: () => "" };',
      '}',
      'export function aMutator(m: Record<string, string>): ReplyMutator {',
      '  return { kind: "m", apply: (r) => r };',
      '}',
      'export function aHelper(v: unknown): string {',
      '  return JSON.stringify(v) ?? "null";',
      '}',
    ].join('\n');
    expect(exportedGuardFactories(sample).sort()).toEqual(['aGuard', 'aMutator']);
  });
});

/**
 * GUARD_CATALOG ↔ core parity — the bijection itself, against the data the chapter generator reads.
 * It is a stronger gate than a name list: an entry must carry a summary, a when-to-use and an example
 * that actually CALLS its own factory, and must sit in the category file that exports it.
 */
describe('GUARD_CATALOG ↔ core parity', () => {
  const factories = exportedGuardFactories(guardSources());
  const entries = GUARD_CATALOG.map((e) => e.name);

  it('every exported guard/mutator factory has exactly one GUARD_CATALOG entry', () => {
    const missing = factories.filter((name) => !entries.includes(name));
    expect(
      missing,
      `src/guards/ exports these factories with no GUARD_CATALOG entry — add one to src/guards/catalog.ts:\n${missing.join(', ')}`,
    ).toEqual([]);
    const counted = new Map<string, number>();
    for (const name of entries) counted.set(name, (counted.get(name) ?? 0) + 1);
    expect([...counted].filter(([, n]) => n > 1).map(([name]) => name)).toEqual([]);
  });

  it('every GUARD_CATALOG entry is backed by a real exported factory (no ghosts)', () => {
    const set = new Set(factories);
    const ghosts = entries.filter((name) => !set.has(name));
    expect(
      ghosts,
      `GUARD_CATALOG documents these kinds but src/guards/ exports no such factory:\n${ghosts.join(', ')}`,
    ).toEqual([]);
  });

  it('every entry carries a summary, a when-to-use and an example that CALLS its own factory', () => {
    for (const entry of GUARD_CATALOG) {
      expect(entry.summary.trim().length, `${entry.name}: empty summary`).toBeGreaterThan(0);
      expect(entry.whenToUse.trim().length, `${entry.name}: empty whenToUse`).toBeGreaterThan(0);
      expect(entry.example, `${entry.name}: the example must show a call to ${entry.name}`).toContain(
        `${entry.name}(`,
      );
    }
  });

  it('every entry declares one of the four real enforcement hooks', () => {
    const HOOKS = ['preTool', 'postTool', 'onReply', 'onReplyMutate'];
    const bad = GUARD_CATALOG.filter((e) => !HOOKS.includes(e.hook)).map((e) => `${e.name}=${e.hook}`);
    expect(bad, `not a hook the runtime installs on:\n${bad.join(', ')}`).toEqual([]);
  });

  it('the hook axis is the PHASE, not the file (the tricky rows)', () => {
    // `category` is file-derived; `hook` follows the factory's dim through spec.ts#DIM_HOOKS. These two
    // are where the axes disagree, which is exactly why the field exists.
    const byName = new Map(GUARD_CATALOG.map((e) => [e.name, e]));
    expect(byName.get('noInstructionFromData')?.category).toBe('reply');
    expect(byName.get('noInstructionFromData')?.hook, 'it gates a CALL, despite living in reply.ts').toBe('preTool');
    expect(byName.get('jargonScrub')?.hook, 'a ReplyMutator rewrites, it never gates').toBe('onReplyMutate');
    expect(byName.get('resultInvariant')?.hook, 'the only postTool kind').toBe('postTool');
    expect(byName.get('pendingConfirmMustAsk')?.hook, 'it gates the REPLY, not the call').toBe('onReply');
  });

  it('every entry sits in the category file that actually exports it', () => {
    const misfiled = GUARD_CATALOG.filter((entry) => {
      const file = join(GUARDS_DIR, `${entry.category}.ts`);
      return !new RegExp(String.raw`export function ${entry.name}\b`).test(readFileSync(file, 'utf8'));
    }).map((e) => `${e.name} (claims ${e.category}.ts)`);
    expect(misfiled, `catalog category does not match the file the factory lives in:\n${misfiled.join(', ')}`).toEqual(
      [],
    );
  });
});
