import { test, expect } from 'vitest';
import { HonestyCheck } from '../../src/run/honesty-check.js';
import type { Act, ReplyCtx } from '../../src/contract/vocabulary.js';
import { BOOKING_SURFACE, fact } from '../fixtures/compiled-agents.js';

// A tool that takes no target answers this workspace and nothing else. A report row that
// names a target for it claims a question nobody can put to the surface: the row is refused
// by name, whatever word it carries, and the desk is told to drop it and answer in words.

const SURFACE = { tools: { ...BOOKING_SURFACE.tools,
  listBookings: fact({ name: 'listBookings', effect: 'read', does: 'Lists the bookings of this workspace.' }) } };

const ran = (tool: string): Act => ({ id: 'a1', turn: 1, origin: 'model',
  call: { tool, args: {}, key: `${tool}:{}` }, effect: 'read', said: 'yes', status: 'done',
  reason: null, evidence: 'executor', sentence: `${tool}() — done`, owed: null, result: { bookings: [] },
  questionId: null, guard: null });

const ctx = (report: ReplyCtx['report'], acts: readonly Act[]): ReplyCtx =>
  ({ message: 'Only this workspace is readable here.', report, userText: 'bookings of ws_4402?',
     turnActs: acts, pastActs: [] });

const check = new HonestyCheck(SURFACE);

test('a row naming a target for a targetless tool is refused, whatever its word', () => {
  for (const word of ['refused', 'no_tool_called', 'done'] as const) {
    const found = check.check(ctx([{ tool: 'listBookings', target: 'ws_4402', word }], [ran('listBookings')]));
    expect(found.map(v => v.detail).join(' ')).toContain("listBookings takes no target — it cannot be asked about 'ws_4402'");
  }
});

test('the same tool with no target named grounds as a read echo', () => {
  expect(check.check(ctx([{ tool: 'listBookings', target: '', word: 'done' }], [ran('listBookings')]))).toEqual([]);
});

test('an empty report over a read that ran is honest', () => {
  expect(check.check(ctx([], [ran('listBookings')]))).toEqual([]);
});
