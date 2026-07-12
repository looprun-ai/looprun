/** The EXPERIMENTAL micro-loop driver's PURE, domain-neutral helpers (renderer / assembly / scrub). */
import { describe, expect, it } from 'vitest';
import {
  renderStructuredReply,
  stripThinkBlocks,
  recordTerminalReply,
  assembleAnswerText,
  scrubSteeringEcho,
  commitFinalReply,
  STEERING_SENTINEL,
} from '../src/index.js';
import type { AgentWorld } from '../src/index.js';

describe('stripThinkBlocks', () => {
  it('removes a closed <think> block and trims a truncated leading one', () => {
    expect(stripThinkBlocks('a <think>reasoning</think> b')).toBe('a  b');
    // A truncated leading <think> (no close) has ONLY its opening tag trimmed — the text after it stands.
    expect(stripThinkBlocks('<think>cut off answer here')).toBe('cut off answer here');
    expect(stripThinkBlocks('')).toBe('');
  });
});

describe('renderStructuredReply — deterministic, domain-neutral', () => {
  it('joins intro, bullet items, question and caution in a stable order', () => {
    const out = renderStructuredReply({ kind: 'list', intro: 'Here:', items: ['one', 'two'], caution: 'Careful.' });
    expect(out).toBe('Here:\n\n- one\n- two\n\nCareful.');
  });
  it('caps items at 8 and strips think leakage from every field', () => {
    const items = Array.from({ length: 12 }, (_, i) => `i${i}`);
    const out = renderStructuredReply({ kind: 'list', intro: '<think>x</think>Go', items });
    expect(out.startsWith('Go')).toBe(true);
    expect(out.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(8);
  });
  it('renders empty input to the empty string', () => {
    expect(renderStructuredReply({ kind: 'answer' })).toBe('');
  });
  it('is deterministic (same input → same output)', () => {
    const a = { kind: 'answer', intro: 'Hi', question: 'OK?' };
    expect(renderStructuredReply(a)).toBe(renderStructuredReply(a));
  });
});

describe('recordTerminalReply — last non-blank wins, never concatenates', () => {
  it('keeps current on a blank next; replaces on a non-blank next', () => {
    expect(recordTerminalReply('first', '   ')).toBe('first');
    expect(recordTerminalReply('first', 'second')).toBe('second');
  });
});

describe('assembleAnswerText', () => {
  it('prefers the tripwire reason, then the terminal reply, then last text', () => {
    expect(assembleAnswerText({ tripwire: true, tripwireReason: 'blocked', terminalReply: 't', lastText: 'l' })).toBe('blocked');
    expect(assembleAnswerText({ tripwire: false, tripwireReason: '', terminalReply: 't', lastText: 'l' })).toBe('t');
    expect(assembleAnswerText({ tripwire: false, tripwireReason: '', terminalReply: '', lastText: 'l' })).toBe('l');
    expect(assembleAnswerText({ tripwire: false, tripwireReason: '', terminalReply: '', lastText: '' })).toBe('');
  });
});

describe('scrubSteeringEcho', () => {
  it('drops a line carrying the steering sentinel', () => {
    expect(scrubSteeringEcho(`Real answer.\n${STEERING_SENTINEL} close now`)).toBe('Real answer.');
  });
  it('drops a fenced block that narrates the replyStructured schema', () => {
    const echoed = 'Here you go.\n```json\n{ "kind": "answer", "intro": "x" }\n```';
    expect(scrubSteeringEcho(echoed)).toBe('Here you go.');
  });
  it('keeps a legitimate fenced code block (no "kind:" field)', () => {
    const code = 'Run this:\n```sh\nnpm test\n```';
    expect(scrubSteeringEcho(code)).toBe(code);
  });
});

describe('commitFinalReply — single world commit', () => {
  it('routes exactly one replyToUser exec for a non-blank text, none for blank', async () => {
    const calls: Array<[string, unknown]> = [];
    const world = { exec: (n: string, a: unknown) => { calls.push([n, a]); return { success: true }; } } as unknown as AgentWorld;
    await commitFinalReply(world, 'The final reply.');
    await commitFinalReply(world, '   ');
    expect(calls).toEqual([['replyToUser', { text: 'The final reply.' }]]);
  });
});
