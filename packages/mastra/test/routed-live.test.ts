import { describe, expect, it } from 'vitest';
import { CardError, SurfaceGate, factsFromWorld, liveWorld } from '@looprun-ai/core';
import type { LiveTool } from '@looprun-ai/core';
import { LoopRunAgent, RoutedAgent, assemble, frontOfHouse } from '../src/index.js';

const schema = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false };
const world = liveWorld({ host: 'test-host',
  reads: { getThing: { label: 'read a thing', schema } },
  destructive: { dropThing: { label: 'drop a thing', target: 'id', schema } } });
const calls: string[] = [];
const live: Record<string, LiveTool> = {
  getThing: { name: 'getThing', description: 'reads', schema,
    execute: async (a) => { calls.push(`getThing:${String(a.id)}`); return { id: a.id, size: 3 }; } },
  dropThing: { name: 'dropThing', description: 'drops', schema, attests: true, execute: async () => ({ ok: true }) }
};
const drifted = { ...live, getThing: { ...live.getThing, schema: { ...schema, properties: { id: { type: 'number' } } } } };
const reader = { name: 'reader', persona: 'You read things.', tools: ['getThing'], description: 'read a thing', summary: 'reading' };
const dropper = { name: 'dropper', persona: 'You drop things.', tools: ['dropThing'], description: 'drop a thing', summary: 'dropping' };
const model = { scripted: { steps: [{ calls: [], text: 'ok' }] } };
const finish = (message: string, report: { tool: string; target: string; word: string }[] = []) =>
  ({ calls: [{ tool: 'finish', args: { message, report, facts: [] } }], text: '' });

describe('a house over the host\'s own tools', () => {
  it('seats two desks, exposes each by name, and exports the front of house', () => {
    const house = RoutedAgent.fromLiveSubject({ model, world, live, specs: { reader, dropper } });
    expect(house).toBeInstanceOf(RoutedAgent);
    expect((house as RoutedAgent).deskNames).toEqual(['reader', 'dropper']);
    expect((house as RoutedAgent).desk('reader')).toBeInstanceOf(LoopRunAgent);
    expect(() => (house as RoutedAgent).desk('nobody')).toThrow(/no desk named/);
    expect(frontOfHouse('h', ['reading']).tools).toEqual([]);
  });
  it('is the lone desk itself when the subject has one', () => {
    expect(RoutedAgent.fromLiveSubject({ model, world, live, specs: { reader } })).toBeInstanceOf(LoopRunAgent);
  });
  it('accepts the seal minted from the card alone, when the card carries every schema', async () => {
    const seal = new SurfaceGate().fingerprint(factsFromWorld(world));
    const { surface } = await assemble({ spec: reader, model, world, live, seal });
    expect(surface?.active).toEqual(['getThing', 'dropThing']);
  });
  it('refuses construction when the live schema drifts from the card', async () => {
    const failed = await assemble({ spec: reader, model, world, live: drifted }).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(CardError);
    expect((failed as CardError).problems.map(p => p.code)).toContain('SURFACE_DRIFT');
  });
  it('refuses a wrong seal', async () => {
    const failed = await assemble({ spec: reader, model, world, live, seal: 'deadbeef' }).catch((e: unknown) => e);
    expect((failed as CardError).problems.map(p => p.code)).toContain('SURFACE_SEAL_MISMATCH');
  });
  it('assembles the engine\'s own front of house over the live card', async () => {
    const { surface } = await assemble({ spec: frontOfHouse('h', ['reading']), model, world, live });
    expect(surface?.active.length).toBe(2);
  });
  it('settles every desk at the door, so a drifted surface is one caught error', async () => {
    const house = RoutedAgent.fromLiveSubject({ model, world, live: drifted, specs: { reader, dropper } });
    await expect(house.settle()).rejects.toThrow(/drifted/);
  });
  it('a pinned desk reads through the live tool and closes with the finish it owes', async () => {
    const scripted = { scripted: { steps: [
      { calls: [{ tool: 'getThing', args: { id: 'x' } }], text: '' },
      finish('Thing x has size 3.', [{ tool: 'getThing', target: 'x', word: 'done' }]),
      finish('Thing x has size 3.', [{ tool: 'getThing', target: 'x', word: 'done' }]),
      finish('Thing x has size 3.', [{ tool: 'getThing', target: 'x', word: 'done' }]) ] } };
    const desk = new LoopRunAgent({ spec: reader, model: scripted, world, live });
    await desk.settle();
    const out = await desk.generate('what size is thing x?', { session: 's1' });
    expect(calls).toContain('getThing:x');
    expect(out.loopRun.acts.map(a => a.call.tool)).toEqual(['getThing']);
    expect(out.text).toContain('size 3');
  });
});
