/** The four artifacts a declaration becomes, and the door that writes them. The fixtures are
 *  copied out of the tree first: the emitter writes a `check-subject.test.ts` beside the subject,
 *  and one checked in under this package's own test tree would be collected as a suite of it. */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import type { AgentSpec, DeclaredWorld, DomainContract, ExamCase } from '@looprun-ai/core';
import { AgentFactory, factsFromWorld } from '@looprun-ai/core';
import { runGate } from '@looprun-ai/eval';
import { emit, readDeclaration, writeCensus, writeCovers, writeGateFile, writeSeam,
         writeSubject } from '../src/index.js';
import { decl, FACTS } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function staged(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'emit-'));
  cpSync(join(HERE, 'fixtures', name), dir, { recursive: true });
  return dir;
}

const FIXTURE_DIR = staged('emit-sound');
const BROKEN_DIR = staged('emit-broken');

test('the seam table carries one row per world refusal, third column empty', () => {
  const md = writeSeam(FIXTURE_DIR, FACTS);
  expect(md).toContain('| act | code | guard | the sentence the operator needs |');
  expect(md.split('\n').filter(l => l.startsWith('| ')).length).toBeGreaterThan(1);
});

test('the expected census names every guard the declaration mints', () => {
  const names = writeCensus(decl({ guards: [{ name: 'refundReadsTheInvoice', acts: ['issueRefund'],
                                              factory: 'onlyAfter', args: { after: 'getInvoice' } }] }), FACTS);
  expect(names).toContain('refundReadsTheInvoice');
});

test('emit writes every artifact and returns their paths', () => {
  const written = emit(FIXTURE_DIR);
  expect(written.map(p => basename(p)).sort())
    .toEqual(['SEAM.md', 'cards.ts', 'check-subject.test.ts', 'subject.ts']);
});

test('emit refuses rather than writing, when the surface refuses', () => {
  expect(() => emit(BROKEN_DIR)).toThrow(/the surface declares no such act/);
});

test('the seam names the act, the code, and that no rule speaks for a bare code', () => {
  const rows = writeSeam(staged('emit-sound'), FACTS).split('\n').filter(l => l.startsWith('| '));
  const refusal = rows.find(row => row.includes('stateIs:status'));
  expect(refusal).toBe('| issueRefund | stateIs:status | — |  |');
});

test('once the cards are emitted, the seam names the rule that speaks for the act', () => {
  const dir = staged('emit-sound');
  emit(dir);
  expect(readFileSync(join(dir, 'gen', 'SEAM.md'), 'utf8'))
    .toContain('| issueRefund | stateIs:status | refundReadsTheInvoice |  |');
});

test('the census carries the conduct laws and the consent hold of every destructive act', () => {
  const names = writeCensus(decl(), FACTS);
  expect(names).toContain('declareHonestly');
  expect(names).toContain('confirmFirst:issueRefund');
});

test('the covers keys are the census names, each spelled once', () => {
  expect(writeCovers(['oneQuestion', 'confirmFirst:issueRefund', 'oneQuestion']))
    .toEqual(['confirmFirst:issueRefund', 'oneQuestion']);
});

test('the subject door exports the three names a loader reads', () => {
  const out = writeSubject();
  expect(out).toContain('export { CONTRACT as contract, SPECS as specs } from \'./cards.js\';');
  expect(out).toContain('export { subjectWorld } from \'./world.js\';');
});

test('the gate file runs the one gate and states why no preset oracle rides with it', () => {
  const out = writeGateFile();
  expect(out).toContain('runGate(SUBJECT, {');
  expect(out).toContain('presetLeavesGuardInert: null');
  expect(out).toContain('.toEqual([])');
  expect(out).not.toContain('it(');
});

test('emit writes the seam under gen, and the cards beside the declaration', () => {
  const dir = staged('emit-sound');
  const written = emit(dir);
  expect(written).toContain(join(dir, 'gen', 'SEAM.md'));
  expect(readFileSync(join(dir, 'cards.ts'), 'utf8')).toContain('export const CONTRACT: DomainContract = {');
});

test('a refusal writes nothing at all, and states every refusal it can know', () => {
  const dir = staged('emit-broken');
  let message = '';
  try { emit(dir); } catch (error) { message = (error as Error).message; }
  expect(message).toContain('the surface declares no such act');
  expect(existsSync(join(dir, 'cards.ts'))).toBe(false);
  expect(existsSync(join(dir, 'subject.ts'))).toBe(false);
  expect(existsSync(join(dir, 'check-subject.test.ts'))).toBe(false);
  expect(existsSync(join(dir, 'gen'))).toBe(false);
});

/** One declaration with two faults of different kinds: an act the surface does not carry, which
 *  the surface check answers, and an argument `onlyAfter` does not read, which composing the card
 *  raises. An author fixes both in one pass or reads only half of what is wrong. */
const TWO_FAULTS = [
  'contract:',
  '  name: invoices',
  '  voice: Warm, brief, and exact about dates and money.',
  '  facts: []',
  '  guards:',
  '    - name: refundReadsTheInvoice',
  '      acts: [issueRefunds]',
  '      factory: onlyAfter',
  '      args: { after: getInvoice, pattern: inv }',
  '  disclosure:',
  '    issueRefund:',
  '      needs: { invoice: getInvoice }',
  '      before: Refunding this invoice cannot be taken back.',
  'desks:',
  '  - name: billing',
  '    persona: The billing desk.',
  '    tools: [getInvoice, issueRefund]',
  '    conduct: { declareHonestly: Say what ran and what did not. }',
  ''
].join('\n');

test('the refusals of the surface and of the cards arrive as one list', () => {
  const dir = staged('emit-broken');
  writeFileSync(join(dir, 'declaration.yaml'), TWO_FAULTS);
  let message = '';
  try { emit(dir); } catch (error) { message = (error as Error).message; }
  const lines = message.split('\n');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toContain('names \'issueRefunds\', and the surface declares no such act');
  expect(lines[1]).toContain('declares args.pattern, and factory \'onlyAfter\'');
  expect(existsSync(join(dir, 'cards.ts'))).toBe(false);
});

test('a directory with no world card is refused by name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'emit-'));
  expect(() => emit(dir)).toThrow(join(dir, 'declaration.yaml'));
});

/** The one exam case the emitted subject is gated with: it names two guards the census carries,
 *  the rule the declaration gives its own name and the consent hold the surface mints. */
const CASES = [
  'import type { ExamCase } from \'@looprun-ai/core\';',
  '',
  'export const cases: readonly ExamCase[] = [',
  '  { id: \'refund-01\', split: \'fix\', turns: [\'refund inv_1\'],',
  '    covers: [\'refundReadsTheInvoice\', \'confirmFirst:issueRefund\'],',
  '    rubric: \'The refund lands on the invoice the read returned, once the operator agreed.\' }',
  '];',
  ''
].join('\n');

interface Door { readonly contract: DomainContract;
                 readonly specs: Readonly<Record<string, AgentSpec>>;
                 readonly subjectWorld: DeclaredWorld }

/** The whole promise of the emitter in one run: what it writes loads, compiles into desks the
 *  engine accepts, and clears every verb of the static gate. The subject is staged UNDER this
 *  package so the emitted card resolves the engine by name the way a real subject does; the
 *  directory opens with a dot, which the runner's own collection never reaches into. */
test('the emitted subject clears every verb of the gate', async () => {
  const dir = mkdtempSync(join(HERE, '.staged-'));
  try {
    cpSync(join(HERE, 'fixtures', 'emit-sound'), dir, { recursive: true });
    emit(dir);
    writeFileSync(join(dir, 'cases.ts'), CASES);
    const door = await import(pathToFileURL(join(dir, 'subject.ts')).href) as Door;
    const exam = await import(pathToFileURL(join(dir, 'cases.ts')).href) as
      { readonly cases: readonly ExamCase[] };

    const facts = factsFromWorld(door.subjectWorld);
    const factory = new AgentFactory();
    const censusNames = new Set(['claimIsGrounded', 'claimIsComplete']);
    for (const desk of Object.values(door.specs)) {
      for (const guard of factory.governed(desk, door.contract, facts).guards) {
        censusNames.add(guard.name);
      }
    }
    // Every name the emitter predicts is a name the engine actually carries.
    const predicted = writeCensus(readDeclaration(join(dir, 'declaration.yaml')), facts);
    expect(predicted.filter(name => !censusNames.has(name))).toEqual([]);
    expect(predicted).toContain('confirmFirst:issueRefund');

    expect(runGate(dir, { world: door.subjectWorld, cases: exam.cases, censusNames,
                          presetLeavesGuardInert: null })).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
