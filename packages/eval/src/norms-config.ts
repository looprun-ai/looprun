/**
 * @looprun-ai/eval — the `norms/<agent>.json` schema + loader.
 *
 * THE AUTHORING SURFACE WHERE HAND-WRITTEN REGEXES BECOME STRUCTURALLY IMPOSSIBLE. A bundle that
 * installs guards through free TypeScript (`custom()` + hand regexes) can smuggle a text pattern into
 * any of them; this loader turns a guard into DATA — a small closed catalog of `kind`s, each carrying
 * only NAMES (tools, reads, args) and PROSE. Two properties are enforced by construction:
 *
 *   1. NO field accepts a regex, a string pattern, or a free predicate. Every object is `.strict()`,
 *      so any `pattern`/`regex`/`re` key fails loudly (and a pre-scan names the offending path even
 *      before zod runs).
 *   2. Guard prose lives ON the guard entry (`precondition.prose`, `uncheckable[].prose`) — never
 *      displaced into `behavior`. `behavior[]` is style/voice residue ONLY.
 *
 * `precondition`'s `predicate` is a CLOSED expression language over world structure
 * (`count|limit|field` refs + `lt/lte/eq/neq/in/absent` ops), compiled to a world predicate at LOAD
 * time — or a `{ ref }` into the host-supplied, trusted `deps.predicates`. Unknown refs throw at
 * load, not run.
 */
import { z } from 'zod';
import { AgentSpecBase, askedEarlier, claimCoversRubric, confirmFirst, didMessageConsistency, llmCheck, precondition, requiresBefore } from '@looprun-ai/core';
import type { AgentSpec, AgentWorld, CoreOutcome, Guard, GuardCtx, OutcomeMap } from '@looprun-ai/core';
import { assertNoCoreOutcomeShadow } from '@looprun-ai/core/internal';

/** The CORE, domain-neutral outcome vocabulary as a runtime tuple — the closed set a `did` claim may
 *  resolve to. Mirrors `CoreOutcome` (the `satisfies` guards it against drift); a domain outcome word
 *  maps to one of these through the spec-level `outcomes` block. */
const CORE_OUTCOME_VALUES = [
  'success',
  'failure',
  'not_found',
  'blocked',
  'refused',
  'pending_confirmation',
  'no_op',
] as const satisfies readonly CoreOutcome[];

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
      // The structured coverage rule: every `target` must appear in the turn's `did` with the
      // required `outcome` polarity ('any' accepts any RESOLVED outcome). Polarity is a FIELD, checked
      // over structure — never over the reply prose.
      kind: z.literal('claimCoversRubric'),
      id: z.string(),
      targets: z.array(z.string()).min(1),
      outcome: z.union([z.enum(CORE_OUTCOME_VALUES), z.literal('any')]),
      // The redrive PROSE the model reads when coverage fails — a followable coverage instruction ("account
      // for the record you were asked about"), never a world figure. Structured targets, not a text pattern,
      // are what the check keys on, so the no-regex ban is untouched.
      reason: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('precondition'),
      id: z.string(),
      tool: z.string(),
      predicate: predicateSchema,
      // PROSE PLACEMENT LAW: precondition's own prose has no derivable default (its predicate is
      // opaque to the trunk renderer), so it is REQUIRED here — a proseless entry fails by name.
      // NO `reason` field: the DENY POLICY owns every deny message (see renderDeny + installGuard).
      // A config that carried a free `reason` could hand the model a figure or a role to repeat
      // without reading — the measured leak this loader forbids. `.strict()` rejects it by name.
      prose: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('llmCheck'),
      id: z.string(),
      // The hook the adjudicated guard installs on: onReply (a reply verdict) or preTool (a call veto).
      hook: z.enum(['onReply', 'preTool']),
      // Which tools it binds — a name list or the string 'any' (global). No pattern field: the RUBRIC is
      // the judgement, and it is PROSE, so the no-regex structural ban is untouched.
      tools: z.union([z.array(z.string()).min(1), z.literal('any')]),
      // The trusted, pre-baked question the host adjudicator answers. Prose, never a pattern.
      rubric: z.string(),
      // Unreachable adjudicator ⇒ open (allow, default) or closed (deny). Optional.
      failMode: z.enum(['open', 'closed']).optional(),
    })
    .strict(),
  z
    .object({
      // The did × message BACKSTOP. Its rubric is BAKED into the engine factory, so there is no
      // `rubric` field here — a domain opts IN to the engine's question, it does not rewrite it. Always
      // onReply and always global (it judges the delivered payload as a whole), so no `hook`/`tools`
      // either. Available, never auto-installed: an agent gets it only by naming it in its norms.
      kind: z.literal('didMessageConsistency'),
      id: z.string(),
      // Unreachable adjudicator ⇒ open (allow) or closed (deny). Optional, and this kind DEFAULTS TO
      // `'closed'` — UNLIKE the bare `llmCheck` above, which defaults open. It is the consent backstop
      // for the two residuals the ask cannot cover deterministically, and a backstop that evaporates when
      // the adjudicator is unreachable is not one. Set `'open'` only as a deliberate availability choice.
      failMode: z.enum(['open', 'closed']).optional(),
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
    // The domain OUTCOME vocabulary: every non-core outcome word an agent may declare in a `did` claim maps
    // to a CORE outcome (e.g. `{ settled: 'success' }`), so the ledger cross-check stays engine-owned. Loads
    // into the DomainContract seam (`contract.outcomes`) and is threaded into the claim-coverage guard so a
    // domain outcome resolves the same way the engine's honesty core resolves it.
    outcomes: z.record(z.string(), z.enum(CORE_OUTCOME_VALUES)).optional(),
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
 * `confirmFirst` (via:'probe') keys on the strict boolean `true`. Rather than push the coercion into
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

// ── The DENY POLICY — one renderer for every catalog deny, names the read, never a figure ────────

/**
 * THE ONE DENY RENDERER for catalog guards that gate on a READ. It NAMES the read(s) to run and points
 * the model at "that result" — it NEVER interpolates a world figure (a count, a limit, a dollar amount)
 * or a role. A guard fires post-hoc, so a deny that carried a number or a name handed the model a fact it
 * then repeated WITHOUT reading — the measured leak (five cases) this policy kills. Configs cannot
 * override it: there is no `reason` field on any guard entry, so this renderer is the sole source of the
 * text a denied catalog guard emits.
 */
export function renderDeny(readNames: string[], subjectNoun: string): string {
  return `Read ${readNames.join(' or ')} first and report the ${subjectNoun} from that result.`;
}

/** The neutral noun the deny points at — a figure-free placeholder, never the value itself. */
const DENY_SUBJECT = 'actual values';

/** Wrap a catalog guard so its deny text is the policy-rendered string, not the primitive's own message.
 *  The check's DECISION (null vs non-null) is preserved verbatim; only the emitted text is replaced —
 *  so no core primitive can leak a figure through a deny a config author never gets to write. */
function withPolicyDeny(guard: Guard, deny: string): Guard {
  return {
    kind: guard.kind,
    dim: guard.dim,
    ...(guard.meta ? { meta: guard.meta } : {}),
    check: (ctx: GuardCtx) => (guard.check(ctx) == null ? null : deny),
    prose: () => guard.prose(),
  };
}

// ── The loader ───────────────────────────────────────────────────────────────────────────────────

export interface NormsDeps {
  /** Host-owned, trusted world predicates a precondition may reference by NAME (never authored in the
   *  JSON, so no free function ever enters the config surface). */
  predicates?: Record<string, (world: AgentWorld) => boolean>;
}

function installGuard(spec: AgentSpecBase, g: GuardConfig, deps: NormsDeps, outcomes?: OutcomeMap): void {
  const id = `agent:${g.id}`;
  switch (g.kind) {
    case 'requiresBefore':
      // DENY POLICY: this is the one catalog kind that gates on a READ, so its deny is the rendered
      // "read X first" text — it names the read and never a figure (the leak the policy kills).
      spec.addGuard('preTool', [g.tool], withPolicyDeny(requiresBefore(g.reads), renderDeny(g.reads, DENY_SUBJECT)), {
        layer: 'agent',
        id,
      });
      return;
    case 'consentToken':
      // DENY-POLICY AUDIT: confirmFirst's deny names only the gated TOOL (structural) and never a world
      // figure or a role, so there is nothing for renderDeny (which is reads-shaped) to replace — it stays
      // on its own figure-free primitive text. `confirmFirst` with `via:'probe'` IS the record-bound
      // earlier-turn-preview gate; the recency law bounds the licensing probe to `within:1` by default.
      spec.addGuard('preTool', g.tools, normalizeConfirmed(confirmFirst({ via: 'probe' })), { layer: 'agent', id });
      return;
    case 'askedEarlier':
      // DENY-POLICY AUDIT: askedEarlier's deny names only the gated ARG (structural), no figure/role.
      spec.addGuard('preTool', [g.tool], askedEarlier({ tool: g.tool, ...(g.arg ? { arg: g.arg } : {}) }), { layer: 'agent', id });
      return;
    case 'claimCoversRubric':
      // NO DENY-POLICY WRAP: claimCoversRubric's redrive text IS the author's followable coverage `reason`
      // (a coverage instruction, never a world figure). It keys on STRUCTURE (targets × did outcome), so the
      // spec-level outcomes map is threaded in to resolve a domain outcome word exactly as the engine does.
      spec.addGuard('onReply', 'any', claimCoversRubric({ targets: g.targets, outcome: g.outcome, ...(outcomes ? { outcomes } : {}) }, g.reason), { layer: 'agent', id });
      return;
    case 'precondition': {
      // DENY POLICY: no `reason` field exists on the config, so the deny is the author's followable
      // `prose` (the condition), never a free post-hoc string that could carry the value being gated.
      const ok = compilePredicate(g, deps);
      spec.addGuard('preTool', [g.tool], precondition(ok, g.prose, g.prose), { layer: 'agent', id });
      return;
    }
    case 'llmCheck': {
      // NO DENY-POLICY WRAP: the deny an llmCheck emits is the ADJUDICATOR'S verdict (host-registered,
      // trusted), not a config-authored `reason` — there is no reason field to leak a figure through.
      // hook → dim: onReply is a behavior verdict, preTool a run veto (the DIM_HOOKS matrix).
      const dim = g.hook === 'preTool' ? 'run' : 'behavior';
      const target = g.tools === 'any' ? 'any' : g.tools;
      spec.addGuard(g.hook, target, llmCheck({ rubric: g.rubric, dim, ...(g.failMode ? { failMode: g.failMode } : {}) }), {
        layer: 'agent',
        id,
      });
      return;
    }
    case 'didMessageConsistency': {
      // Same no-deny-policy-wrap reasoning as `llmCheck` (it IS one): the deny is the adjudicator's
      // verdict. The rubric is the engine's, so the config chooses only WHETHER to install it and what an
      // unreachable adjudicator means.
      spec.addGuard('onReply', 'any', didMessageConsistency(g.failMode ? { failMode: g.failMode } : undefined), {
        layer: 'agent',
        id,
      });
      return;
    }
  }
}

/**
 * Load a `norms/<agent>.json` value into an {@link AgentSpec}. Throws {@link NormsConfigError} with a
 * path-qualified message on any violation — a regex/pattern key, an unknown key, missing prose, or an
 * unresolvable predicate ref (all at LOAD time).
 *
 * LIMITATION — THE HONESTY CROSS-CHECK IS NOT REACHABLE FROM THIS PATH. The spec this builds is
 * CONTRACT-LESS, and there is no `writeTools` key in the schema, so `claimIsGrounded` / `claimIsComplete`
 * never auto-install: a subject configured through a norms file runs with the consent, flow and args
 * families installed and the ledger cross-check absent entirely. Nothing about the loaded spec announces
 * that gap — the guard count simply comes up short. A benchmark subject that needs the cross-check must
 * be built in TypeScript with a `contract` carrying `writeTools` (see `AgentSpecBase`), not from a norms
 * config. Adding a `writeTools` key here (plus the `outcomes` map it already parses) is the fix; it is a
 * config-surface change and is deliberately not smuggled in as a side effect of a documentation pass.
 */
export function loadNormsConfig(json: unknown, deps: NormsDeps = {}): AgentSpec {
  scanBannedKeys(json, '');
  const parsed = configSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new NormsConfigError(`norms config invalid at ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  const cfg = parsed.data;
  // THE SHADOW LAW on the config path. The spec constructor gates `contract.outcomes`, and this loader
  // builds a CONTRACT-LESS spec: unchecked, the config's `outcomes` block would go straight into the
  // cross-check guards, so `{"NOT_FOUND":"success"}` would load clean and a `NOT_FOUND` claim would then
  // satisfy a `success` rubric. The guard factories assert it themselves, but the config path owes the
  // author a PATH-QUALIFIED load error rather than a raw guard-factory throw.
  try {
    assertNoCoreOutcomeShadow(cfg.outcomes, 'norms config `outcomes`');
  } catch (e) {
    throw new NormsConfigError(`norms config invalid at outcomes: ${e instanceof Error ? e.message : String(e)}`);
  }
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
  for (const g of cfg.guards ?? []) installGuard(spec, g, deps, cfg.outcomes);
  return spec;
}
