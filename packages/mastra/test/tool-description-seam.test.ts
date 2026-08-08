import { describe, expect, test } from 'vitest';
import { AgentSpecBase, requiresBefore } from '@looprun-ai/core';
import { TOOL_RULES_HEADING } from '@looprun-ai/core/internal';
import { buildWorldTools } from '../src/tools.js';

describe('buildWorldTools', () => {
  test('a domain tool is served with its composed description', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'm', persona: 'p', tools: ['cancelBooking', 'getBooking'] });
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getBooking'], { prose: 'read the booking first' }), { id: 'tool:readFirst' });
    const defs = [
      { name: 'cancelBooking', description: 'Cancel a booking.', inputSchema: { type: 'object', properties: {} } },
      { name: 'getBooking', description: 'Read a booking.', inputSchema: { type: 'object', properties: {} } },
    ];
    const session = { world: { exec: () => ({}) }, actionHistory: [] };
    const tools = buildWorldTools(defs as never, new Set(['cancelBooking', 'getBooking']), () => session as never, spec);
    expect(tools.cancelBooking.description).toContain(TOOL_RULES_HEADING);
    expect(tools.cancelBooking.description).toContain('- read the booking first');
    expect(tools.getBooking.description).toBe('Read a booking.');
  });
});
