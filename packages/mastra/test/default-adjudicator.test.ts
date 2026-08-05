/**
 * THE DEFAULT ADJUDICATOR — the isolated same-model call behind every bound rubric.
 *
 * It settles. A refused endpoint, a spent quota, an empty answer and an unreadable one all come back
 * as no violation, because a call that failed to reach a verdict found nothing — and a deny drives a
 * redrive that ends in the engine's closure replacing the model's answer. The non-run is recorded under
 * one of two distinct names, so an outage, a shrug and a clean session are never mistaken for each
 * other: `adjudicator-unreachable` for a call that threw, rejected, or answered empty;
 * `adjudicator-unreadable` for a call that answered something the rubric could not parse as a verdict.
 */
import { describe, expect, it } from 'vitest';
import { defaultAdjudicator, ADJUDICATOR_UNREACHABLE, ADJUDICATOR_UNREADABLE, JUDGE_INSTRUCTIONS } from '../src/judge.js';
import type { GuardCtx } from '@looprun-ai/core';

const ctx = (over: Partial<GuardCtx> = {}): GuardCtx => ({
  args: {},
  world: { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] },
  observed: [],
  turnIndex: 0,
  userText: '',
  history: [],
  reply: 'Done.',
  notes: [],
  ...over,
});

describe('the answer path', () => {
  it('relays a named violation as the deny reason', async () => {
    const gen = async () => ({ text: 'VIOLATION: the reply claims a refund the ledger does not show' });
    const verdict = await defaultAdjudicator(gen, {})('q?', ctx());
    expect(verdict).toEqual({ violation: 'the reply claims a refund the ledger does not show' });
  });

  it('reads NONE as allow', async () => {
    const gen = async () => ({ text: 'NONE' });
    expect(await defaultAdjudicator(gen, {})('q?', ctx())).toEqual({ violation: null });
  });

  it('runs the call ISOLATED — the judge instructions, no tools, one step', async () => {
    let seen: Record<string, unknown> = {};
    const gen = async (_p: string, opts: Record<string, unknown>) => { seen = opts; return { text: 'NONE' }; };
    await defaultAdjudicator(gen, { temperature: 0 })('q?', ctx());
    expect(seen.instructions).toBe(JUDGE_INSTRUCTIONS);
    expect(seen.activeTools).toEqual([]);
    expect(seen.toolChoice).toBe('none');
    expect(seen.temperature).toBe(0);
  });

  it('puts the rubric in the prompt and fences the reply as data', async () => {
    let prompt = '';
    const gen = async (p: string) => { prompt = p; return { text: 'NONE' }; };
    await defaultAdjudicator(gen, {})('does it overstate?', ctx({ reply: 'all set' }));
    expect(prompt).toContain('does it overstate?');
    expect(prompt).toMatch(/<<<\nall set\n>>>/);
  });

  it('renders a domain outcome word into the LEDGER only when the caller supplies renderOpts', async () => {
    const did = [{ op: 'cancel', target: 'Dentist 2026-03-03', outcome: 'cancelado' }];
    const c = ctx({ reply: 'I cancelled your dentist appointment.', did });

    let withoutOpts = '';
    await defaultAdjudicator(async (p) => { withoutOpts = p; return { text: 'NONE' }; }, {})('q?', c);
    expect(withoutOpts).toContain('No operation was carried out on this turn.');
    expect(withoutOpts).not.toContain('Dentist 2026-03-03');

    let withOpts = '';
    await defaultAdjudicator(async (p) => { withOpts = p; return { text: 'NONE' }; }, {}, {
      outcomes: { cancelado: 'success' },
    })('q?', c);
    expect(withOpts).toContain('Dentist 2026-03-03: done');
  });
});

describe('a failure is never a verdict', () => {
  it('a THROWN call returns null and records the non-run as UNREACHABLE', async () => {
    const c = ctx();
    const gen = async () => { throw new Error('offline'); };
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
    expect(c.notes).toContain(ADJUDICATOR_UNREACHABLE);
    expect(c.notes).not.toContain(ADJUDICATOR_UNREADABLE);
  });

  it('a REJECTED call returns null and records the non-run as UNREACHABLE', async () => {
    const c = ctx();
    const gen = () => Promise.reject(new Error('quota'));
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
    expect(c.notes).toContain(ADJUDICATOR_UNREACHABLE);
    expect(c.notes).not.toContain(ADJUDICATOR_UNREADABLE);
  });

  it('an EMPTY answer returns null and records the non-run as UNREACHABLE', async () => {
    const c = ctx();
    const gen = async () => ({ text: '' });
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
    expect(c.notes).toContain(ADJUDICATOR_UNREACHABLE);
    expect(c.notes).not.toContain(ADJUDICATOR_UNREADABLE);
  });

  it('an UNREADABLE answer returns null and records the non-run as UNREADABLE, not UNREACHABLE', async () => {
    const c = ctx();
    const gen = async () => ({ text: 'hmm, possibly' });
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
    expect(c.notes).toContain(ADJUDICATOR_UNREADABLE);
    expect(c.notes).not.toContain(ADJUDICATOR_UNREACHABLE);
  });

  it('a VIOLATION line with no reason after it returns null and records UNREADABLE — malformed, not a deny', async () => {
    const c = ctx();
    const gen = async () => ({ text: 'VIOLATION:' });
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
    expect(c.notes).toContain(ADJUDICATOR_UNREADABLE);
    expect(c.notes).not.toContain(ADJUDICATOR_UNREACHABLE);
  });

  it('the two non-run markers are never both recorded for the same call', async () => {
    const unreachable = ctx();
    await defaultAdjudicator(async () => { throw new Error('offline'); }, {})('q?', unreachable);
    expect(unreachable.notes).toEqual([ADJUDICATOR_UNREACHABLE]);

    const unreadable = ctx();
    await defaultAdjudicator(async () => ({ text: 'hmm, possibly' }), {})('q?', unreadable);
    expect(unreadable.notes).toEqual([ADJUDICATOR_UNREADABLE]);
  });

  it('it NEVER rejects, so no failMode can fire from it', async () => {
    const gen = async () => { throw new Error('offline'); };
    await expect(defaultAdjudicator(gen, {})('q?', ctx())).resolves.toEqual({ violation: null });
  });

  it('a ctx with no notes array does not break the call', async () => {
    const gen = async () => { throw new Error('offline'); };
    const c = ctx(); delete (c as { notes?: string[] }).notes;
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
  });
});
