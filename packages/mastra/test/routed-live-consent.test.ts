import { expect, it } from 'vitest';
import { liveWorld } from '@looprun-ai/core';
import type { LiveTool } from '@looprun-ai/core';
import { LoopRunAgent } from '../src/index.js';

const schema = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false };
const world = liveWorld({ host: 'test-host',
  reads: { getThing: { label: 'read a thing', schema } },
  destructive: { dropThing: { label: 'drop a thing', target: 'id', schema } } });
const dropped: unknown[] = [];
const live: Record<string, LiveTool> = {
  getThing: { name: 'getThing', description: 'reads', schema, execute: async (a) => ({ id: a.id, size: 3 }) },
  dropThing: { name: 'dropThing', description: 'drops', schema, attests: true,
    execute: async (a) => { dropped.push(a); return { ok: true }; } }
};
const dropper = { name: 'dropper', persona: 'You drop things.', tools: ['getThing', 'dropThing'] };
const finish = (message: string, report: { tool: string; target: string; word: string }[] = []) =>
  ({ calls: [{ tool: 'finish', args: { message, report, facts: [] } }], text: '' });

it('a destructive act on a live surface is held before the live tool runs, and runs on the code', async () => {
  const scripted = { scripted: { steps: [
    { calls: [{ tool: 'dropThing', args: { id: 'x' } }], text: '' },
    ...Array.from({ length: 6 }, () => finish('Held for your approval.', [{ tool: 'dropThing', target: 'x', word: 'held' }])),
    ...Array.from({ length: 6 }, () => finish('Dropped x.', [{ tool: 'dropThing', target: 'x', word: 'done' }])) ] } };
  const desk = new LoopRunAgent({ spec: dropper, model: scripted, world, live });
  await desk.settle();
  const first = await desk.generate('drop thing x', { session: 's1' });
  const open = desk.openQuestions('s1');
  expect(dropped).toEqual([]);
  expect(first.loopRun.acts.map(a => [a.call.tool, a.status])).toEqual([['dropThing', 'not-done']]);
  expect(open.length).toBe(1);
  const second = await desk.generate(open[0].code, { session: 's1' });
  expect(dropped).toEqual([{ id: 'x' }]);
  expect(second.loopRun.acts.map(a => [a.call.tool, a.status])).toEqual([['dropThing', 'done']]);
});
