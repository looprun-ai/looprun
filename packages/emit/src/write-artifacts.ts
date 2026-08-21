/** The four files a subject is, written from one declaration and the world card beside it: the
 *  two cards, the door a loader opens, the gate that answers whether the subject holds, and the
 *  seam page an operator reads. The emitter writes no sentence of its own — every sentence in
 *  what it writes is a sentence the declaration carries, and a rule it cannot compose from
 *  declared words is a refusal naming what is missing.
 *
 *  A refusal writes nothing. Every refusal the emitter can know is collected first — the ones the
 *  surface answers and the ones composing the cards raises — and the whole list comes back at
 *  once, so an author fixes a declaration in one pass instead of one line per run. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SurfaceFacts } from '@looprun-ai/core';
import { factsFromSource, seamCovered } from '@looprun-ai/eval';
import { checkAgainstSurface } from './against-surface.js';
import { readDeclaration } from './declaration.js';
import type { Declaration } from './declaration.js';
import { writeCards } from './write-cards.js';

/** The subject door: the three names a loader reads, each re-exported from the file that owns
 *  it. It carries no subject's name because it carries no subject's content — the same two lines
 *  open every subject. */
export function writeSubject(): string {
  return [
    '/** The subject door: the two cards and the declared world, under the three names a loader',
    ' *  reads. Everything this subject is lives in the files these two lines name. */',
    'export { CONTRACT as contract, SPECS as specs } from \'./cards.js\';',
    'export { subjectWorld } from \'./world.js\';',
    ''
  ].join('\n');
}

/** The static gate, as a test that runs beside the subject. Every answer in it comes from the
 *  engine: the verbs from `runGate`, and the census a case's `covers` key is spelled against from
 *  `censusFor`, which walks the compiled desks and the honesty rows the Rulebook injects. This
 *  file names no guard of its own, so a row the engine adds or renames arrives here with it. */
export function writeGateFile(): string {
  return [
    '/** THE STATIC GATE of this subject: every verb, one list, one answer. Run it from this',
    ' *  directory with `npx vitest run check-subject.test.ts`. Every check belongs to the ENGINE',
    ' *  and this file only calls it — a check re-written beside a subject is a second truth, and',
    ' *  the first time the engine tightens a rule the copy keeps blessing what the engine now',
    ' *  refuses. Nothing here spends anything: no key, no model, no network. */',
    'import { expect, test } from \'vitest\';',
    'import { censusFor, runGate } from \'@looprun-ai/eval\';',
    'import { cases } from \'./cases.js\';',
    'import { contract, specs, subjectWorld } from \'./subject.js\';',
    '',
    'const SUBJECT = new URL(\'.\', import.meta.url).pathname;',
    '',
    'test(\'the subject passes every verb of the static gate\', () => {',
    '  expect(runGate(SUBJECT, {',
    '    world: subjectWorld,',
    '    cases,',
    '    censusNames: censusFor({ specs, contract, world: subjectWorld }),',
    '    // Whether a preset leaves a covered guard unable to refuse is read off a world already',
    '    // built and run against that preset, and this file builds none: that verb sits out.',
    '    presetLeavesGuardInert: null',
    '  })).toEqual([]);',
    '});',
    ''
  ].join('\n');
}

/** The seam page: every refusal the WORLD spells out, and the card rule that states it in words
 *  before the call is ever made. The fourth column is the operator's own — the emitter knows the
 *  code and never the sentence a person on the other end of it needs. */
export function writeSeam(subjectDir: string, facts: SurfaceFacts): string {
  const rows = [...seamCovered(subjectDir, facts)]
    .sort((a, b) => a.act === b.act ? a.code.localeCompare(b.code) : a.act.localeCompare(b.act));
  return [
    '# The seam',
    '',
    'Every refusal this world spells out, and the rule that speaks for it first. A guard cell',
    'reading `—` is a refusal the operator meets as a bare code, with no rule stating it in words',
    'before the call. The last column is yours: the sentence the person meeting that code needs.',
    '',
    '| act | code | guard | the sentence the operator needs |',
    '| --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.act} | ${row.code} | ${row.guard ?? '—'} |  |`),
    ''
  ].join('\n');
}

/** The guard names THIS declaration puts in the census: one prose rule per conduct law, one row per
 *  judged check a desk carries under the name its factory mints, each declared guard under the name
 *  the declaration gives it, and the consent hold the engine mints for every destructive act on the
 *  surface. The rest of the engine's always-on floor is the engine's own and is not named here —
 *  the gate reads that from the compiled desks. */
export function writeCensus(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const names: string[] = [];
  const add = (name: string): void => { if (!names.includes(name)) names.push(name); };
  for (const desk of declaration.desks) {
    for (const law of Object.keys(desk.conduct)) add(law);
    for (const check of desk.judged ?? []) add(check.factory);
  }
  for (const guard of declaration.contract.guards) add(guard.name);
  for (const fact of Object.values(facts.tools)) {
    if (fact.effect === 'destructive') add(`confirmFirst:${fact.name}`);
  }
  return names;
}

/** The covers keys an exam may spell. A case's `covers` key IS a census name — the case names the
 *  guard it means to trip, in that guard's own spelling — so this is the census, each name once
 *  and in one order. */
export function writeCovers(censusNames: readonly string[]): readonly string[] {
  return [...new Set(censusNames)].sort();
}

function sentenceOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One subject directory in, the paths of every file written out. The directory carries the two
 *  authored artifacts — `declaration.yaml` and the world card `world.ts` — and receives four:
 *  `cards.ts`, `subject.ts`, `check-subject.test.ts` and `gen/SEAM.md`. The seam is read after
 *  the cards land, so its guard column names the rules this run wrote. */
export function emit(subjectDir: string): readonly string[] {
  const declarationPath = join(subjectDir, 'declaration.yaml');
  const worldPath = join(subjectDir, 'world.ts');
  const absent = [declarationPath, worldPath].filter(path => !existsSync(path));
  if (absent.length > 0) {
    throw new Error(absent.map(path => `${path} is missing — a subject is one declaration beside `
      + 'the world card it is declared against').join('\n'));
  }

  const declaration = readDeclaration(declarationPath);
  const facts = factsFromSource(worldPath);
  const empty = Object.keys(facts.tools).length > 0 ? []
    : [`${worldPath} states no act this emitter can read — the surface is the keys of reads, `
       + 'writes and destructive on the world card, and each entry is read as it is written'];
  let cards = '';
  const composed: string[] = [];
  try { cards = writeCards(declaration, facts); }
  catch (error) { composed.push(sentenceOf(error)); }

  const refusals = [...empty, ...checkAgainstSurface(declaration, facts), ...composed];
  if (refusals.length > 0) throw new Error(refusals.join('\n'));

  const cardsPath = join(subjectDir, 'cards.ts');
  const subjectPath = join(subjectDir, 'subject.ts');
  const gatePath = join(subjectDir, 'check-subject.test.ts');
  const seamPath = join(subjectDir, 'gen', 'SEAM.md');
  writeFileSync(cardsPath, cards);
  writeFileSync(subjectPath, writeSubject());
  writeFileSync(gatePath, writeGateFile());
  mkdirSync(join(subjectDir, 'gen'), { recursive: true });
  writeFileSync(seamPath, writeSeam(subjectDir, facts));
  return [cardsPath, subjectPath, gatePath, seamPath];
}
