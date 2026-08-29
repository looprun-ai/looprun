import { describe, expect, it } from 'vitest';
import { composeWindow, readDecision } from '../src/run/front-desk.js';

const cfg = {
  houseName: 'northgate-tool-hire',
  description: { counter: 'quotes and bookings', money: 'invoices and refunds' },
  currentDesk: null, lastExchange: null, returnedFrom: null,
  userText: 'Has the invoice been paid?'
};

describe('the front desk window', () => {
  it('is the spec text verbatim on an opening message', () => {
    const step = composeWindow(cfg);
    expect(step.system).toBe(
`You are the front desk at northgate-tool-hire. Your only job is to read the
conversation and route the operator's NEW message (the last one) to the desk
that will handle it. Route on what the operator intends, never on the words
they used.

Desks:
- counter: quotes and bookings
- money: invoices and refunds

The conversation is just opening.
When more than one desk could serve, pick the most likely. When the task takes
several desks in sequence, pick the desk that acts first. When no desk's
surface performs what is asked — anything outside the house's own records and
operations — the answer is none, however close a desk's territory sounds.`);
    expect(step.messages).toEqual([{ role: 'user', text: 'Has the invoice been paid?' }]);
    expect(step.forceFinish).toBe(true);
    expect(step.llmParams).toEqual({ temperature: 0 });
    expect(step.tools).toHaveLength(1);
    expect(step.tools[0].name).toBe('route');
    expect((step.tools[0].schema as { properties: { desk: { enum: string[] } } })
      .properties.desk.enum).toEqual(['counter', 'money', 'none']);
  });

  it('carries the current desk, the tail exchange and the returned line', () => {
    const step = composeWindow({ ...cfg, currentDesk: 'counter',
      lastExchange: { userText: 'Book it.', replyText: 'Booked bk_1.' },
      returnedFrom: { by: 'money', reason: 'pricing is the counter\'s work' } });
    expect(step.system).toContain(
      'The conversation so far sits at the counter desk. A message');
    expect(step.system).toContain(
      "money returned this message: pricing is the counter's work");
    expect(step.messages).toEqual([
      { role: 'user', text: 'Book it.' },
      { role: 'assistant', text: 'Booked bk_1.' },
      { role: 'user', text: 'Has the invoice been paid?' }]);
  });

  it('reads a decision only from the declared enum', () => {
    const stepOf = (args: unknown) =>
      ({ calls: [{ tool: 'route', args: args as Record<string, unknown> }], text: '' });
    expect(readDecision(stepOf({ desk: 'money' }), ['counter', 'money'])).toBe('money');
    expect(readDecision(stepOf({ desk: 'none' }), ['counter', 'money'])).toBe('none');
    expect(readDecision(stepOf({ desk: 'kitchen' }), ['counter', 'money'])).toBe(null);
    expect(readDecision({ calls: [], text: '' }, ['counter', 'money'])).toBe(null);
  });
});
