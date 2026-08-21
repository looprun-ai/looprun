/** The surface read from a world FILE. A plain node process cannot import a subject's world, and
 *  the acts, their effects and their targets are still owed before anything can be written
 *  against them. Every derived field here belongs to the engine — this proves the reader hands
 *  the card over rather than deriving a second answer of its own. */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { factsFromSource } from '../src/world-source.js';

function worldFile(body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'world-')), 'world.ts');
  writeFileSync(path, `import { world } from '@looprun-ai/core';\nexport const w = world(${body});\n`);
  return path;
}

describe('factsFromSource', () => {
  test('the block an act sits in is the effect it carries, and the form gives it its target', () => {
    const facts = factsFromSource(worldFile(`{
      records: { bookings: {} },
      reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up one booking' } },
      writes: { logNote: { form: 'make', entity: 'notes', label: 'Write a note' } },
      destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'cancel a booking' } }
    }`));
    expect(Object.keys(facts.tools).sort()).toEqual(['cancelBooking', 'getBooking', 'logNote']);
    expect(facts.tools.getBooking.effect).toBe('read');
    expect(facts.tools.cancelBooking.effect).toBe('destructive');
    // `get` and `remove` act on one row and take its id; `make` names no row yet.
    expect(facts.tools.getBooking.target).toBe('id');
    expect(facts.tools.logNote.target).toBe(null);
  });

  test('a ceiling named in limits is a number, and names no act', () => {
    const facts = factsFromSource(worldFile(`{
      records: {},
      reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up one booking' } },
      limits: { destructive: 1 }
    }`));
    expect(Object.keys(facts.tools)).toEqual(['getBooking']);
  });

  test('an act whose entry the file computes is not on the surface this reads', () => {
    const facts = factsFromSource(worldFile(`{
      records: {},
      reads: { getBooking: entryFor('getBooking') },
      destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'cancel a booking' } }
    }`));
    expect(Object.keys(facts.tools)).toEqual(['cancelBooking']);
  });
});
