/** The two numbers the pipeline states as hard limits, measured on what the engine compiles. A
 *  desk carries at most fifteen acts — the lane the factory hands it, reads counted — and the tool
 *  cards behind that lane weigh at most twice its system prefix. Both are read off the compiled
 *  desk: the lane is the one the factory built, and the bytes are the ones PromptWriter sends. */
import { describe, expect, test } from 'vitest';
import { AgentFactory, factsFromWorld, PromptWriter, world } from '@looprun-ai/core';
import type { AgentSpec, DeclaredWorld } from '@looprun-ai/core';
import { cardWeight, laneWidth } from '../src/lints.js';

/** A surface of `acts` reads, each with a sentence of its own. */
const surfaceOf = (acts: number): DeclaredWorld => world({
  records: { orders: { ord_7: { status: 'OPEN' } } },
  reads: Object.fromEntries(Array.from({ length: acts }, (_, at) => [`getOrder${at}`,
    { form: 'get' as const, entity: 'orders', label: `Look up order ${at}`,
      does: 'Look up one order.' }]))
});

/** One read whose sentence is exactly `bytes` long: the card weight is written to order. */
const oneActOf = (bytes: number): DeclaredWorld => world({
  records: { orders: { ord_7: { status: 'OPEN' } } },
  reads: { getOrder: { form: 'get', entity: 'orders', label: 'Look up an order',
                       does: 'o'.repeat(bytes) } }
});

const ordersDesk: AgentSpec = { name: 'ordersDesk', persona: 'You are the orders desk.' };

/** The prefix this desk renders. It is built from the desk and the business it shares, never from
 *  the world, so the world below can be written against a number measured once. */
const PREFIX_BYTES = new PromptWriter(
  new AgentFactory().governed(ordersDesk, undefined, factsFromWorld(surfaceOf(1)))).system().length;

describe('laneWidth', () => {
  test('a desk given sixteen acts is one finding, naming the desk and the count', () => {
    const found = laneWidth({ specs: { ordersDesk }, contract: undefined, world: surfaceOf(16) });
    expect(found.map(f => f.code)).toEqual(['LANE_TOO_WIDE']);
    expect(found[0].sentence).toContain("'ordersDesk'");
    expect(found[0].sentence).toContain('16');
    expect(found[0].sentence).toContain('15');
  });

  test('fifteen acts is the ceiling, not the finding', () => {
    expect(laneWidth({ specs: { ordersDesk }, contract: undefined, world: surfaceOf(15) }))
      .toEqual([]);
  });

  test('the lane is the desk\'s own, never the surface it was cut from', () => {
    const narrow: AgentSpec = { ...ordersDesk,
      tools: Array.from({ length: 15 }, (_, at) => `getOrder${at}`) };
    expect(laneWidth({ specs: { narrow }, contract: undefined, world: surfaceOf(20) })).toEqual([]);
  });
});

describe('cardWeight', () => {
  test('cards over twice the prefix are one finding, naming both byte counts', () => {
    const over = PREFIX_BYTES * 2 + 1;
    const found = cardWeight({ specs: { ordersDesk }, contract: undefined,
                               world: oneActOf(over) });
    expect(found.map(f => f.code)).toEqual(['CARD_OVER_WEIGHT']);
    expect(found[0].sentence).toContain("'ordersDesk'");
    expect(found[0].sentence).toContain(String(over));
    expect(found[0].sentence).toContain(String(PREFIX_BYTES));
  });

  test('twice the prefix is the ceiling, not the finding', () => {
    expect(cardWeight({ specs: { ordersDesk }, contract: undefined,
                        world: oneActOf(PREFIX_BYTES * 2) })).toEqual([]);
  });
});
