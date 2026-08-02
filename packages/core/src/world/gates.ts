/**
 * Transition gates (spec #8) — the closed, minimal gate language.
 *
 * A gate returns its `error` string when it BLOCKS, or `null` when it passes. Gates read only the
 * received args and the seed store — never user text. `fieldAtLeast` supports `{ref}` into a seed
 * field; `exists` and `stateIs` are the siblings the toy/asset domains need. Grow deliberately.
 */
import type { Gate } from './types.js';

export type RecordStore = Record<string, Record<string, Record<string, unknown>>>;

/** Resolve `{ref: 'entity.field'}` against a target record chosen by `args[entity+'Id']`. */
function resolveMin(min: number | { ref: string }, args: Record<string, unknown>, store: RecordStore): number {
  if (typeof min === 'number') return min;
  const [entity, field] = min.ref.split('.');
  const targetId = args[`${entity}Id`];
  const rec = store[entity]?.[String(targetId)];
  const val = rec?.[field];
  return typeof val === 'number' ? val : 0;
}

export function evaluateGates(gates: readonly Gate[] | undefined, args: Record<string, unknown>, store: RecordStore): string | null {
  for (const gate of gates ?? []) {
    const err = evaluateGate(gate, args, store);
    if (err) return err;
  }
  return null;
}

function evaluateGate(gate: Gate, args: Record<string, unknown>, store: RecordStore): string | null {
  switch (gate.kind) {
    case 'fieldAtLeast': {
      const raw = args[gate.field];
      const have = typeof raw === 'number' ? raw : Number(raw);
      const min = resolveMin(gate.min, args, store);
      return Number.isFinite(have) && have >= min ? null : gate.error;
    }
    case 'exists': {
      const want = String(args[gate.argRef]);
      const records = store[gate.entity] ?? {};
      const found = Object.values(records).some((r) => String(r[gate.matchField]) === want);
      return found ? null : gate.error;
    }
    case 'stateIs': {
      const id = String(args[gate.argRef]);
      const rec = store[gate.entity]?.[id];
      return rec && rec.status === gate.state ? null : gate.error;
    }
  }
}
