/**
 * THE SIMULATABLE SET — the declared schema decides a destructive tool's consent route: a
 * destructive tool whose schema carries `simulate` is downgradable; every other one is gated on
 * every call and its veto raises the approval question.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../src/spec.js';

const spec = new AgentSpecBase({
  id: 's', mode: 'm', persona: 'p',
  tools: ['cancelBooking', 'unsubscribeCustomer', 'getBooking'],
  destructiveTools: ['cancelBooking', 'unsubscribeCustomer'],
});

const toolDefs = [
  { name: 'cancelBooking', inputSchema: { properties: { bookingId: {}, simulate: { type: 'boolean' } } } },
  { name: 'unsubscribeCustomer', inputSchema: { properties: { customerId: {} } } },
  { name: 'getBooking', inputSchema: { properties: { bookingId: {}, simulate: { type: 'boolean' } } } },
];

describe('simulatableToolNames — the declared schema decides the route', () => {
  it('contains the destructive tool whose schema declares simulate', () => {
    expect(spec.simulatableToolNames(toolDefs).has('cancelBooking')).toBe(true);
  });
  it('excludes the destructive tool whose schema does not', () => {
    expect(spec.simulatableToolNames(toolDefs).has('unsubscribeCustomer')).toBe(false);
  });
  it('excludes a non-destructive tool even when its schema declares simulate', () => {
    expect(spec.simulatableToolNames(toolDefs).has('getBooking')).toBe(false);
  });
  it('returns the empty set when no toolDefs are known', () => {
    expect(spec.simulatableToolNames([]).size).toBe(0);
  });
});
