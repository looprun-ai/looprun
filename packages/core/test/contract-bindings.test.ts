/**
 * CONTRACT GUARD BINDINGS — the contract declares tool guards once; each installing lane resolves the
 * named sets against its own surface at construction.
 */
import { describe, expect, test } from 'vitest';
import { AgentSpecBase, precondition, requiresBefore } from '../src/index.js';
import { resolveBindings } from '../src/spec.js';
import type { DomainContract } from '../src/index.js';

const contractWith = (guards: DomainContract['guards']): DomainContract => ({
  voice: 'v',
  stateBlock: () => '',
  coreInvariants: [],
  languageClause: 'English.',
  writeTools: ['cancelBooking', 'chargeDeposit', 'issueRefund', 'getQuoteWrite'],
  guards,
});

const lane = (contract: DomainContract, tools: string[], destructiveTools: string[] = []) =>
  new AgentSpecBase({ id: 'a', mode: 'm', persona: 'p', tools, destructiveTools, contract });

describe('contract guard bindings', () => {
  test('a named set expands to a plain string[] at install time (never a ToolTarget string)', () => {
    const c = contractWith([{ hook: 'preTool', target: 'writeTools', guard: precondition(() => true, 'frozen'), id: 'tool:writeGate' }]);
    const spec = lane(c, ['cancelBooking', 'getBooking']);
    const b = spec.guards.preTool.find((x) => x.id === 'tool:writeGate')!;
    expect(Array.isArray(b.target)).toBe(true);
    expect(b.target).toEqual(['cancelBooking']); // ∩ lane surface
  });
  test('an empty intersection installs nothing', () => {
    const c = contractWith([{ hook: 'preTool', target: 'writeTools', guard: precondition(() => true, 'frozen'), id: 'tool:writeGate' }]);
    const spec = lane(c, ['getBooking']);
    expect(spec.guards.preTool.some((x) => x.id === 'tool:writeGate')).toBe(false);
  });
  test('destructiveTools resolves from the INSTALLING lane', () => {
    const c = contractWith([{ hook: 'preTool', target: 'destructiveTools', guard: requiresBefore(['getAsset']), id: 'tool:readFirst' }]);
    const spec = lane(c, ['retireAsset', 'getAsset'], ['retireAsset']);
    const b = spec.guards.preTool.find((x) => x.id === 'tool:readFirst')!;
    expect(b.target).toEqual(['retireAsset']);
  });
  test('exempt names withdrawn from the set; a stray exempt throws', () => {
    const ok = contractWith([{ hook: 'preTool', target: 'writeTools', exempt: ['getQuoteWrite'], guard: precondition(() => true, 'frozen'), id: 'tool:writeGate' }]);
    expect(lane(ok, ['cancelBooking', 'getQuoteWrite']).guards.preTool.find((x) => x.id === 'tool:writeGate')!.target).toEqual(['cancelBooking']);
    const stray = contractWith([{ hook: 'preTool', target: 'writeTools', exempt: ['notAWrite'], guard: precondition(() => true, 'frozen'), id: 'tool:writeGate' }]);
    expect(() => lane(stray, ['cancelBooking'])).toThrow(/notAWrite/);
  });
  test('exempt with a literal target throws', () => {
    const c = contractWith([{ hook: 'preTool', target: ['cancelBooking'], exempt: ['cancelBooking'], guard: precondition(() => true, 'frozen'), id: 'tool:x' }]);
    expect(() => lane(c, ['cancelBooking'])).toThrow(/named set/);
  });
  test('contract bindings precede lane bindings within the agent tier', () => {
    const c = contractWith([{ hook: 'preTool', target: ['cancelBooking'], guard: requiresBefore(['getBooking']), id: 'tool:readFirst' }]);
    const spec = lane(c, ['cancelBooking', 'getBooking']);
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getQuote']), { id: 'agent:laneRule' });
    const order = resolveBindings(spec.guards.preTool, 'cancelBooking').map((b) => b.id);
    expect(order.indexOf('tool:readFirst')).toBeLessThan(order.indexOf('agent:laneRule'));
  });
});
