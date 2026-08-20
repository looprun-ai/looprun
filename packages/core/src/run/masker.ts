/** Sensitive data at every seam: declared field names and dotted paths masked
 *  structurally on results, recorded args and stored acts — masking runs once, on
 *  record, so history, honesty, disclosure, delivery, the prompt state and the wire
 *  read safe data by construction; the executor alone receives real args. Prose
 *  scrub replaces ONLY the exact literal values collected while masking — never a
 *  shape guess: a look-alike value survives unless it IS a masked value. */
import type { Json, StateSnapshot } from '../contract/vocabulary.js';
import { isJson } from '../contract/canonical-call.js';
import type { MaskKey } from '../cards/cards.js';

function pathEndsWith(path: readonly string[], declared: readonly string[]): boolean {
  if (declared.length > path.length) return false;
  const offset = path.length - declared.length;
  return declared.every((segment, i) => path[offset + i] === segment);
}

function isRecord(v: Json): v is { readonly [k: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArr(v: Json): v is readonly Json[] {
  return Array.isArray(v);
}

export class Masker {
  private readonly keys: readonly MaskKey[];
  private readonly collected = new Set<string>();

  constructor(keys: readonly MaskKey[]) {
    this.keys = keys;
  }

  maskData(value: unknown): Json {
    return this.walk(isJson(value) ? value : null, []);
  }

  /** The prompt-state seam: the model is not the executor, so it reads masked state. */
  maskState(state: StateSnapshot): StateSnapshot {
    return this.maskData(state) as StateSnapshot;
  }

  maskProse(text: string): string {
    let out = text;
    for (const literal of this.collected) out = out.split(literal).join('****');
    return out;
  }

  private walk(value: Json, path: readonly string[]): Json {
    if (isArr(value)) return value.map(v => this.walk(v, path));
    if (isRecord(value)) {
      const out: Record<string, Json> = {};
      for (const [key, v] of Object.entries(value)) {
        const here = [...path, key];
        const hit = this.keys.find(mk => pathEndsWith(here, mk.path));
        if (hit === undefined) { out[key] = this.walk(v, here); continue; }
        this.collect(v);
        if (hit.mode === 'mask') out[key] = '****';
      }
      return out;
    }
    return value;
  }

  private collect(value: Json): void {
    if (typeof value === 'string' && value !== '') this.collected.add(value);
    if (typeof value === 'number') this.collected.add(String(value));
  }
}
