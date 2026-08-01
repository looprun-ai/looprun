/**
 * @looprun-ai/eval — the `norms/<agent>.json` schema + loader.
 *
 * THE AUTHORING SURFACE WHERE HAND-WRITTEN REGEXES BECOME STRUCTURALLY IMPOSSIBLE. A generated
 * bundle used to install guards through free TypeScript (`custom()` + hand regexes); this loader
 * turns a guard into DATA — a small closed catalog of `kind`s, each carrying only NAMES (tools,
 * reads, args) and PROSE. Two properties are enforced by construction:
 *
 *   1. NO field accepts a regex, a string pattern, or a free predicate. Every object is `.strict()`,
 *      so any `pattern`/`regex`/`re` key fails loudly (and a pre-scan names the offending path even
 *      before zod runs). This is the run's rule C made structural.
 *   2. Guard prose lives ON the guard entry (`precondition.prose`, `uncheckable[].prose`) — never
 *      displaced into `behavior` (the run's finding A). `behavior[]` is style/voice residue ONLY.
 *
 * `precondition`'s `predicate` is a CLOSED expression language over world structure
 * (`count|limit|field` refs + `lt/lte/eq/neq/in/absent` ops), compiled to a world predicate at LOAD
 * time — or a `{ ref }` into the host-supplied, trusted `deps.predicates`. Unknown refs throw at
 * load, not run.
 */
import { z } from 'zod';
import { AgentSpecBase, askedEarlier, confirmedNeedsEarlierProbe, precondition, requiresBefore } from '@looprun-ai/core';
import type { AgentSpec, AgentWorld, Guard, GuardCtx } from '@looprun-ai/core';

/** A config violation, with a path-qualified message. Thrown by {@link loadNormsConfig}. */
export class NormsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormsConfigError';
  }
}

// ── The closed expression language (world/args STRUCTURE only — never string matching) ───────────

const refSchema = z.union([
  z.object({ count: z.string() }).strict(),
  z.object({ limit: z.string() }).strict(),
  z.object({ field: z.string() }).strict(),
  z.object({ arg: z.string() }).strict(),
]);

const exprSchema = z
  .object({
    op: z.enum(['lt', 'lte', 'eq', 'neq', 'in', 'absent']),
    left: refSchema,
    right: refSchema.optional(),
  })
  .strict();

/** A precondition predicate: a closed expression, OR a NAME into `deps.predicates` (host-owned,
 *  trusted — the JSON never carries the function itself). */
const predicateSchema = z.union([z.object({ ref: z.string() }).strict(), exprSchema]);

// ── The guard catalog — a discriminated union on `kind`, every option `.strict()` ────────────────

const guardSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('requiresBefore'), id: z.string(), tool: z.string(), reads: z.array(z.string()).min(1) }).strict(),
  z.object({ kind: z.literal('consentToken'), id: z.string(), tools: z.array(z.string()).min(1) }).strict(),
  z.object({ kind: z.literal('askedEarlier'), id: z.string(), tool: z.string(), arg: z.string().optional() }).strict(),
  z
    .object({
      kind: z.literal('precondition'),
      id: z.string(),
      tool: z.string(),
      predicate: predicateSchema,
      // PROSE PLACEMENT LAW: precondition's own prose has no derivable default (its predicate is
      // opaque to the trunk renderer), so it is REQUIRED here — a proseless entry fails by name.
      prose: z.string(),
      reason: z.string().optional(),
    })
    .strict(),
]);

const uncheckableSchema = z.object({ ruleId: z.string(), prose: z.string() }).strict();

const scopeSchema = z
  .object({
    lane: z.string(),
    others: z.array(z.object({ label: z.string(), covers: z.string() }).strict()),
  })
  .strict();

const configSchema = z
  .object({
    id: z.string(),
    persona: z.string(),
    tools: z.array(z.string()),
    destructiveTools: z.array(z.string()).optional(),
    guards: z.array(guardSchema).optional(),
    uncheckable: z.array(uncheckableSchema).optional(),
    behavior: z.array(z.string()).optional(),
    scope: scopeSchema.optional(),
  })
  .strict();

/** The validated shape of a `norms/<agent>.json`. */
export type NormsConfig = z.infer<typeof configSchema>;

type GuardConfig = z.infer<typeof guardSchema>;
type Ref = z.infer<typeof refSchema>;
type Expr = z.infer<typeof exprSchema>;

// ── The regex ban, made structural (belt AND braces with `.strict()`) ────────────────────────────

const BANNED_KEY = /^(pattern|regex|re)$/i;

/** Depth-first scan for a pattern-like KEY anywhere in the raw config — a named error BEFORE zod, so
 *  the message says "regex/pattern is not supported" rather than a generic "unrecognized key". */
function scanBannedKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanBannedKeys(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (BANNED_KEY.test(k)) {
        throw new NormsConfigError(
          `regex/pattern is not supported: config carries a '${k}' key at ${path ? `${path}.${k}` : k} — ` +
            'guards key on structure (tools, reads, args), never on text patterns.',
        );
      }
      scanBannedKeys(v, path ? `${path}.${k}` : k);
    }
  }
}

// ── The precondition compiler: closed expression → world predicate (unknown refs throw at LOAD) ──

/** Resolve a ref against world structure. `count` yields a cardinality; `limit`/`field` yield the
 *  raw value. `arg` is rejected at compile time (a precondition sees only the world). */
function resolveRef(ref: Ref, world: AgentWorld): unknown {
  if ('count' in ref) {
    const v = world[ref.count];
    return Array.isArray(v) ? v.length : typeof v === 'number' ? v : Number(v);
  }
  if ('limit' in ref) return world[ref.limit];
  if ('field' in ref) return world[ref.field];
  // 'arg' — unreachable: compilePredicate rejects it at load.
  return undefined;
}

function assertNoArgRef(ref: Ref | undefined, where: string): void {
  if (ref && 'arg' in ref) {
    throw new NormsConfigError(
      `precondition ${where}: an 'arg' ref is not available to a precondition (it reads only the world). ` +
        'Use count/limit/field, or a named { ref } predicate in deps.predicates.',
    );
  }
}

function compileExpr(expr: Expr, id: string): (world: AgentWorld) => boolean {
  assertNoArgRef(expr.left, `"${id}".left`);
  assertNoArgRef(expr.right, `"${id}".right`);
  const { op, left, right } = expr;
  return (world: AgentWorld): boolean => {
    const l = resolveRef(left, world);
    const r = right ? resolveRef(right, world) : undefined;
    switch (op) {
      case 'lt':
        return Number(l) < Number(r);
      case 'lte':
        return Number(l) <= Number(r);
      case 'eq':
        return l === r;
      case 'neq':
        return l !== r;
      case 'in':
        return Array.isArray(r) && r.includes(l);
      case 'absent':
        return l === undefined || l === null || l === '';
    }
  };
}

function compilePredicate(
  g: Extract<GuardConfig, { kind: 'precondition' }>,
  deps: NormsDeps,
): (world: AgentWorld) => boolean {
  if ('ref' in g.predicate) {
    const fn = deps.predicates?.[g.predicate.ref];
    if (!fn) {
      throw new NormsConfigError(
        `precondition "${g.id}": predicate ref '${g.predicate.ref}' is not in deps.predicates — ` +
          'a named predicate must be supplied by the host at load time.',
      );
    }
    return fn;
  }
  return compileExpr(g.predicate, g.id);
}

// ── The 'true'-string coercion seam (loader-level wrapper) ───────────────────────────────────────

/**
 * NORMALIZE the confirm flag. The world's own `isConfirmed` convention treats `confirmed: 'true'`
 * (the string a JSON tool-call arg often arrives as) as confirmed; the structural
 * `confirmedNeedsEarlierProbe` keys on the strict boolean `true`. Rather than push the coercion into
 * the core primitive, the loader wraps the guard's `check`, promoting a string `'true'` to boolean
 * `true` in the ctx it delegates. Minimal seam, zero core change: the only site the string matters is
 * the trigger `ctx.args.confirmed === true` (probe MATCHING excludes the `confirmed` key, so observed
 * entries need no rewrite).
 */
function normalizeConfirmed(guard: Guard): Guard {
  return {
    kind: guard.kind,
    dim: guard.dim,
    ...(guard.meta ? { meta: guard.meta } : {}),
    check(ctx: GuardCtx) {
      if (ctx.args?.confirmed !== 'true') return guard.check(ctx);
      return guard.check({ ...ctx, args: { ...ctx.args, confirmed: true } });
    },
    prose: () => guard.prose(),
  };
}

// ── The loader ───────────────────────────────────────────────────────────────────────────────────

export interface NormsDeps {
  /** Host-owned, trusted world predicates a precondition may reference by NAME (never authored in the
   *  JSON, so no free function ever enters the config surface). */
  predicates?: Record<string, (world: AgentWorld) => boolean>;
}

function installGuard(spec: AgentSpecBase, g: GuardConfig, deps: NormsDeps): void {
  const id = `agent:${g.id}`;
  switch (g.kind) {
    case 'requiresBefore':
      spec.addGuard('preTool', [g.tool], requiresBefore(g.reads), { layer: 'agent', id });
      return;
    case 'consentToken':
      spec.addGuard('preTool', g.tools, normalizeConfirmed(confirmedNeedsEarlierProbe({ tools: g.tools })), { layer: 'agent', id });
      return;
    case 'askedEarlier':
      spec.addGuard('preTool', [g.tool], askedEarlier({ tool: g.tool, ...(g.arg ? { arg: g.arg } : {}) }), { layer: 'agent', id });
      return;
    case 'precondition': {
      const ok = compilePredicate(g, deps);
      spec.addGuard('preTool', [g.tool], precondition(ok, g.reason ?? g.prose, g.prose), { layer: 'agent', id });
      return;
    }
  }
}

/**
 * Load a `norms/<agent>.json` value into an {@link AgentSpec}. Throws {@link NormsConfigError} with a
 * path-qualified message on any violation — a regex/pattern key, an unknown key, missing prose, or an
 * unresolvable predicate ref (all at LOAD time).
 */
export function loadNormsConfig(json: unknown, deps: NormsDeps = {}): AgentSpec {
  scanBannedKeys(json, '');
  const parsed = configSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new NormsConfigError(`norms config invalid at ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  const cfg = parsed.data;
  const spec = new AgentSpecBase({
    id: cfg.id,
    mode: cfg.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_') || 'AGENT',
    persona: cfg.persona,
    tools: cfg.tools,
    ...(cfg.destructiveTools?.length ? { destructiveTools: cfg.destructiveTools } : {}),
    // behavior = style/voice residue; uncheckable prose is judge-layer rule prose folded in AFTER it.
    behavior: [...(cfg.behavior ?? []), ...(cfg.uncheckable ?? []).map((u) => u.prose)],
    ...(cfg.scope ? { scope: cfg.scope } : {}),
  });
  for (const g of cfg.guards ?? []) installGuard(spec, g, deps);
  return spec;
}
