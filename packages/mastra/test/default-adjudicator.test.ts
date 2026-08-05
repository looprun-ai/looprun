/**
 * THE DEFAULT ADJUDICATOR — the isolated same-model call behind every bound rubric.
 *
 * It settles. A refused endpoint, a spent quota, an empty answer and an unreadable one all come back
 * as no violation, because a call that failed found nothing — and a deny drives a redrive that ends in
 * the engine's closure replacing the model's answer. The non-run is recorded so an outage is never
 * mistaken for a clean session.
 */
import { describe, expect, it } from 'vitest';
import { defaultAdjudicator, ADJUDICATOR_UNREACHABLE, JUDGE_INSTRUCTIONS } from '../src/judge.js';
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
});

describe('a failure is never a verdict', () => {
  it('a THROWN call returns null and records the non-run', async () => {
    const c = ctx();
    const gen = async () => { throw new Error('offline'); };
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
    expect(c.notes).toContain(ADJUDICATOR_UNREACHABLE);
  });

  it('a REJECTED call returns null and records the non-run', async () => {
    const c = ctx();
    const gen = () => Promise.reject(new Error('quota'));
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
    expect(c.notes).toContain(ADJUDICATOR_UNREACHABLE);
  });

  it('an EMPTY answer returns null and records the non-run', async () => {
    const c = ctx();
    const gen = async () => ({ text: '' });
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
    expect(c.notes).toContain(ADJUDICATOR_UNREACHABLE);
  });

  it('an UNREADABLE answer returns null WITHOUT recording — the call answered, it just found nothing', async () => {
    const c = ctx();
    const gen = async () => ({ text: 'hmm, possibly' });
    expect(await defaultAdjudicator(gen, {})('q?', c)).toEqual({ violation: null });
    expect(c.notes).not.toContain(ADJUDICATOR_UNREACHABLE);
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
