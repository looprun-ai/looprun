import { test, expect } from 'vitest';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// M3 — the honesty floor end to end: the first finish LIES (a claim for work that
// never ran) and HIDES (the write that DID run is unaccounted); the correction names
// both; the redrive finishes honestly and the turn seals on the model's word.

test('M3 — lying and hiding both redrive; the honest retry seals', async () => {
  const model = payingDesk([
    callStep('compRoom', { id: 'bk_9' }),
    finishStep('All set.', [{ tool: 'getBooking', target: 'bk_9', word: 'done' }]),
    finishStep('Comped the room for bk_9.', [{ tool: 'compRoom', target: 'bk_9', word: 'done' }])
  ,
    { calls: [], text: '' },
    { calls: [], text: '' }]);
  const { engine, world } = caseRig({ model });

  const r = await engine.chat('s1', 'comp the room for bk_9');

  expect(world.snapshot().bookings.bk_9.room).toBe('suite');
  const flagged = r.corrections.filter(c => c.kind === 'redrive');
  expect(flagged.some(c => c.kind === 'redrive' && c.guardName === 'claimIsGrounded')).toBe(true);
  expect(flagged.some(c => c.kind === 'redrive' && c.guardName === 'claimIsComplete')).toBe(true);
  expect(r.finish?.report).toEqual([{ tool: 'compRoom', target: 'bk_9', word: 'done' }]);
  expect(r.closedBy).toBe('model');
});
