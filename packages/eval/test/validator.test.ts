import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { world } from '@looprun-ai/core';
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

test('a route whose length differs from the case\'s turn count blocks', async () => {
  const subject = await mini();
  const planted: Subject = { ...subject, cases: [{
    id: 'bad-route-length', split: 'fix',
    turns: ['is bk_9 confirmed?', 'thanks'],
    route: ['concierge'],
    rubric: 'r' }] };
  const codes = new Validator().run(planted).findings.map(f => f.code);
  expect(codes).toContain('CASE_ROUTE_LENGTH_MISMATCH');
});

test('a route naming a desk no spec declares blocks — plain or inside a defensible set', async () => {
  const subject = await mini();
  const planted: Subject = { ...subject, cases: [{
    id: 'bad-route-desk', split: 'fix',
    turns: ['is bk_9 confirmed?'],
    route: [['concierge', 'ghost-desk']],
    rubric: 'r' }] };
  const codes = new Validator().run(planted).findings.map(f => f.code);
  expect(codes).toContain('CASE_ROUTE_DESK_UNKNOWN');
});

test('route \'none\' is always a legal desk name', async () => {
  const subject = await mini();
  const planted: Subject = { ...subject, cases: [{
    id: 'route-none-ok', split: 'fix', turns: ['hello'], route: ['none'], rubric: 'r' }] };
  const codes = new Validator().run(planted).findings.map(f => f.code);
  expect(codes).not.toContain('CASE_ROUTE_DESK_UNKNOWN');
});

/** A house whose second desk is the only one that can cancel — the shape a routed
 *  approve is judged against. */
function twoDesks(subject: Subject): Subject {
  return { ...subject, specs: {
    front: { name: 'front', persona: 'You greet.', tools: ['getBooking'],
             summary: 'booking lookups' },
    back: { name: 'back', persona: 'You cancel.', tools: ['getBooking', 'cancelBooking'],
            summary: 'cancellations' } } };
}

test('a routed approve is judged against every desk, not the first spec alone', async () => {
  const planted: Subject = { ...twoDesks(await mini()), cases: [{
    id: 'routed-approve', split: 'fix',
    turns: ['cancel bk_9', { approve: { tool: 'cancelBooking' } }],
    route: ['back', 'back'],
    rubric: 'r' }] };
  const codes = new Validator().run(planted).findings.map(f => f.code);
  expect(codes).not.toContain('CASE_APPROVE_NOT_HELD');
});

test('a routed approve on a tool no desk in the house holds still blocks', async () => {
  const subject = twoDesks(await mini());
  const planted: Subject = { ...subject, specs: {
    ...subject.specs,
    back: { ...subject.specs.back, tools: ['getBooking'] } },
    cases: [{ id: 'routed-approve-nowhere', split: 'fix',
      turns: ['cancel bk_9', { approve: { tool: 'cancelBooking' } }],
      route: ['back', 'back'],
      rubric: 'r' }] };
  const findings = new Validator().run(planted).findings;
  expect(findings.map(f => f.code)).toContain('CASE_APPROVE_NOT_HELD');
  expect(findings.find(f => f.code === 'CASE_APPROVE_NOT_HELD')?.sentence)
    .toContain('no desk of the house');
});

test('a case naming both a desk and a route blocks', async () => {
  const planted: Subject = { ...twoDesks(await mini()), cases: [{
    id: 'pinned-and-routed', split: 'fix',
    turns: ['is bk_9 confirmed?'],
    agent: 'back', route: ['back'],
    rubric: 'r' }] };
  const findings = new Validator().run(planted).findings;
  expect(findings.map(f => f.code)).toContain('CASE_PINNED_AND_ROUTED');
  expect(findings.find(f => f.code === 'CASE_PINNED_AND_ROUTED')?.sentence)
    .toContain("Case 'pinned-and-routed' names desk 'back' and a route");
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
