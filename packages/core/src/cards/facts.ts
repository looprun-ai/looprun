/** The engine-internal surface truth, re-exported for the compile layer. The shapes
 *  are declared in the contract leaf — one home per shape; this module is the door
 *  the cards layer reads them through, and the ONE derivation that keeps every
 *  surface kind on a single fact truth. */
import type { DeclaredWorld, Json, LiveWorldCard, McpWorldCard, RemoteToolEntry,
              SurfaceFacts, ToolFact, WorldToolEntry, Effect } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';

export type { SurfaceFacts, ToolFact } from '../contract/vocabulary.js';

const EMPTY_SCHEMA: Json = { type: 'object', properties: {}, required: [] };

function formSchema(entry: WorldToolEntry): Json {
  const properties: Record<string, Json> = {};
  const required: string[] = [];
  if (entry.form === 'get' || entry.form === 'remove' || entry.form === 'run' || entry.form === 'set') {
    properties.id = { type: 'string' };
    required.push('id');
  }
  if (entry.form === 'set') {
    properties.set = { type: 'object' };
    required.push('set');
  }
  if (entry.form === 'make') {
    properties.fields = { type: 'object' };
    required.push('fields');
  }
  if (entry.simulation === true) properties.simulate = { type: 'boolean' };
  return { type: 'object', properties, required };
}

function declaredFact(name: string, entry: WorldToolEntry, effect: Effect): ToolFact {
  const targeted = entry.form === 'get' || entry.form === 'set'
                || entry.form === 'remove' || entry.form === 'run';
  return {
    name,
    label: entry.label,
    does: entry.does ?? `${entry.label} (${entry.form} on ${entry.entity}).`,
    effect,
    target: entry.target ?? (targeted && entry.schema === undefined ? 'id' : null),
    entity: entry.entity,
    schema: entry.schema ?? formSchema(entry),
    simulation: entry.simulation === true ? { arg: 'simulate', value: true } : null,
    destructiveWhen: entry.when ?? null,
    proxy: null
  };
}

function remoteFact(name: string, entry: RemoteToolEntry, effect: Effect): ToolFact {
  return {
    name,
    label: entry.label,
    does: entry.does ?? `${entry.label}.`,
    effect,
    target: entry.target ?? null,
    entity: null,
    schema: entry.schema ?? EMPTY_SCHEMA,
    simulation: entry.simulation === true ? { arg: 'simulate', value: true } : null,
    destructiveWhen: entry.when ?? null,
    proxy: entry.proxy ?? null
  };
}

/** Derives the engine-internal SurfaceFacts from any of the three card kinds. */
export function factsFromWorld(w: DeclaredWorld | McpWorldCard | LiveWorldCard): SurfaceFacts {
  const tools: Record<string, ToolFact> = {};
  if ('card' in w) {
    const blocks: readonly (readonly [Readonly<Record<string, WorldToolEntry>> | undefined, Effect])[] =
      [[w.card.reads, 'read'], [w.card.writes, 'write'], [w.card.destructive, 'destructive']];
    for (const [block, effect] of blocks) {
      for (const [name, entry] of Object.entries(block ?? {})) tools[name] = declaredFact(name, entry, effect);
    }
  } else {
    const blocks: readonly (readonly [Readonly<Record<string, RemoteToolEntry>> | undefined, Effect])[] =
      [[w.reads, 'read'], [w.writes, 'write'], [w.destructive, 'destructive']];
    for (const [block, effect] of blocks) {
      for (const [name, entry] of Object.entries(block ?? {})) tools[name] = remoteFact(name, entry, effect);
    }
  }
  // A declared note means NOTHING rides the tail for free: the note carries
  // sentences, never records, so the grounding floor sees no visible entities
  // unless the card also names them.
  const tail = 'card' in w ? w.card.tail ?? (w.card.note ? [] : null) : null;
  return deepFreeze({ tools, tail, note: 'card' in w ? w.card.note ?? null : null });
}
