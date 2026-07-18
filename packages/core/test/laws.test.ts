/**
 * Repo laws on the library packages:
 *  - zero-business-strings: @looprun-ai/core and @looprun-ai/mastra src carry NO domain/business content —
 *    every business string lives in a generated artifact (spec/theme) owned by the user project.
 *  - no framework imports in core: @looprun-ai/core stays framework-free (the backend seam).
 *  - the ≤15-tools law surfaces through validateSpec.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentSpecBase, validateSpec } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = join(HERE, '..', 'src');
const MASTRA_SRC = join(HERE, '..', '..', 'mastra', 'src');

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

// Business/brand tokens that must never appear in library source (they belong to generated bundles).
// Sampled from the shipped example domains — a representative denylist, not exhaustive.
const BUSINESS_TOKENS = /\b(Acme|Northwind|Instagram|homeservices|home-services|lawfirm|accounting-firm|second-brain|inbox-triage)\b/;

describe('zero-business-strings (library packages)', () => {
  for (const file of [...listTs(CORE_SRC), ...listTs(MASTRA_SRC)]) {
    it(`${file.split('/packages/')[1]} carries no business string`, () => {
      const src = readFileSync(file, 'utf8');
      const hit = src.match(BUSINESS_TOKENS);
      expect(hit, `${file}: found business token "${hit?.[0]}"`).toBeNull();
    });
  }
});

describe('core stays framework-free', () => {
  for (const file of listTs(CORE_SRC)) {
    it(`${file.split('/packages/')[1]} imports no framework`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/from ['"]@mastra\//);
      expect(src).not.toMatch(/from ['"]ai['"]/);
      expect(src).not.toMatch(/from ['"]zod['"]/);
    });
  }
});

describe('≤15-tools law', () => {
  it('validateSpec warns past 15 tools', () => {
    const tools = Array.from({ length: 16 }, (_, i) => `tool${i}`);
    const spec = new AgentSpecBase({ id: 't', mode: 'M', persona: 'You are the test agent.', tools, behavior: ['x'] });
    const warnings = validateSpec(spec);
    expect(warnings.map((w) => w.code)).toContain('tool-surface-over-15');
  });

  it('validateSpec is quiet at 15', () => {
    const tools = Array.from({ length: 15 }, (_, i) => `tool${i}`);
    const spec = new AgentSpecBase({ id: 't', mode: 'M', persona: 'You are the test agent.', tools, behavior: ['x'] });
    expect(validateSpec(spec).filter((w) => w.code === 'tool-surface-over-15')).toEqual([]);
  });
});
