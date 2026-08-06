/**
 * RECEPTION of args (spec #1) — the 27 hand entries, provided once.
 *
 * Coerce `'true'`/`'false'` → boolean and numeric strings → number per the tool declaration; treat an
 * absent optional as `undefined` (the sentinel) rather than crashing; fail fast on a missing REQUIRED
 * arg (the only hard boundary — a tool call is external input). Returns a coerced VIEW used for
 * gate/create logic; the raw args are what the action history records.
 */
import type { ArgDecl } from './types.js';

export function receive(tool: string, decls: readonly ArgDecl[] | undefined, raw: Record<string, unknown>): Record<string, unknown> {
  if (!decls) return { ...raw };
  const out: Record<string, unknown> = {};
  for (const d of decls) {
    const present = Object.prototype.hasOwnProperty.call(raw, d.name) && raw[d.name] !== undefined && raw[d.name] !== null;
    if (!present) {
      if (!d.optional) throw new Error(`RECEPTION: ${tool} missing required arg '${d.name}'`);
      out[d.name] = undefined; // sentinel — absent optional
      continue;
    }
    out[d.name] = coerce(tool, d, raw[d.name]);
  }
  return out;
}

function coerce(tool: string, d: ArgDecl, value: unknown): unknown {
  if (d.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`RECEPTION: ${tool} arg '${d.name}' expected boolean, got ${JSON.stringify(value)}`);
  }
  if (d.type === 'number') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
    throw new Error(`RECEPTION: ${tool} arg '${d.name}' expected number, got ${JSON.stringify(value)}`);
  }
  // string
  return typeof value === 'string' ? value : String(value);
}
