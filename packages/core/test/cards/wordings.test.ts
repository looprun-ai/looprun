import { test, expect } from 'vitest';
import { resolveWording } from '../../src/cards/wordings.js';

test('resolveWording with nothing declared fills every key with the engine pack', () => {
  const w = resolveWording(undefined);
  for (const key of ['done', 'not-done', 'unknown', 'held', 'refused', 'blocked'] as const) {
    expect(w.status[key].length).toBeGreaterThan(2);
  }
  expect(w.sentence.approvalInstruction.length).toBeGreaterThan(5);
});

test('an override changes ONLY the named word; every other key keeps the pack', () => {
  const w = resolveWording({ status: { held: 'awaiting your approval' } });
  expect(w.status.held).toBe('awaiting your approval');
  expect(w.status.done).toBe(resolveWording(undefined).status.done);
  expect(w.sentence.questionExpired).toBe(resolveWording(undefined).sentence.questionExpired);
});

test('a sentence override lands the same way', () => {
  const w = resolveWording({ sentence: { deniedByGuard: 'A rule closed this door.' } });
  expect(w.sentence.deniedByGuard).toBe('A rule closed this door.');
});
