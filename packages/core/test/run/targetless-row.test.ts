import { test, expect } from 'vitest';
import { HonestyCheck } from '../../src/run/honesty-check.js';
import type { Act } from '../../src/contract/vocabulary.js';
import { BOOKING_SURFACE, fact, testEngine } from '../fixtures/compiled-agents.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';

// A tool that declares no target is asked by its arguments alone. A report row naming a
// target none of this turn's calls of that tool carried claims a question nobody put to the
// surface: the engine drops the row on the spot, on the record, and checks the rest of the
// reply as written.

const SURFACE = { tools: { ...BOOKING_SURFACE.tools,
  listBookings: fact({ name: 'listBookings', effect: 'read', does: 'Lists the bookings of this workspace.',
    schema: { type: 'object', properties: { status: { type: 'string' } }, required: [] } }) } };

const ran = (tool: string, args: Record<string, string>): Act => ({ id: `a_${tool}`, turn: 1, origin: 'model',
  call: { tool, args, key: `${tool}:${JSON.stringify(args)}` }, effect: 'read', said: 'yes', status: 'done',
  reason: null, evidence: 'executor', sentence: `${tool}() — done`, owed: null, result: { bookings: [] },
  questionId: null, guard: null });

test('the rows a report cannot carry name a target no call of that tool carried', () => {
  const check = new HonestyCheck(SURFACE);
  const acts = [ran('listBookings', { status: 'out' })];
  expect(check.impossibleRows([
    { tool: 'listBookings', target: 'ws_4402', word: 'refused' },
    { tool: 'listBookings', target: 'out', word: 'done' },
    { tool: 'listBookings', target: '', word: 'done' },
    { tool: 'cancelBooking', target: 'bk_9', word: 'done' }
  ], acts)).toEqual([{ tool: 'listBookings', target: 'ws_4402', word: 'refused' }]);
  expect(check.impossibleRows([{ tool: 'listBookings', target: 'ws_4402', word: 'refused' }], [])).toEqual([]);
});

test('a reply carrying an impossible row is delivered on the first try, the row dropped on the record', async () => {
  const model = payingDesk([
    callStep('listBookings', {}),
    finishStep('Only this workspace\'s records are readable here; nothing reaches ws_4402.',
      [{ tool: 'listBookings', target: 'ws_4402', word: 'refused' }])
  ]);
  const { engine } = testEngine({ model, guards: [], facts: SURFACE,
    behaviors: { listBookings: () => ({ result: { bookings: [] }, done: 'yes' }) } });

  const r = await engine.chat('s1', 'pull up the bookings of ws_4402');

  expect(r.closedBy).toBe('model');
  expect(r.delivery.by).toBe('prose');
  expect(r.text).toContain('Only this workspace');
  expect(r.corrections).toContainEqual({ kind: 'rowDropped', tool: 'listBookings', target: 'ws_4402' });
  expect(r.corrections.some(c => c.kind === 'redrive')).toBe(false);
});
