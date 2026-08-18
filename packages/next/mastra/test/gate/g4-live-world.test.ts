import { test, expect } from 'vitest';
import type { LiveTool, LiveWorldCard } from '@looprun-ai/next-core';
import { LoopRunAgent } from '../../src/loop-run-agent.js';
import { SPEC, callStep, finishStep } from '../fixtures/booking-world.js';

// G4 — a liveWorld card through the facade: the done law and the declared proxies,
// priced by the StatusClerk into the sealed record.
const ID_SCHEMA = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };
const NOTE_SCHEMA = { type: 'object',
  properties: { id: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'note'] };

const CARD: LiveWorldCard = {
  host: 'crm',
  reads: {
    // A compose proxy is a VIRTUAL read — the author declares its schema on the card.
    guestFile: { label: 'The whole guest file', schema: ID_SCHEMA,
                 proxy: { compose: ['getGuest', 'getStay'] } },
    getGuest: { label: 'Look up the guest' },
    getStay: { label: 'Look up the stay' }
  },
  writes: { noteGuest: { label: 'Write a note' } }
};

const liveTool = (name: string, schema: LiveTool['schema'],
                  execute: LiveTool['execute']): LiveTool =>
  ({ name, description: name, schema, execute });

const LIVE: Record<string, LiveTool> = {
  getGuest: liveTool('getGuest', ID_SCHEMA, () => Promise.resolve({ guest: 'g_1', tier: 'gold' })),
  getStay: liveTool('getStay', ID_SCHEMA, () => Promise.resolve({ stay: 'room 4' })),
  noteGuest: liveTool('noteGuest', NOTE_SCHEMA, () => Promise.resolve({ ok: true }))
};

test('G4 — compose proxy merges; a clean write is honestly unknown in the record', async () => {
  const agent = new LoopRunAgent({
    spec: SPEC, world: CARD, live: LIVE,
    model: { scripted: { steps: [
      callStep('guestFile', { id: 'g_1' }),
      callStep('noteGuest', { id: 'g_1', note: 'gold guest' }),
      finishStep('Noted.', [{ tool: 'noteGuest', target: 'g_1', word: 'unknown' }])
    ] } }
  });
  const out = await agent.generate('note that g_1 is gold', { session: 's1' });
  const [read, write] = out.loopRun.acts;
  expect(read).toMatchObject({ call: { tool: 'guestFile' }, status: 'done' });
  expect(JSON.stringify(read.result)).toContain('room 4');
  expect(JSON.stringify(read.result)).toContain('gold');
  expect(write.call.tool).toBe('noteGuest');
  expect(write.status).toBe('unknown');
});
