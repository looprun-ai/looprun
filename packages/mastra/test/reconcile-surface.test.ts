/** The native surface reconciliation: gen/tools.json must describe THIS host. */
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { reconcileNativeSurface, schemaProjection } from '../src/reconcile-surface.js';

const fileSchema = {
  type: 'object',
  properties: { bookingId: { type: 'string', description: 'the booking id' } },
  required: ['bookingId'],
};

describe('schemaProjection', () => {
  test('prose-level keys never enter the projection', () => {
    const bare = { type: 'object', properties: { bookingId: { type: 'string' } }, required: ['bookingId'] };
    expect(schemaProjection(fileSchema)).toEqual(schemaProjection(bare));
  });
});

describe('reconcileNativeSurface', () => {
  const live = { cancelBooking: { inputSchema: z.object({ bookingId: z.string() }) } };
  test('a file that describes the host passes', () => {
    expect(() =>
      reconcileNativeSurface([{ name: 'cancelBooking', inputSchema: fileSchema }], live, ['cancelBooking'], 'a'),
    ).not.toThrow();
  });
  test('a name the file declares and the host lacks throws', () => {
    expect(() =>
      reconcileNativeSurface(
        [{ name: 'cancelBooking', inputSchema: fileSchema }, { name: 'issueRefund' }],
        live,
        ['cancelBooking'],
        'a',
      ),
    ).toThrow(/issueRefund/);
  });
  test('a live schema that gained a field throws', () => {
    const drifted = { cancelBooking: { inputSchema: z.object({ bookingId: z.string(), force: z.boolean() }) } };
    expect(() =>
      reconcileNativeSurface([{ name: 'cancelBooking', inputSchema: fileSchema }], drifted, ['cancelBooking'], 'a'),
    ).toThrow(/cancelBooking/);
  });
});
