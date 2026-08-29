import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { emit } from '../src/index.js';

const SOUND = join(fileURLToPath(import.meta.url), '../fixtures/emit-sound');

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gate-stamp-'));
  cpSync(SOUND, dir, { recursive: true });
  return dir;
}

function stampIn(dir: string): string {
  const gate = readFileSync(join(dir, 'check-subject.test.ts'), 'utf8');
  const found = gate.split("const STAMP = '")[1]?.split("'")[0];
  if (found === undefined) throw new Error('the gate carries no stamp');
  return found;
}

/** What the emitted gate's first test recomputes: one digest over the declaration's bytes,
 *  then the cards' bytes, in that order. */
function fingerprint(dir: string): string {
  return createHash('sha256')
    .update(readFileSync(join(dir, 'declaration.yaml')))
    .update(readFileSync(join(dir, 'cards.ts')))
    .digest('hex').slice(0, 16);
}

test('the stamp is the fingerprint of the declaration and the cards, stable across emits', () => {
  const dir = freshCopy();
  emit(dir);
  const first = stampIn(dir);
  expect(first).toBe(fingerprint(dir));
  emit(dir);
  expect(stampIn(dir)).toBe(first);
});

test('a declaration edited after the emit no longer matches its gate', () => {
  const dir = freshCopy();
  emit(dir);
  const stamp = stampIn(dir);
  expect(fingerprint(dir)).toBe(stamp);
  const yaml = join(dir, 'declaration.yaml');
  writeFileSync(yaml, readFileSync(yaml, 'utf8') + '\n# edited by hand\n');
  expect(fingerprint(dir)).not.toBe(stamp);
});

test('a cards.ts edited after the emit no longer matches its gate', () => {
  const dir = freshCopy();
  emit(dir);
  const stamp = stampIn(dir);
  expect(fingerprint(dir)).toBe(stamp);
  const cards = join(dir, 'cards.ts');
  // One byte of the cards changes, the declaration stays: the first byte of the file flips.
  const edited = '*' + readFileSync(cards, 'utf8').slice(1);
  writeFileSync(cards, edited);
  expect(fingerprint(dir)).not.toBe(stamp);
});

test('the gate reads the two files it is stamped over, and never hashes itself', () => {
  const dir = freshCopy();
  emit(dir);
  const gate = readFileSync(join(dir, 'check-subject.test.ts'), 'utf8');
  const reads = [...gate.matchAll(/readFileSync\(join\(SUBJECT, '([^']+)'\)\)/g)]
    .map(match => match[1]);
  expect(reads).toEqual(['declaration.yaml', 'cards.ts']);
});
