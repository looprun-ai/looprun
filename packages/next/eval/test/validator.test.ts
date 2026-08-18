import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { world } from '@looprun-ai/next-core';
import { SubjectLoader, type Subject } from '../src/subject-loader.js';
import { Validator } from '../src/validator.js';

const MINI = join(fileURLToPath(import.meta.url), '../fixtures/mini-subject');

async function mini(): Promise<Subject> {
  return SubjectLoader.load(MINI);
}

test('the mini subject validates clean — zero findings, zero spend', async () => {
  const report = new Validator().run(await mini());
  expect(report.findings).toEqual([]);
});

test('a spec naming an off-surface tool blocks', async () => {
  const subject = await mini();
  const planted: Subject = { ...subject,
    specs: { concierge: { ...subject.specs.concierge, tools: ['getBooking', 'ghost'] } } };
  const codes = new Validator().run(planted).findings.map(f => f.code);
  expect(codes).toContain('SPEC_TOOL_UNKNOWN');
});

test('an approve turn on a tool nothing holds blocks', async () => {
  const subject = await mini();
  const planted: Subject = { ...subject, cases: [{
    id: 'bad-approve', split: 'fix',
    turns: ['look it up', { approve: { tool: 'getBooking' } }],
    rubric: 'r' }] };
  const codes = new Validator().run(planted).findings.map(f => f.code);
  expect(codes).toContain('CASE_APPROVE_NOT_HELD');
});

test('a preset whose patch names a missing record blocks with the world law', async () => {
  const subject = await mini();
  const card = 'card' in subject.world ? subject.world.card : null;
  const planted: Subject = { ...subject,
    world: world({ ...card ?? { records: {} }, presets: {
      broken: [{ entity: 'bookings', id: 'ghost', set: { status: 'X' } }] } }),
    presets: [undefined, 'broken'] };
  const findings = new Validator().run(planted).findings;
  expect(findings.some(f => f.sentence.includes("'broken'"))).toBe(true);
});

test('an underivable disclosure slot blocks through the compile', async () => {
  const subject = await mini();
  const planted: Subject = { ...subject,
    contract: { name: 'minihotel',
      disclosure: { cancelBooking: {
        needs: { booking: { tool: 'getBooking', args: { nonexistent: 'id' } } },
        before: 'Cancelling {booking.day}.' } } } };
  const findings = new Validator().run(planted).findings;
  expect(findings.length).toBeGreaterThan(0);
});
