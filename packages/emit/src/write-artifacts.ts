/** The four files a subject is, written from one declaration and the world card beside it: the
 *  two cards, the door a loader opens, the gate that answers whether the subject holds, and the
 *  seam page an operator reads. The emitter writes no sentence of its own — every sentence in
 *  what it writes is a sentence the declaration carries, and a rule it cannot compose from
 *  declared words is a refusal naming what is missing.
 *
 *  A refusal writes nothing. Every refusal the emitter can know is collected first — the ones the
 *  surface answers and the ones composing the cards raises — and the whole list comes back at
 *  once, so an author fixes a declaration in one pass instead of one line per run. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SurfaceFacts } from '@looprun-ai/core';
import { factsFromSource, seamCovered } from '@looprun-ai/eval';
import { checkAgainstSurface } from './against-surface.js';
import { readDeclaration } from './declaration.js';
import type { Declaration } from './declaration.js';
import { seamLaws, writeCards } from './write-cards.js';

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

/** The type check the cards answer to. `cards.ts` is the one emitted file that states types, and
 *  it states them against the engine's own: a field `Guard` does not carry, a factory handed the
 *  wrong shape, a ceiling under a name `Limits` does not declare. A subject tree whose tests
 *  transpile without checking a type reads every one of those as a clean file, so the config is
 *  strict — the looser settings agree with a card the engine would refuse.
 *
 *  The cards alone are in it. They import from `@looprun-ai/core` and from nothing else, so this
 *  answers for exactly what the emit wrote. Modules resolve the way the subject's own test runner
 *  resolves them, so a directory that declares no package of its own is checked exactly as it
 *  runs: `npx tsc -p tsconfig.json`, from the subject directory. */
export function writeTsconfig(): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true
    },
    include: ['cards.ts']
  }, null, 2)}\n`;
}

/** The static gate, as a test that runs beside the subject. Every answer in it comes from the
 *  engine: the verbs from `runGate`, and the census a case's `covers` key is spelled against from
 *  `censusFor`, which walks the compiled desks and the honesty rows the Rulebook injects. This
 *  file names no guard of its own, so a row the engine adds or renames arrives here with it.
 *  The gate's findings fail the run; its seam warnings and its lane advisories print beside it and
 *  fail nothing. */
export function writeGateFile(stamp: string): string {
  return [
    '/** THE STATIC GATE of this subject: every verb, one answer. Run it from this',
    ' *  directory with `npx vitest run check-subject.test.ts`. Every check belongs to the ENGINE',
    ' *  and this file only calls it — a check re-written beside a subject is a second truth, and',
    ' *  the first time the engine tightens a rule the copy keeps blessing what the engine now',
    ' *  refuses. A finding fails this gate, and so does a type error in the cards; a seam warning',
    ' *  and a lane advisory print beside a green run and fail nothing. Nothing here spends',
    ' *  anything: no key, no model, no network. */',
    'import { createHash } from \'node:crypto\';',
    'import { readFileSync } from \'node:fs\';',
    'import { join } from \'node:path\';',
    'import { expect, test } from \'vitest\';',
    'import { censusFor, runGate } from \'@looprun-ai/eval\';',
    'import { cases } from \'./cases.js\';',
    'import { contract, specs, subjectWorld } from \'./subject.js\';',
    '',
    'const SUBJECT = new URL(\'.\', import.meta.url).pathname;',
    '',
    '/** The build this gate answers for: one digest over the declaration\'s bytes, then the',
    ' *  bytes of the cards written from it. A refused emit leaves the previous cards in place,',
    ' *  and a hand edit leaves cards no declaration wrote — either way this gate would answer',
    ' *  for a build that does not exist, so the first thing it checks is which build it is',
    ' *  holding. The gate file itself never enters the digest: a file cannot carry its own',
    ' *  fingerprint. */',
    `const STAMP = '${stamp}';`,
    '',
    'test(\'the cards beside this gate were written from the declaration beside them\', () => {',
    '  const emitted = createHash(\'sha256\')',
    '    .update(readFileSync(join(SUBJECT, \'declaration.yaml\')))',
    '    .update(readFileSync(join(SUBJECT, \'cards.ts\'))).digest(\'hex\').slice(0, 16);',
    '  expect(emitted, \'this is not the build the emit stamped: the last emit was refused, the \'',
    '    + \'declaration changed after it, or cards.ts was edited by hand — emit again before \'',
    '    + \'reading this gate\')',
    '    .toBe(STAMP);',
    '});',
    '',
    'test(\'the subject passes every verb of the static gate\', () => {',
    '  const gate = runGate(SUBJECT, {',
    '    world: subjectWorld,',
    '    // The desks the prompt is rendered from: what every turn sends is measured over them,',
    '    // against the byte ceiling this subject\'s own ask/targets.json declares.',
    '    specs,',
    '    contract,',
    '    cases,',
    '    censusNames: censusFor({ specs, contract, world: subjectWorld }),',
    '    // Whether a scenario leaves a covered guard unable to refuse is read off a world already',
    '    // built and run against that preset. This file builds none, so it answers for every',
    '    // covered guard that the scenario it runs in leaves it able to fire — the one line of',
    '    // this gate that is a claim rather than a reading.',
    '    presetLeavesGuardInert: () => false',
    '  });',
    '  // The seam budget, one line per row: every seam-table row no case drives into and no',
    '  // seam law names prints here with the run, and none of them fails it.',
    '  for (const seam of gate.seams) console.warn(`seam warning — ${seam.sentence}`);',
    '  // The numbers the skill teaches as targets, printed on the desk that passes one. The lane',
    '  // is the ask\'s to spend: a desk carrying fifty acts prints here and the run stays green.',
    '  for (const advisory of gate.advisories) console.warn(`advisory — ${advisory.sentence}`);',
    '  expect(gate.findings).toEqual([]);',
    '});',
    '',
    'test(\'the cards type-check against the engine\\\'s own types\', async () => {',
    '  // The gate runs the type check rather than leaving it beside itself: a card carrying a',
    '  // field the engine does not declare transpiles clean through a test runner, and the desk',
    '  // then teaches a law the engine never installs. tsconfig.json states the settings; this',
    '  // reads them and answers with the diagnostics.',
    '  const ts = (await import(\'typescript\')).default;',
    '  const configPath = join(SUBJECT, \'tsconfig.json\');',
    '  const read = ts.readConfigFile(configPath, path => readFileSync(path, \'utf8\'));',
    '  expect(read.error, \'tsconfig.json beside these cards does not parse\').toBeUndefined();',
    '  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, SUBJECT);',
    '  const program = ts.createProgram(parsed.fileNames, parsed.options);',
    '  const found = [...program.getSemanticDiagnostics(), ...program.getSyntacticDiagnostics()]',
    '    .map(d => `${d.file === undefined ? \'\' : `${d.file.fileName}: `}${',
    '      ts.flattenDiagnosticMessageText(d.messageText, \' \')}`);',
    '  expect(found).toEqual([]);',
    '});',
    ''
  ].join('\n');
}

/** The seam page: every refusal the WORLD spells out, and the card rule that states it in words
 *  before the call is ever made. The fourth column is the operator's own — the emitter knows the
 *  code and never the sentence a person on the other end of it needs. */
export function writeSeam(subjectDir: string, facts: SurfaceFacts,
                          declaration?: Declaration): string {
  // A row is paid by the guard that SAYS it is: the table cannot read a rule and know which
  // refusal it speaks for, and a rule over an act is not a rule about every code that act can
  // answer. `pays` is the author's own word, and it is the only thing that closes a row.
  const paid = new Set([
    ...(declaration?.contract.guards ?? []).flatMap(guard =>
      guard.pays === undefined ? [] : guard.acts.map(act => `${act}|${guard.pays ?? ''}`)),
    // A ceiling on a held call's own argument is a rule too: it refuses before the operator is
    // ever asked, so the row it names is answered on time and closes with the guards'.
    ...Object.entries(declaration?.contract.disclosure ?? {}).flatMap(([act, entry]) =>
      entry.cap?.pays === undefined ? [] : [`${act}|${entry.cap.pays}`])
  ]);
  const rows = [...seamCovered(subjectDir, facts)]
    .sort((a, b) => a.act === b.act ? a.code.localeCompare(b.code) : a.act.localeCompare(b.act));
  return [
    '# The seam',
    '',
    'Every refusal this world spells out.',
    '',
    'The `rules` cell names every declared rule that covers the ACT and can refuse a call. It is',
    'not about the code beside it: a rule named there may speak about something else entirely, and',
    'a cell reading `—` is an act no rule refuses at all.',
    '',
    'The `met` cell says where the ACT puts this code. `before the call` — the call goes straight',
    'to the world, and the code is what the operator hears. `after the code` — the act asks the',
    'operator for a confirmation code before the world is reached, so unless a rule beside it',
    'refuses the call first, this refusal is only ever heard once they have answered.',
    '',
    '**`SENTENCE ARRIVES LATE`** is the row to read first: you wrote the sentence the operator',
    'meets this code with, and the act asks them to confirm before they ever read it. Two answers',
    'are right and the row chooses neither. Write a rule that refuses the call, where the records',
    'the desk already read say the act cannot run — the operator hears your sentence instead of',
    'being asked. Or leave it, where the refusal is the world\'s own answer to a call worth putting',
    'to them, and their word is what settles it.',
    '',
    'A row stops reading LATE when a rule declares `pays: <the code>` — your word that this rule',
    'is the one that speaks for it. Nothing infers it: a rule over an act is not a rule about',
    'every code that act can answer.',
    '',
    'The last column is yours: the sentence the person meeting that code needs.',
    '',
    '| act | code | rules over the act | met | the sentence the operator needs |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${row.act} | ${row.code} | ${row.guards.length === 0 ? '—'
      : row.guards.join(', ')} | ${row.where === 'before' ? 'before the call'
      : row.spoken && !paid.has(`${row.act}|${row.code}`)
        ? 'after the code — **SENTENCE ARRIVES LATE**' : 'after the code'} |  |`),
    ''
  ].join('\n');
}

/** The guard names THIS declaration puts in the census: one prose rule per conduct law, one per
 *  seam law on the desks holding its act, one row per judged check a desk carries under the name
 *  its factory mints, each declared guard under the name the declaration gives it, and the consent
 *  hold the engine mints for every destructive act on the surface. The rest of the engine's
 *  always-on floor is the engine's own and is not named here — the gate reads that from the
 *  compiled desks. */
export function writeCensus(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const names: string[] = [];
  const add = (name: string): void => { if (!names.includes(name)) names.push(name); };
  const seam = seamLaws(declaration);
  for (const desk of declaration.desks) {
    for (const law of Object.keys(desk.conduct)) add(law);
    for (const law of seam) if (desk.tools.includes(law.act)) add(law.name);
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
 *  authored artifacts — `declaration.yaml` and the world card `world.ts` — and receives five:
 *  `cards.ts`, `subject.ts`, `check-subject.test.ts`, `tsconfig.json` and `gen/SEAM.md`. The seam
 *  is read after the cards land, so its guard column names the rules this run wrote. */
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
  // The act and the code of every seam row come from the WORLD card, so the table a declared seam
  // sentence is checked against is the same one whether or not a previous run left cards behind.
  const seam = seamCovered(subjectDir, facts);
  let cards = '';
  const composed: string[] = [];
  try { cards = writeCards(declaration, facts); }
  catch (error) { composed.push(sentenceOf(error)); }

  const refusals = [...empty, ...checkAgainstSurface(declaration, facts, seam), ...composed];
  if (refusals.length > 0) throw new Error(refusals.join('\n'));

  // The stamp: one digest over the declaration's bytes, then the cards' bytes — exactly the two
  // files the gate reads back. The gate file itself never enters the digest, because it carries
  // the stamp: a file cannot carry its own fingerprint.
  const stamp = createHash('sha256')
    .update(readFileSync(declarationPath)).update(cards).digest('hex').slice(0, 16);
  const cardsPath = join(subjectDir, 'cards.ts');
  const subjectPath = join(subjectDir, 'subject.ts');
  const gatePath = join(subjectDir, 'check-subject.test.ts');
  const tsconfigPath = join(subjectDir, 'tsconfig.json');
  const seamPath = join(subjectDir, 'gen', 'SEAM.md');
  writeFileSync(cardsPath, cards);
  writeFileSync(subjectPath, writeSubject());
  writeFileSync(gatePath, writeGateFile(stamp));
  writeFileSync(tsconfigPath, writeTsconfig());
  mkdirSync(join(subjectDir, 'gen'), { recursive: true });
  writeFileSync(seamPath, writeSeam(subjectDir, facts, declaration));
  return [cardsPath, subjectPath, gatePath, tsconfigPath, seamPath];
}
