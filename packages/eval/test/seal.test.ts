import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mintSeal, verifySeal, sealedFiles } from '../src/seal.js';

function toySubject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'seal-'));
  mkdirSync(join(dir, 'norms'), { recursive: true });
  mkdirSync(join(dir, 'gen'), { recursive: true });
  mkdirSync(join(dir, 'evals'), { recursive: true });
  writeFileSync(join(dir, 'norms', 'contract.ts'), 'export const C = 1\n');
  writeFileSync(join(dir, 'gen', 'tools.json'), '{"tools":[]}\n');
  writeFileSync(join(dir, 'gen', 'world.ts'), 'export class W {}\n');
  writeFileSync(join(dir, 'evals', 'cases.ts'), 'export default []\n');
  return dir;
}

test('seal: mint covers the governed surface, verify passes, tamper voids', () => {
  const dir = toySubject();
  assert.deepEqual(sealedFiles(dir), ['evals/cases.ts', 'gen/tools.json', 'gen/world.ts', 'norms/contract.ts']);
  const seal = mintSeal(dir, { targets: [{ model: 'm', rate: 1, reps: 3 }], bar: 0.9, date: '2026-01-01' });
  assert.equal(seal.bar, 0.9);
  assert.equal(verifySeal(dir).ok, true);
  appendFileSync(join(dir, 'norms', 'contract.ts'), '// changed\n');
  const v = verifySeal(dir);
  assert.equal(v.ok, false);
  assert.notEqual(v.actual, v.expected);
});
