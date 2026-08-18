import { test, expect } from 'vitest';
import type { Gate } from '../../src/contract/vocabulary.js';
import { evaluateGates } from '../../src/world/world-gates.js';

test('a gate on a missing record refuses with the gate sentence, never a silent pass', () => {
  expect(evaluateGates([{ kind: 'exists' }], null)).toContain('does not exist');
});

test('stateIs mismatch names field, expected and actual', () => {
  const s = evaluateGates([{ kind: 'stateIs', field: 'status', value: 'CONFIRMED' }],
                          { status: 'MAINTENANCE' });
  expect(s).toContain('MAINTENANCE');
  expect(s).toContain('CONFIRMED');
  expect(s).toContain('status');
});

test('fieldAtLeast passes on the boundary and refuses below it', () => {
  const gates: readonly Gate[] = [{ kind: 'fieldAtLeast', field: 'credit', min: 10 }];
  expect(evaluateGates(gates, { credit: 10 })).toBeNull();
  expect(evaluateGates(gates, { credit: 9 })).toContain('credit');
});

test('every gate passing answers null; the first failing gate speaks', () => {
  const gates: readonly Gate[] = [
    { kind: 'exists' },
    { kind: 'stateIs', field: 'status', value: 'CONFIRMED' }
  ];
  expect(evaluateGates(gates, { status: 'CONFIRMED' })).toBeNull();
  expect(evaluateGates(gates, { status: 'HELD' })).toContain('CONFIRMED');
});
