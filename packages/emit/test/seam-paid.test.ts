/** A seam row reading LATE closes when a rule says it is the one that speaks for that code.
 *  Nothing infers it: a rule over an act is not a rule about every code that act can answer. */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { emit } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROW = '| issueRefund | stateIs:status |';

/** The sound fixture with a seam sentence written for the code the world spells out, and the
 *  read-order rule optionally declaring that it is the rule that speaks for it. */
function seamRow(pays: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'seam-'));
  cpSync(join(HERE, 'fixtures', 'emit-sound'), dir, { recursive: true });
  const path = join(dir, 'declaration.yaml');
  let declaration = readFileSync(path, 'utf8');
  declaration = declaration.replace('  guards:\n',
    '  seam:\n    issueRefund:\n      stateIs:status: >-\n'
    + '        The invoice is settled, and a settled invoice takes no refund.\n  guards:\n');
  if (pays !== null) {
    declaration = declaration.replace('      args: { read: getInvoice }\n',
      `      args: { read: getInvoice }\n      pays: '${pays}'\n`);
  }
  writeFileSync(path, declaration);
  emit(dir);
  return readFileSync(join(dir, 'gen', 'SEAM.md'), 'utf8')
    .split('\n').find(line => line.startsWith(ROW)) ?? '';
}

test('a sentence the operator only reads after confirming names itself LATE', () => {
  expect(seamRow(null)).toContain('SENTENCE ARRIVES LATE');
});

test('the rule that declares it pays that code closes the row', () => {
  const row = seamRow('stateIs:status');
  expect(row).not.toContain('SENTENCE ARRIVES LATE');
  expect(row).toContain('after the code');
});

test('a rule paying another code of the same act closes nothing', () => {
  expect(seamRow('SOME_OTHER_CODE')).toContain('SENTENCE ARRIVES LATE');
});
