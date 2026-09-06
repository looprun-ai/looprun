import { expect, test } from 'vitest';
import { idNamedByUser } from '../../src/cards/catalog.js';
import type { CallCtx } from '../../src/contract/vocabulary.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

// An identifier that names a person is licensed by the operator's own words: the id itself,
// or a label that fits one row of the list read. Nobody named, or two people named alike,
// refuses — the desk asks, it never picks.

const ROSTER = { technicians: [
  { id: 'tech_301', name: 'Marcus Ilunga' },
  { id: 'tech_302', name: 'Sofia Reyes' },
  { id: 'tech_303', name: 'Jonah Pike' }
] };
const TWINS = { technicians: [...ROSTER.technicians, { id: 'tech_305', name: 'Marcus Ilunga' }] };

const guard = idNamedByUser('dispatchTechnician',
  { arg: 'technicianId', read: 'listTechnicians', list: 'technicians', key: 'id', label: 'name' })
  .compile('contract', factsFromWorld(HOSTILE));

const ctx = (technicianId: string, said: string, roster: unknown = ROSTER): CallCtx => ({
  call: { tool: 'dispatchTechnician', args: { technicianId, bookingId: 'bk_1002' } },
  effect: 'write', userTexts: [said],
  reads: { latest: () => (roster === null ? undefined : { answer: roster, at: 1 }) }
} as unknown as CallCtx);

const words = (d: unknown): string => typeof d === 'string' ? d : String((d as { says: string })?.says ?? '');

test('a name nobody on the list carries refuses, and the refusal lists who is', () => {
  const denied = guard.deny(ctx('tech_301', 'Send Dave from the north depot to deliver bk_1002.'));
  expect(words(denied)).toContain('nobody the user named is on listTechnicians');
  expect(words(denied)).toContain('Marcus Ilunga, Sofia Reyes, Jonah Pike');
});

test('the row whose name the user wrote licenses its own id', () => {
  expect(guard.deny(ctx('tech_302', 'Book Sofia Reyes for the delivery on bk_1002.'))).toBeNull();
});

test('a name the user wrote licenses no other id', () => {
  expect(words(guard.deny(ctx('tech_301', 'Book Sofia Reyes for the delivery.'))))
    .toContain('the user named Sofia Reyes (tech_302)');
});

test('the id itself in the user\'s words licenses the call, name or no name', () => {
  expect(guard.deny(ctx('tech_303', 'Send tech_303 out on bk_1002.'))).toBeNull();
});

test('a name fitting two rows refuses and names both', () => {
  const denied = words(guard.deny(ctx('tech_301', 'Send Marcus Ilunga.', TWINS)));
  expect(denied).toContain('fits 2 rows');
  expect(denied).toContain('tech_301');
  expect(denied).toContain('tech_305');
});

test('an unread list refuses in words', () => {
  expect(words(guard.deny(ctx('tech_301', 'Send Marcus Ilunga.', null)))).toContain('was not read this conversation');
});

test('a call carrying no id stands aside', () => {
  expect(guard.deny(ctx('', 'Send somebody.'))).toBeNull();
});
