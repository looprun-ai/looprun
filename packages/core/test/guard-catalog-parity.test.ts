/**
 * CATALOG ↔ CORE PARITY (the anti-drift gate) — the skill's portable guard catalog
 * (`skills/agentspec/references/guard-catalog.md`) must list EXACTLY the factory vocabulary the core
 * actually exports. This is the root-cause fix for silent drift: a guard added to / removed from
 * `packages/core/src/guards.ts` fails this test until the catalog is reconciled, and a catalog entry
 * with no backing factory (a "ghost") fails too. Anchored to THIS core, not any external harness.
 *
 * It checks NAMES, not signatures (signatures are prose the human keeps honest); the point is that the
 * SET of documented kinds equals the SET of exported factories.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARDS_TS = join(HERE, '..', 'src', 'guards.ts');
const CATALOG_MD = join(HERE, '..', '..', '..', 'skills', 'agentspec', 'references', 'guard-catalog.md');

/**
 * The exported factory names in guards.ts that produce a Guard or a ReplyMutator — i.e. the catalog
 * vocabulary. Split the file into per-function slices (each `export function …` chunk), keep a slice
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

/** The factory names the catalog documents = the leading backtick-code-call in each markdown table row
 *  (`| \`name(...)\` | … |`). Prose, code blocks and non-factory table cells (no `name(`) are ignored. */
function catalogFactoryNames(md: string): string[] {
  const names = new Set<string>();
  for (const line of md.split('\n')) {
    const m = line.match(/^\s*\|\s*`([A-Za-z]\w*)\(/);
    if (m) names.add(m[1]);
  }
  return [...names];
}

describe('guard-catalog ↔ core parity', () => {
  const guardsSrc = readFileSync(GUARDS_TS, 'utf8');
  const catalogMd = readFileSync(CATALOG_MD, 'utf8');
  const factories = exportedGuardFactories(guardsSrc);
  const catalogNames = catalogFactoryNames(catalogMd);

  it('extracts a non-empty vocabulary from both sides', () => {
    expect(factories.length).toBeGreaterThan(20);
    expect(catalogNames.length).toBeGreaterThan(20);
  });

  it('every exported guard/mutator factory is documented in the catalog', () => {
    const undocumented = factories.filter((name) => !catalogMd.includes(`${name}(`));
    expect(
      undocumented,
      `guards.ts exports these factories but guard-catalog.md does not list them — add a table row:\n${undocumented.join(', ')}`,
    ).toEqual([]);
  });

  it('every catalog factory row is backed by a real exported factory (no ghosts)', () => {
    const set = new Set(factories);
    const ghosts = catalogNames.filter((name) => !set.has(name));
    expect(
      ghosts,
      `guard-catalog.md lists these factory kinds but guards.ts exports no such factory — remove or rename:\n${ghosts.join(', ')}`,
    ).toEqual([]);
  });

  it('includes the known anchors (canary that the extractor really works)', () => {
    // A guard added in the P8a/single-class port, the escape hatch, and the mutator must all be present.
    for (const anchor of ['noActAfterAskSameTurn', 'custom', 'jargonScrub', 'destructiveClaimRequiresSuccess']) {
      expect(factories, `extractor missed ${anchor}`).toContain(anchor);
      expect(catalogNames, `catalog missing ${anchor}`).toContain(anchor);
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
