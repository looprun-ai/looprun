/**
 * @looprun-ai/eval — the `world.json` schema (zod) + loader (increment 3b).
 *
 * THE SIBLING OF `norms-config.ts`, one layer down: a generated subject stops emitting a hand-written
 * `gen/world.ts` and ships `gen/world.json` — the SAME declarative {@link WorldSpec} shape 3a's
 * `defineWorld` interprets, now serialized. This loader parses that JSON under a closed, `.strict()`
 * zod schema and returns `defineWorld`'s factory. Two properties hold by construction:
 *
 *   1. NO field accepts a regex or a free function. Every object is `.strict()`, and a pre-scan names
 *      any `pattern`/`regex`/`re`/`fn`/`function` key BEFORE zod runs. The ONE string a world carries —
 *      a `derived` formula — is not a pattern: it is the CLOSED arithmetic grammar of `formula.ts`,
 *      compiled (and identifier-checked) at LOAD by `defineWorld`, so a bad formula throws here too.
 *   2. The `custom` executors are HOST-REGISTERED options (`opts.custom`), NEVER in the JSON — the
 *      quarantine law. The JSON only NAMES a custom tool's executor; the function is supplied by the host.
 */
import { z } from 'zod';
import { defineWorld } from '@looprun-ai/core/internal';
import type { AgentWorld } from '@looprun-ai/core';
import type { CustomExecutor, WorldSpec } from '@looprun-ai/core/internal';

/** A config violation, with a path-qualified message. Thrown by {@link loadWorldConfig}. */
export class WorldConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldConfigError';
  }
}

// ── Field / entity vocabulary ─────────────────────────────────────────────────────────────────────

const fieldTypeSchema = z.union([
  z.enum(['string', 'number', 'boolean', 'money']),
  z.object({ enum: z.array(z.string()).min(1) }).strict(),
]);

const entitySchema = z
  .object({
    idPrefix: z.string(),
    states: z.array(z.string()).optional(),
    terminal: z.array(z.string()).optional(),
    fields: z.record(z.string(), fieldTypeSchema).optional(),
  })
  .strict();

const argSchema = z
  .object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean']),
    optional: z.boolean().optional(),
    operator: z.boolean().optional(),
  })
  .strict();

// ── The closed gate language (mirror of core's `Gate`) — discriminated on `kind`, each `.strict()` ──

const minSchema = z.union([z.number(), z.object({ ref: z.string() }).strict()]);

const gateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fieldAtLeast'), entity: z.string().optional(), field: z.string(), min: minSchema, error: z.string() }).strict(),
  z.object({ kind: z.literal('exists'), entity: z.string(), matchField: z.string(), argRef: z.string(), error: z.string() }).strict(),
  z.object({ kind: z.literal('stateIs'), entity: z.string(), argRef: z.string(), state: z.string(), error: z.string() }).strict(),
  z.object({ kind: z.literal('absent'), entity: z.string(), matchField: z.string(), argRef: z.string(), error: z.string() }).strict(),
]);

// ── Result envelope shapes ─────────────────────────────────────────────────────────────────────────

const readResultSchema = z
  .object({
    collection: z.object({ key: z.string(), value: z.unknown() }).strict().optional(),
    find: z
      .object({ key: z.string(), entity: z.string(), byField: z.string(), argRef: z.string(), returns: z.array(z.string()).optional() })
      .strict()
      .optional(),
    constant: z.object({ key: z.string(), value: z.unknown() }).strict().optional(),
  })
  .strict();

const createResultSchema = z
  .object({
    entity: z.string(),
    id: z.union([z.literal('counter'), z.object({ fixed: z.string() }).strict()]),
    idKey: z.string(),
    store: z.array(z.string()).optional(),
  })
  .strict();

const transitionResultSchema = z
  .object({ entity: z.string(), argRef: z.string(), to: z.string(), idKey: z.string().optional() })
  .strict();

const toolSchema = z
  .object({
    kind: z.enum(['read', 'write', 'transition', 'custom']),
    args: z.array(argSchema).optional(),
    twoStep: z.boolean().optional(),
    gates: z.array(gateSchema).optional(),
    read: readResultSchema.optional(),
    create: createResultSchema.optional(),
    transition: transitionResultSchema.optional(),
    entity: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    custom: z.string().optional(),
  })
  .strict();

// ── Derived / presets / seed ────────────────────────────────────────────────────────────────────────

const derivedSchema = z.object({ formula: z.string(), inputs: z.array(z.string()).optional() }).strict();

const presetDeltaSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('addRecord'), entity: z.string(), record: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ op: z.literal('setCounter'), entity: z.string(), value: z.number() }).strict(),
  z.object({ op: z.literal('patch'), entity: z.string(), id: z.string(), set: z.record(z.string(), z.unknown()) }).strict(),
]);

const worldConfigSchema = z
  .object({
    clock: z.string(),
    entities: z.record(z.string(), entitySchema).optional(),
    tools: z.record(z.string(), toolSchema),
    derived: z.record(z.string(), derivedSchema).optional(),
    presets: z.record(z.string(), z.array(presetDeltaSchema)),
    seed: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional(),
  })
  .strict();

/** The validated shape of a `gen/world.json` (structurally the 3a {@link WorldSpec}). */
export type WorldConfig = z.infer<typeof worldConfigSchema>;

// ── The regex/free-function ban, made structural (belt AND braces with `.strict()`) ─────────────────

const BANNED_KEY = /^(pattern|regex|re|fn|func|function|predicate)$/i;

function scanBannedKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanBannedKeys(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (BANNED_KEY.test(k)) {
        throw new WorldConfigError(
          `regex/free-function is not supported: config carries a '${k}' key at ${path ? `${path}.${k}` : k} — ` +
            'a world keys on structure (gates, states, fields) and one CLOSED derived formula, never a pattern or function.',
        );
      }
      scanBannedKeys(v, path ? `${path}.${k}` : k);
    }
  }
}

/** Host wiring the JSON may only NAME: the quarantined `custom` executors (never authored in the JSON). */
export interface WorldConfigDeps {
  custom?: Record<string, CustomExecutor>;
}

/**
 * Load a `gen/world.json` value into a world factory. Throws {@link WorldConfigError} with a
 * path-qualified message on any violation — a banned key, an unknown key, a malformed gate, or (via
 * `defineWorld`) a `derived` formula that does not compile or names an unknown identifier — all at LOAD.
 */
export function loadWorldConfig(json: unknown, deps: WorldConfigDeps = {}): (preset?: string) => AgentWorld {
  scanBannedKeys(json, '');
  const parsed = worldConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new WorldConfigError(`world config invalid at ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  try {
    // The parsed shape IS the WorldSpec; `defineWorld` runs the remaining LOAD-time checks (default
    // preset, custom wiring, derived-formula compilation) and throws named on any of them.
    return defineWorld(parsed.data as WorldSpec, deps.custom ? { custom: deps.custom } : {});
  } catch (e) {
    throw new WorldConfigError(`world config: ${(e as Error).message}`);
  }
}
