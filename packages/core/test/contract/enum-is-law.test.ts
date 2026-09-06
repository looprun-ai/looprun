import { test, expect } from 'vitest';
import { CanonicalCall } from '../../src/contract/canonical-call.js';
import { fact } from '../fixtures/compiled-agents.js';

// A declared enum is the whole of what an argument may carry: a value outside it is refused
// before the call is made, exactly as an argument the tool does not declare.

const LOG = fact({ name: 'getAuditLog', effect: 'read', schema: { type: 'object',
  properties: { action: { type: 'string', enum: ['chargeDeposit', 'fileClaim'] }, limit: { type: 'integer' } },
  required: [] } });

test('a value inside the declared enum is canonical', () => {
  const call = CanonicalCall.of('getAuditLog', { action: 'chargeDeposit' }, LOG);
  expect('badArg' in call).toBe(false);
});

test('a value outside the declared enum is a bad argument', () => {
  expect(CanonicalCall.of('getAuditLog', { action: 'deposit' }, LOG)).toEqual({ badArg: 'action' });
});

test('an argument with no enum still takes any value of its type', () => {
  const call = CanonicalCall.of('getAuditLog', { limit: 5 }, LOG);
  expect('badArg' in call).toBe(false);
});
