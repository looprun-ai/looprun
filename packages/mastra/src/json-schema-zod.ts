/**
 * @looprun-ai/mastra — JSON Schema → Zod (shallow; sufficient for Mastra createTool inputSchema).
 *
 * ── THE KEYWORD CONTRACT (decided at MI-T5 — this list is the whole of it) ────────────────────────
 *
 * | keyword                                | carried | why |
 * |----------------------------------------|---------|-----|
 * | `type`, `properties`, `items`, `required`, `enum` | ✅ | the shape a call must have |
 * | `description` (EVERY node, nested included)       | ✅ | the CONTRACT IN WORDS — see below |
 * | `minLength`, `minItems`                           | ✅ | "this may not be EMPTY" |
 * | `pattern`, `format`                               | ❌ | the guard layer owns format (`argFormat`) |
 * | `maxLength`, `maxItems`, `minimum`, `maximum`     | ❌ | bounds are a `precondition`/`custom` judgment |
 * | `default`, `uniqueItems`, `$ref`, `oneOf`/`anyOf` | ❌ | not expressible here; no in-repo consumer |
 *
 * WHY `description` IS NON-NEGOTIABLE. The `respond` contract is not just a shape: its field
 * descriptions ARE the protocol — the intention vocabulary, the `inform` guardrail ("MUST NOT assert
 * a performed action"), the honest-outcome list, all authored in `core/runtime/terminal.ts`. A
 * converter that kept only types shipped the model an unexplained `{op,target,outcome,amount}` and
 * left the forcing function to the tool description alone.
 *
 * WHY THE VALIDATION KEYWORDS STOP AT "NOT EMPTY". A constraint carried here is enforced LOCALLY by
 * zod before the tool executes, and that rejection is an UNGOVERNED failure path: no guard fires, no
 * governance-tagged deny prose reaches the model, no recovery event lands in the ledger. Format and
 * range are exactly the judgments the governed layer is built to make — `argFormat` is the pattern
 * kind, and the tutorial's scheduler declares the SAME date-time pattern in its tool def AND in an
 * `argFormat` guard on purpose: the guard is what denies, legibly and on the record. Emptiness is the
 * one case that is not a domain judgment — an empty required argument, or a `did` with no intention,
 * is a malformed call the runtime has nothing to reason about — so the two minima are carried and
 * their rejection is accepted. For `did: []` that rejection is deterministic and bounded (forced
 * terminal → engine closure, pinned in `test/proofs/terminal-audit.test.ts`).
 *
 * THE FLOOR IS STILL THE ENGINE'S. `minLength` on `message` cannot decide emptiness (a zero-width
 * message satisfies it), so `finalizeReply`'s blank-delivery floor remains the guarantee.
 *
 * EVAL COMPARABILITY: carrying `description` changed the model-facing tool-schema bytes of EVERY
 * subject — see the run-comparability note in `docs/benchmarks.md` §3.
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
