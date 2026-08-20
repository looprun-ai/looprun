import { test, expect, afterAll } from 'vitest';
import { connect } from '../src/mcp-connect.js';
import { startMcpFixture, type McpFixture } from './fixtures/mcp-fixture.js';

let fixture: McpFixture | null = null;
afterAll(async () => { await fixture?.close(); });

test('connect lists the served tools and a call round-trips over the real wire', async () => {
  fixture = await startMcpFixture();
  const live = await connect({ url: fixture.url, headers: { 'x-api-key': 'k1' } });

  expect(Object.keys(live).sort()).toEqual(['cancelBooking', 'getBooking']);
  expect(live.getBooking.description).toContain('Reads one booking');
  expect(JSON.stringify(live.getBooking.schema)).toContain('"id"');

  const result = await live.getBooking.execute({ id: 'bk_9' });
  expect(result).toMatchObject({ id: 'bk_9', status: 'CONFIRMED' });

  expect(fixture.seenHeaders.some(h => h.apiKey === 'k1')).toBe(true);
});

test('a tool-level MCP error surfaces as an isError result, never a throw', async () => {
  fixture = fixture ?? await startMcpFixture();
  const live = await connect({ url: fixture.url });
  const result = await live.cancelBooking.execute({ id: 'bk_denied' });
  expect(result).toMatchObject({ isError: true });
  expect(JSON.stringify(result)).toContain('refused');
});
