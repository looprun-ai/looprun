import { test, expect } from 'vitest';
import type { Json, LiveTool, LiveWorldCard } from '@looprun-ai/core';
import { HostToolPort } from '../src/host-tool-port.js';

const CARD: LiveWorldCard = {
  host: 'crm',
  reads: {
    getGuest: { label: 'Look up the guest' },
    guestFile: { label: 'The whole guest file', proxy: { compose: ['getGuest', 'getStay'] } },
    getStay: { label: 'Look up the stay' },
    lookupBooking: { label: 'Look up the booking', proxy: 'crm_get_booking' }
  },
  writes: {
    noteGuest: { label: 'Write a note' },
    tagGuest: { label: 'Tag the guest' }
  },
  destructive: { purgeGuest: { label: 'Purge the guest', target: 'id' } }
};

function liveTool(name: string, execute: LiveTool['execute'], attests?: true): LiveTool {
  return { name, description: name, schema: { type: 'object' }, attests, execute };
}

function rig(over: Partial<Record<string, LiveTool>> = {}) {
  const live: Record<string, LiveTool> = {
    getGuest: liveTool('getGuest', () => Promise.resolve({ guest: 'g_1', tier: 'gold' })),
    getStay: liveTool('getStay', () => Promise.resolve({ stay: 'room 4' })),
    crm_get_booking: liveTool('crm_get_booking', () => Promise.resolve({ booking: 'bk_9' })),
    noteGuest: liveTool('noteGuest', () => Promise.resolve({ ok: true })),
    tagGuest: liveTool('tagGuest', () => Promise.resolve({ tagged: true }), true),
    purgeGuest: liveTool('purgeGuest', () => Promise.reject(new Error('socket closed'))),
    ...Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined)) as Record<string, LiveTool>
  };
  return new HostToolPort(CARD, live);
}

test('a clean read answers yes with the result', async () => {
  const a = await rig().call({ tool: 'getGuest', args: { id: 'g_1' } });
  expect(a).toMatchObject({ done: 'yes', result: { guest: 'g_1', tier: 'gold' } });
});

test('a clean write without protocol attestation answers unknown — never yes on its own', async () => {
  const a = await rig().call({ tool: 'noteGuest', args: { id: 'g_1', note: 'hi' } });
  expect(a.done).toBe('unknown');
});

test('a write whose tool attests effect answers yes', async () => {
  const a = await rig().call({ tool: 'tagGuest', args: { id: 'g_1' } });
  expect(a.done).toBe('yes');
});

test('a tool-level error result (MCP isError) answers no — the tool itself answered', async () => {
  const port = rig({ noteGuest: liveTool('noteGuest',
    () => Promise.resolve({ isError: true, content: 'validation failed' })) });
  const a = await port.call({ tool: 'noteGuest', args: {} });
  expect(a.done).toBe('no');
});

test('a read rejection answers no; a write rejection answers unknown — send fate unknowable', async () => {
  const failingRead = rig({ getGuest: liveTool('getGuest', () => Promise.reject(new Error('down'))) });
  expect((await failingRead.call({ tool: 'getGuest', args: {} })).done).toBe('no');
  expect((await rig().call({ tool: 'purgeGuest', args: { id: 'g_1' } })).done).toBe('unknown');
});

test('a rename proxy executes the real live tool', async () => {
  const a = await rig().call({ tool: 'lookupBooking', args: { id: 'bk_9' } });
  expect(a).toMatchObject({ done: 'yes', result: { booking: 'bk_9' } });
});

test('a compose proxy executes its declared reads and merges in order', async () => {
  const a = await rig().call({ tool: 'guestFile', args: { id: 'g_1' } });
  expect(a).toMatchObject({ done: 'yes',
    result: { guest: 'g_1', tier: 'gold', stay: 'room 4' } });
});

test('an unknown tool is an honest refusal, never a throw', async () => {
  const a = await rig().call({ tool: 'ghost', args: {} });
  expect(a.done).toBe('no');
  expect(JSON.stringify(a.result)).toContain('ghost');
});

test('a non-json tool result is normalized to json data', async () => {
  const port = rig({ getGuest: liveTool('getGuest', () => Promise.resolve(undefined)) });
  const a = await port.call({ tool: 'getGuest', args: {} });
  expect(a.done).toBe('yes');
  expect(a.result satisfies Json).toBeNull();
});
