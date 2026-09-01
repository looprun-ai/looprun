/** The floor speaks the declaration: every engine-authored delivery is sentences —
 *  the act's human content without its log prefix, a refusal code inside a human
 *  sentence, the consent code inside the engine's human instruction. No act-log line
 *  and no bare code ever reaches a delivered text. */
import { test, expect } from 'vitest';
import { assembleFacts, spokenActSentence } from '../../src/run/delivery-facts.js';
import { DeliveryWriter } from '../../src/run/delivery-writer.js';
import { actLogLine } from '../../src/cards/catalog.js';
import type { Act, Question } from '../../src/contract/vocabulary.js';

function act(sentence: string, status: Act['status'], effect: Act['effect'] = 'write',
  owed: Act['owed'] = null): Act {
  return { call: { tool: 'chargeDeposit', args: {}, key: 'k' }, status, sentence,
    effect, owed, origin: 'model' } as unknown as Act;
}

test('spokenActSentence keeps the human tail and drops the log prefix', () => {
  expect(spokenActSentence(
    'chargeDeposit(bk_1001) — done. 3000 is now held against bk_1001.'))
    .toBe('3000 is now held against bk_1001.');
  expect(spokenActSentence('sendEmail(ana@example.com) — done'))
    .toBe('The sendEmail call ran and took effect.');
  expect(spokenActSentence('sendEmail(ana@example.com) — not-done (One email per person, ever.)'))
    .toBe('One email per person, ever.');
  expect(spokenActSentence('removeMember(mem_1001) — not-done (awaiting approval)'))
    .toBe('This stands held, awaiting the operator\'s code.');
  expect(spokenActSentence('getMember() — done. Dana Okafor (mem_1001) is recorded as owner.'))
    .toBe('Dana Okafor (mem_1001) is recorded as owner.');
  expect(spokenActSentence('A sentence with no log prefix stays itself.'))
    .toBe('A sentence with no log prefix stays itself.');
});

test('a receipt fact for an undeclared done write is the spoken sentence', () => {
  const facts = assembleFacts(
    [act('sendEmail(ana@example.com) — done. The confirmation went out.', 'done')],
    [], [], []);
  expect(facts).toHaveLength(1);
  expect(facts[0].text).toBe('The confirmation went out.');
  expect(actLogLine(facts[0].text)).toBeNull();
});

test('a code-shaped owed refusal is wrapped in a human sentence, the code verbatim', () => {
  const facts = assembleFacts(
    [act('changePlan(starter) — not-done (SOLE_OWNER_PROTECTED)', 'not-done', 'write',
      { kind: 'refusal', text: 'SOLE_OWNER_PROTECTED' })],
    [], [], []);
  expect(facts).toHaveLength(1);
  expect(facts[0].text).toContain('SOLE_OWNER_PROTECTED');
  expect(facts[0].text).not.toBe('SOLE_OWNER_PROTECTED');
  expect(facts[0].text[0]).not.toBe('S');
});

test('the floor is sentences: no act log, no bare code, the ask and its code instruction', () => {
  const dw = new DeliveryWriter();
  const open: Question[] = [{ code: '101472',
    sentence: 'Removing mem_1001 takes Dana Okafor off this workspace and frees their seat.'
  } as unknown as Question];
  const acts = [
    act('getMember() — done. Dana Okafor (mem_1001) is recorded as owner.', 'done', 'read'),
    act('removeMember(mem_1001) — not-done (awaiting approval)', 'not-done')
  ];
  const text = dw.compose('', acts, open, []);
  expect(actLogLine(text)).toBeNull();
  expect(text).toContain('Removing mem_1001 takes Dana Okafor off this workspace');
  expect(text).toContain('101472');
  expect(text).not.toContain('[101472]');
  expect(text).toContain('To proceed, send just this code: 101472.');
});
