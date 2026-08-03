/**
 * @looprun-ai/mastra — JSON Schema → Zod (shallow; sufficient for Mastra createTool inputSchema).
 *
 * WHAT MUST SURVIVE THE CONVERSION (MI-T5). The `respond` contract is not just a shape: its field
 * DESCRIPTIONS are the protocol itself — the intention vocabulary, the `inform` guardrail ("MUST NOT
 * assert a performed action"), and the honest-outcome list live in `terminal.ts`'s schema. A converter
 * that kept only types shipped the model an unexplained `{op,target,outcome,amount}` and left the
 * forcing function to the tool description alone. `description`, `minLength` and `minItems` are
 * therefore carried through — the model reads the same contract the runtime authored.
 *
 * ENFORCEMENT IS STILL THE ENGINE'S. A schema constraint the provider honors is a hint, not a
 * guarantee: `did` cardinality is re-checked by `validateClaims` (recording `claims-invalid:<n>`) and a
 * blank delivery is caught by the engine's blank floor, which also strips zero-width characters a
 * `minLength` can never see.
 */
import { z } from 'zod';

/** Attach the JSON-schema `description` to a zod node, when the source declared one. */
function described(schema: z.ZodTypeAny, def: Record<string, unknown>): z.ZodTypeAny {
  const d = def.description;
  return typeof d === 'string' && d.trim() ? schema.describe(d) : schema;
}

export function jsonTypeToZod(def: Record<string, unknown>): z.ZodTypeAny {
  return described(baseType(def), def);
}

function baseType(def: Record<string, unknown>): z.ZodTypeAny {
  const type = def.type as string | undefined;
  if (def.enum) return z.enum(def.enum as [string, ...string[]]);
  if (type === 'string') {
    const s = z.string();
    return typeof def.minLength === 'number' ? s.min(def.minLength) : s;
  }
  if (type === 'number' || type === 'integer') return z.number();
  if (type === 'boolean') return z.boolean();
  if (type === 'array') {
    const items = def.items as Record<string, unknown> | undefined;
    const a = z.array(items ? jsonTypeToZod(items) : z.unknown());
    return typeof def.minItems === 'number' ? a.min(def.minItems) : a;
  }
  if (type === 'object') return objectType(def);
  return z.unknown();
}

function objectType(def: Record<string, unknown>): z.ZodTypeAny {
  const props = (def.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (def.required ?? []) as string[];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [k, v] of Object.entries(props)) shape[k] = required.includes(k) ? jsonTypeToZod(v) : jsonTypeToZod(v).optional();
  return z.object(shape).passthrough();
}

export function jsonSchemaToZodObject(schema: Record<string, unknown>): z.ZodTypeAny {
  return objectType(schema);
}
