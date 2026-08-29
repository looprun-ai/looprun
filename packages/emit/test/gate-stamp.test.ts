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

test('the stamp is the declaration\'s own fingerprint, stable across emits', () => {
  const dir = freshCopy();
  emit(dir);
  const first = stampIn(dir);
  expect(first).toBe(createHash('sha256')
    .update(readFileSync(join(dir, 'declaration.yaml'))).digest('hex').slice(0, 16));
  emit(dir);
  expect(stampIn(dir)).toBe(first);
});

test('a declaration edited after the emit no longer matches its gate', () => {
  const dir = freshCopy();
  emit(dir);
  const stamp = stampIn(dir);
  const yaml = join(dir, 'declaration.yaml');
  writeFileSync(yaml, readFileSync(yaml, 'utf8') + '\n# edited by hand\n');
  const fresh = createHash('sha256').update(readFileSync(yaml)).digest('hex').slice(0, 16);
  expect(fresh).not.toBe(stamp);
});
