/** THE one call identity: sorted-key deep canonical form over typed, coerced REAL
 *  values (masking happens on record, not here — the licence must execute); array
 *  values stay order-significant. Every duplicate check, licence match, question
 *  dedupe and record lookup routes through it. */
import type { CanonicalCallData, Json, ToolFact } from './vocabulary.js';
import { deepFreeze } from './freeze.js';

function field(value: Json | undefined, key: string): Json | undefined {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return (value as { readonly [k: string]: Json })[key];
}

export function isJson(value: unknown): value is Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isJson);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every(isJson);
  return false;
}

/** Coerce one raw value against its declared scalar type; undefined = not coercible. */
function coerce(value: unknown, declaredType: Json | undefined): Json | undefined {
  switch (declaredType) {
    case 'string':
      return typeof value === 'string' ? value : undefined;
    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
      return undefined;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    }
    case 'array':
      return Array.isArray(value) && isJson(value) ? value : undefined;
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value) && isJson(value)
        ? value : undefined;
    default:
      return undefined;
  }
}

/** Canonical JSON: object keys deep-sorted, arrays order-significant. */
export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as { readonly [k: string]: Json };
  const parts = Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(',')}}`;
}

export class CanonicalCall {
  readonly tool: string;
  readonly args: Readonly<Record<string, Json>>;     // coerced, key-order-free — the executable form
  readonly key: string;                              // sorted-key canonical form of { tool, args }

  private constructor(tool: string, args: Readonly<Record<string, Json>>) {
    this.tool = tool;
    this.args = args;
    this.key = canonicalJson({ args, tool });
    deepFreeze(this);
  }

  /** Rejects non-coercible values loudly, naming the arg. */
  static of(tool: string, raw: Readonly<Record<string, unknown>>, decl: ToolFact):
    CanonicalCall | { readonly badArg: string } {
    const properties = field(decl.schema, 'properties');
    const args: Record<string, Json> = {};
    for (const [name, value] of Object.entries(raw)) {
      const declared = field(field(properties, name), 'type');
      if (declared === undefined) return { badArg: name };
      const coerced = coerce(value, declared);
      if (coerced === undefined) return { badArg: name };
      args[name] = coerced;
    }
    return new CanonicalCall(tool, args);
  }

  /** The masked record/display form. */
  data(masker: (v: unknown) => Json): CanonicalCallData {
    const masked: Record<string, Json> = {};
    for (const [name, value] of Object.entries(this.args)) masked[name] = masker(value);
    return deepFreeze({ tool: this.tool, args: masked, key: this.key });
  }

  equals(other: CanonicalCall): boolean {
    return this.key === other.key;
  }
}
