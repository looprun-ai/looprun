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

/** The emitted gate's own recompute, executed: the expression its first test assigns to
 *  `emitted`, lifted verbatim from the emitted file and evaluated over the same directory.
 *  Every agreement check in this file runs THIS — the template's real hashing — so a template
 *  that drifts from the emitter in slice width, file set or update order turns red here, and a
 *  template refactor that moves the expression out of reach fails loudly instead of passing a
 *  restatement of the digest. */
function gateOwnRecompute(dir: string): string {
  const gate = readFileSync(join(dir, 'check-subject.test.ts'), 'utf8');
  const start = gate.indexOf('const emitted = ');
  if (start === -1) throw new Error('the gate assigns no `emitted` recompute');
  const expression = gate.slice(start + 'const emitted = '.length, gate.indexOf(';', start));
  const evaluate = new Function('createHash', 'readFileSync', 'join', 'SUBJECT',
    `return (${expression});`) as (
      hash: typeof createHash, read: typeof readFileSync,
      joinPath: typeof join, subject: string) => string;
  return evaluate(createHash, readFileSync, join, dir);
}

test('the stamp is the two-file digest, and the emitted gate recomputes that exact value', () => {
  const dir = freshCopy();
  emit(dir);
  const first = stampIn(dir);
  // The digest, spelled once: the declaration's bytes, then the cards' bytes, one hash.
  expect(first).toBe(createHash('sha256')
    .update(readFileSync(join(dir, 'declaration.yaml')))
    .update(readFileSync(join(dir, 'cards.ts')))
    .digest('hex').slice(0, 16));
  expect(gateOwnRecompute(dir)).toBe(first);
  emit(dir);
  expect(stampIn(dir)).toBe(first);
});

test('a declaration edited after the emit no longer matches its gate', () => {
  const dir = freshCopy();
  emit(dir);
  const stamp = stampIn(dir);
  expect(gateOwnRecompute(dir)).toBe(stamp);
  const yaml = join(dir, 'declaration.yaml');
  writeFileSync(yaml, readFileSync(yaml, 'utf8') + '\n# edited by hand\n');
  expect(gateOwnRecompute(dir)).not.toBe(stamp);
});

test('a cards.ts edited after the emit no longer matches its gate', () => {
  const dir = freshCopy();
  emit(dir);
  const stamp = stampIn(dir);
  expect(gateOwnRecompute(dir)).toBe(stamp);
  const cards = join(dir, 'cards.ts');
  // One byte of the cards changes, the declaration stays: the first byte of the file flips.
  const edited = '*' + readFileSync(cards, 'utf8').slice(1);
  writeFileSync(cards, edited);
  expect(gateOwnRecompute(dir)).not.toBe(stamp);
});

test('the gate reads the two files it is stamped over, and never hashes itself', () => {
  const dir = freshCopy();
  emit(dir);
  const gate = readFileSync(join(dir, 'check-subject.test.ts'), 'utf8');
  const reads = [...gate.matchAll(/readFileSync\(join\(SUBJECT, '([^']+)'\)\)/g)]
    .map(match => match[1]);
  expect(reads).toEqual(['declaration.yaml', 'cards.ts']);
});
