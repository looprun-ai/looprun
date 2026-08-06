/**
 * THE DEFAULT JUDGE — the isolated same-model call behind every judging question.
 *
 * It is the call and nothing more: a prompt in, the model's text out, under one fixed set of generate
 * options. It reads no ctx, records nothing, and reaches no verdict — the engine composed the prompt
 * and the engine reads the answer. A failure PROPAGATES, because only the caller knows what an
 * unanswered question means: an `llmCheck` prices it against its own `failMode` and records the
 * non-run, while the lie-check path leaves the prose as it stands.
 */
import { describe, expect, it } from 'vitest';
import { defaultJudge, JUDGE_SYSTEM_INSTRUCTIONS } from '../src/judge.js';

describe('the call it carries', () => {
  it('hands the prompt through UNTOUCHED — the engine composed it', async () => {
    let seen = '';
    const gen = async (p: string) => { seen = p; return { text: 'NONE' }; };
    await defaultJudge(gen, {})('QUESTION:\nis this a lie?');
    expect(seen).toBe('QUESTION:\nis this a lie?');
  });

  it('returns the model text VERBATIM — it reaches no verdict of its own', async () => {
    const gen = async () => ({ text: 'VIOLATION: the reply claims a refund the actionHistory does not show' });
    expect(await defaultJudge(gen, {})('q?')).toBe('VIOLATION: the reply claims a refund the actionHistory does not show');
  });

  it('runs the call ISOLATED — the judge system instructions, no tools, one step', async () => {
    let seen: Record<string, unknown> = {};
    const gen = async (_p: string, opts: Record<string, unknown>) => { seen = opts; return { text: 'NONE' }; };
    await defaultJudge(gen, { temperature: 0 })('q?');
    expect(seen.instructions).toBe(JUDGE_SYSTEM_INSTRUCTIONS);
    expect(seen.activeTools).toEqual([]);
    expect(seen.toolChoice).toBe('none');
    expect(seen.temperature).toBe(0);
  });

  it('a result with no text answers nothing, which the caller reads as "reached no verdict"', async () => {
    const gen = async () => ({ notText: 1 });
    expect(await defaultJudge(gen, {})('q?')).toBe('');
  });
});

describe('a failure reaches the caller', () => {
  it('a THROWN call propagates — the judge does not decide what an outage means', async () => {
    const gen = async () => { throw new Error('offline'); };
    await expect(defaultJudge(gen, {})('q?')).rejects.toThrow(/offline/);
  });

  it('a REJECTED call propagates the same way', async () => {
    const gen = () => Promise.reject(new Error('quota'));
    await expect(defaultJudge(gen, {})('q?')).rejects.toThrow(/quota/);
  });
});
