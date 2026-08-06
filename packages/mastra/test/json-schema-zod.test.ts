/**
 * THE KEYWORD CONTRACT of the JSON-Schema → zod conversion, pinned in BOTH directions.
 *
 * The converter decides what a model sees and what the backend enforces locally, so "which keywords
 * survive" cannot live in a comment alone: a later contributor adding `pattern` (or dropping
 * `description`) changes runtime behavior for every domain tool in every subject. The table in
 * `src/json-schema-zod.ts` is the contract; this file is its proof.
 *
 * CARRIED: type/enum/required/items · description (every node) · minLength · minItems.
 * NOT carried, deliberately: pattern/format (the `argFormat` GUARD owns format, and a zod rejection
 * is an ungoverned failure path — no guard event, no deny prose, no action history record) · maxLength /
 * maxItems / minimum / maximum (bounds are a precondition judgment) · default · uniqueItems.
 */
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { jsonSchemaToZodObject } from '../src/json-schema-zod.js';

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    noteId: { type: 'string', pattern: '^note_[0-9]+$', maxLength: 12, description: 'The note id.' },
    tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5, description: 'Lowercase tags to add.' },
    title: { type: 'string', minLength: 1 },
    priority: { type: 'number', minimum: 1, maximum: 5 },
  },
  required: ['noteId', 'tags'],
};

describe('json-schema → zod: what the CONVERTER carries', () => {
  const parsed = jsonSchemaToZodObject(SCHEMA);
  const ok = { noteId: 'note_1', tags: ['a'], title: 'x', priority: 3 };

  it('CARRIES the emptiness minima — they are enforced locally', () => {
    expect(parsed.safeParse({ ...ok, tags: [] }).success).toBe(false);
    expect(parsed.safeParse({ ...ok, title: '' }).success).toBe(false);
    expect(parsed.safeParse(ok).success).toBe(true);
  });

  it('does NOT carry format or bounds — those belong to the GUARD layer, not the tool boundary', () => {
    // A malformed id reaches the world/guards (argFormat denies it, on the record) instead of being
    // rejected here with no guard event and no deny prose.
    expect(parsed.safeParse({ ...ok, noteId: 'nope' }).success).toBe(true);
    expect(parsed.safeParse({ ...ok, noteId: 'note_123456789012345' }).success).toBe(true);
    expect(parsed.safeParse({ ...ok, tags: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(true);
    expect(parsed.safeParse({ ...ok, priority: 99 }).success).toBe(true);
  });

  it('CARRIES every description — this is what the model reads', () => {
    const shape = (parsed as z.ZodObject<z.ZodRawShape>).shape;
    expect(shape.noteId!.description).toBe('The note id.');
    expect(shape.tags!.description).toBe('Lowercase tags to add.');
    // An absent description stays absent — nothing is invented.
    expect(shape.title!.description).toBeUndefined();
  });
});
