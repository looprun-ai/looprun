/** The two laws that hold a free sentence lawful: a guard decides from declared data and never
 *  from a list of words it searches inside text, and no record id of the world is written into a
 *  sentence the prompt carries. */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { worldIdsInSentences, wordLists } from '../src/lints.js';

function subject(cards: string, world = ''): string {
  const dir = mkdtempSync(join(tmpdir(), 'free-prose-'));
  writeFileSync(join(dir, 'cards.ts'), cards);
  writeFileSync(join(dir, 'world.ts'), world);
  return dir;
}

const WORLD = `export const w = { records: { vessels: { ves_1: { name: 'Kestrel' } } } };`;

test('a word list searched inside text is a finding, at its own line', () => {
  const dir = subject([
    'export const g = precondition(\'placeHold\', ({ state }) =>',
    '  [\'urgent\', \'emergency\', \'critical\'].some(w =>',
    '    JSON.stringify(state.holds).includes(w)),',
    '  \'A freeze carries a reason this marina treats as standing.\');'
  ].join('\n'));
  const findings = wordLists(dir);
  expect(findings.map(f => f.code)).toContain('SUBJECT_WORD_LIST');
  expect(findings[0].sentence).toContain('cards.ts:2');
});

test('case folding on a card is a word comparison made forgiving, and is a finding', () => {
  const dir = subject('export const g = (s: string) => s.toLowerCase() === \'paid\';');
  expect(wordLists(dir).map(f => f.code)).toEqual(['SUBJECT_WORD_LIST']);
});

test('a declared list compared whole-value to a record field is not a word list', () => {
  const dir = subject([
    'export const g = precondition(\'issueRefund\', ({ record }) =>',
    '  [\'manager\', \'owner\'].some(value => value === record?.role),',
    '  \'Only a manager refunds.\');'
  ].join('\n'));
  expect(wordLists(dir)).toEqual([]);
});

test('a world record id quoted into a rule sentence is a finding naming the id', () => {
  const dir = subject([
    'export const g = prose(\'berthIsOneVessel\',',
    '  \'A berth takes one vessel at a time — ves_1 is the worked example.\');'
  ].join('\n'), WORLD);
  const findings = worldIdsInSentences(dir);
  expect(findings.map(f => f.code)).toEqual(['SENTENCE_CARRIES_WORLD_ID']);
  expect(findings[0].sentence).toContain('ves_1');
});

test('a world record id in a disclosure sentence is the same finding', () => {
  const dir = subject([
    'export const CONTRACT = { disclosure: {',
    '  assignBerth: { before: \'This puts ves_1 on the berth you named.\' } } };'
  ].join('\n'), WORLD);
  expect(worldIdsInSentences(dir).map(f => f.code)).toEqual(['SENTENCE_CARRIES_WORLD_ID']);
});

test('a record id carried as DATA, not inside a sentence, is not a finding', () => {
  const dir = subject(
    'export const g = mustAccountFor({ records: [\'ves_1\'], status: \'done\' });', WORLD);
  expect(worldIdsInSentences(dir)).toEqual([]);
});

test('an id-shaped token the world does not carry is nobody\'s record', () => {
  const dir = subject(
    'export const g = prose(\'n\', \'The berth code ber_9 is yours to quote.\');', WORLD);
  expect(worldIdsInSentences(dir)).toEqual([]);
});
