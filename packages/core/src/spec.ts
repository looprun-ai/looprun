/**
 * @looprun-ai/core — the AgentSpec INTERFACE + class hierarchy (framework-free).
 *
 * The ruleset IS the spec (no compile step). A backend (e.g. @looprun-ai/mastra) consumes
 * this interface directly, mapping each hook to a framework primitive:
 *   onInput  → an input processor (processInput → abort ⇒ turn refused, no LLM call)
 *   preTool  → a run-level `hooks.beforeToolCall` veto ({ proceed:false, output: correction })
 *   postTool → recorded via `hooks.afterToolCall`
 *   onReply  → an output processor (processOutputResult → abort({retry:true}) ⇒ redrive; exhaustion ⇒
 *              a deterministic guard-authored closure)
 *   controls → maxSteps (stop condition) · terminal (reply-only policy) · directives ·
 *              exhaustionReply   [`escalate` is TYPED BUT NOT CONSUMED by the backend — see
 *              AgentControls.escalate; it is forward-compat surface, inert today]
 *
 * ONE class, `AgentSpecBase` (the former Minimal/Base/Full ladder is collapsed — a spec is a spec).
 * Its constructor auto-installs, layer-tagged and addressable, exactly:
 *   - ALWAYS the invariants EVERY agent carries: noDuplicateCall (preTool, id `minimal:noDuplicateCall`)
 *     + degenerationGuard (onReply, id `minimal:degenerationGuard`, FIRST in the onReply tail; its
 *     self-narration branch fires only when `cfg.lexicon.selfNarrationRe` is injected)
 *     + emptyReply (onReply, id `minimal:emptyReply`); and IFF `cfg.lexicon.falseFailureClaimRe` is
 *     provided, noFalseFailureClaim (onReply, id `minimal:noFalseFailureClaim`) — the always-on
 *     reply-honesty invariant (auto-iff-provided, so a lexicon-less spec is byte-stable);
 *   - IFF `destructiveTools` is non-empty, the destructive-safety protocol on those tools:
 *     confirmFirst (id `base:confirmFirst`) + destructiveThrottle (id `base:destructiveThrottle`).
 * Per-tool schema guards (argRequired/argFormat) are now AUTHORED explicitly by the spec — there is no
 * auto-schema layer. The `minimal:`/`base:` id namespaces are retained (load-bearing for resolveBindings
 * layer ordering + trunk prose order). resolveBindings sorts each hook agent → full → base → minimal so
 * an agent correction always wins.
 */
import { confirmFirst, degenerationGuard, destructiveThrottle, emptyReply, noDuplicateCall, noFalseFailureClaim } from './guards.js';
import { GuardExecutionError } from './rules.js';
import type { AgentWorld, Dim, Guard, GuardCtx, ObservedCall, ReplyMutator, SpatialEdge } from './rules.js';
import type { DomainContract } from './trunk.js';
import type { SamplingSettings } from './model-params.js';

export type Hook = 'onInput' | 'preTool' | 'postTool' | 'onReply';
export type ToolTarget = 'any' | string[];
export type Layer = 'minimal' | 'base' | 'full' | 'agent';

/** true ⇒ force reply()-only this turn (drop askUser). State-driven, per turn. */
export type TerminalPolicy = (world: AgentWorld) => boolean;

/** State-keyed positive guidance rendered statically as "IF <cond> → <directive>" (cache-stable). */
export interface StateDirective {
  id: string;
  cond: string;
  directive: string;
  when?: (world: AgentWorld) => boolean;
}

/**
 * The per-agent SCOPE declaration — the source of the `## Scope precedence` trunk block.
 *
 * Authored by the generator skill ON THE SPEC (never derived by the runtime from a domain-wide
 * ownership map): scope is an agent-level fact, so the domain contract stays free of anything
 * agent-specific and the runtime stays a pure renderer (no set intersection, no derivation).
 *
 * WORDING CONSTRAINT (measured 2026-07-20, FL case-21): `others[].label` must name the OWNING TEAM,
 * never this agent's own role — first-person role text collides with self-narration lexicons, which
 * redrives the honest reply into an exhaustion stub.
 */
export interface AgentScope {
  /** What THIS agent covers (the in-scope lane sentence). */
  lane: string;
  /** The teams owning the other lanes — `label` = the team to name, `covers` = what it handles. */
  others: Array<{ label: string; covers: string }>;
}

export interface AgentModelRef {
  provider?: string;
  model?: string;
  id?: string;
}

export interface MutatorBinding {
  id: string;
  mutator: ReplyMutator;
  layer: Layer;
  disabled: boolean;
}

export interface GuardBinding {
  id: string;
  /**
   * onInput/onReply: ignored by the CHECK, but NOT by the RENDER — the old one-line comment here said
   * only the first half and was therefore a lie by omission (found 2026-07-20).
   *
   * CHECK: the backend resolves onInput/onReply with no tool, and `resolveBindings` short-circuits on
   * `tool === undefined`, so target is never consulted to decide whether the guard RUNS.
   * RENDER: `trunk.ts` reads target for EVERY hook. Naming tools → `## Tool rules`, grouped by tool;
   * `'any'` → `## Global tool rules` (preTool/postTool), `## Input rules` (onInput) or `## Reply
   * rules` (onReply). So an onReply binding that names tools RUNS on every reply but prints its prose
   * under `## Tool rules` — use `'any'` on onInput/onReply unless that section is what you want.
   */
  target: ToolTarget;
  guard: Guard;
  layer: Layer;
  disabled: boolean;
}

/**
 * A declared FOLLOW-UP completion (a "flowChain"). Veto guards can only BLOCK a wrong call; they
 * cannot CREATE a missing one. A flowChain deterministically COMPLETES a required follow-up: iff `after`
 * ran OK this turn and `call` did NOT, the runtime forces `call` (the LLM keeps ownership of args; a
 * zero-arg / spec-derivable call skips the LLM entirely). preTool guards still gate the forced call — a
 * chain cannot bypass governance.
 *
 * FIREWALL: `when`/`args` are spec-authored business code (like `exhaustionReply`) — pure functions of
 * (world, observed) ONLY. They NEVER receive the user's text or the reply (the magnet firewall bars
 * deterministic trigger/derive code from reading user text). Only the `mode:'llm'` micro-generate may
 * see the user text — that is the model filling args, not guard/trigger code.
 */
export interface ChainSpec {
  /** Fires only if this tool was observed OK THIS turn. */
  after: string;
  /** The follow-up tool that must exist this turn; forced when missing. */
  call: string;
  /** Deterministic trigger — a PURE function of (world, observed) [full-conversation ledger; each
   *  ObservedCall carries `turnIndex`, so scope to this turn yourself if needed]. NO user text. Absent ⇒
   *  always fire (when `after` ran OK this turn and `call` is missing). */
  when?: (world: AgentWorld, observed: ObservedCall[]) => boolean;
  /** 'direct' = execute `world.exec(call, args ?? {})` with NO LLM (zero-arg or spec-derived args), on the
   *  same guard-checked path a model call takes. 'llm' = ONE forced micro-generate where the model fills
   *  args (it may read the user text — the firewall bars only deterministic guard/trigger code). */
  mode: 'direct' | 'llm';
  /** For 'direct': static args, or a PURE derive function of (world, observed) [same firewall as `when`].
   *  Ignored for 'llm' (the model fills args). Default `{}`. */
  args?: Record<string, unknown> | ((world: AgentWorld, observed: ObservedCall[]) => Record<string, unknown>);
}

export interface AgentControls {
  maxSteps?: number;
  redrives?: number;
  terminal?: TerminalPolicy;
  directives?: StateDirective[];
  /** Declared follow-up completions — see {@link ChainSpec}. Absent/empty ⇒ the runtime adds not a
   *  single new code effect on the turn (zero-diff). */
  chains?: ChainSpec[];
  /** TYPED BUT NOT CONSUMED by the Mastra backend (`backends/mastra.ts` never reads it) — no model-tier
   *  escalation exists on the shipping path. Forward-compat surface only; setting it changes NOTHING at
   *  runtime, so do not read it as coverage. */
  escalate?: { model: AgentModelRef; maxAttempts?: number };
  /** Per-agent AI-SDK call settings, merged OVER the conversation-level modelParams (agent wins) by the
   *  backend — so a creative content agent can run at temperature 0.7 beside a temp-0 admin agent in the
   *  same domain. Absent ⇒ the conversation-level modelParams apply unchanged. */
  sampling?: SamplingSettings;
  /** Committed when the reply still violates its checks after all redrives — MUST be a pure function
   *  of verified observations (structurally unable to fabricate). Omitted ⇒ the domain/default closure. */
  exhaustionReply?: (world: AgentWorld, okTools: string[], produced: string[], violations: string[]) => string;
}

export interface AgentSpec {
  id: string;
  mode: string;
  /** THIS agent's persona/role line (persona-on-spec law: per-agent, owned by the spec — never a
   *  shared/global persona; the domain-common VOICE lives on the domain). Rendered as the FIRST
   *  `## Behavior` bullet — per-agent divergence as late as possible so the domain's agents share a
   *  maximal static trunk prefix (trunk-static law). MUST be case-invariant (state-in-tail law). */
  persona: string;
  /** Optional scope declaration — when present the trunk renders `## Scope precedence` ABOVE
   *  `## Core rules` (position is the measured lever). Absent ⇒ no scope block at all. */
  scope?: AgentScope;
  surface: {
    tools: string[];
    systemPrompt?: (world: AgentWorld, recentUploads?: readonly string[]) => string;
  };
  flow: SpatialEdge[];
  guards: {
    onInput?: GuardBinding[];
    preTool: GuardBinding[];
    postTool?: GuardBinding[];
    onReply: GuardBinding[];
    onReplyMutate?: MutatorBinding[];
  };
  controls: AgentControls;
  /** The LANGUAGE / JUDGEMENT layer: prose whose rules have NO possible `check()` (redefined
   *  2026-07-20). Every rule that HAS a guard states itself in the trunk from that guard's own
   *  `prose()` — the PROSE-RENDERING RULE renders EVERY hook now, `onInput`/`onReply` included
   *  (`## Reply rules`). So `behavior[]` is the declared residue of the proxy sweep: what stays
   *  UNCHECKABLE after a decidable proxy was attempted (tone, how much context to give, what reads
   *  as condescending). A line here MUST NOT restate a rule a guard already enforces — that is two
   *  copies of one rule with only one coupled to the check, i.e. guaranteed drift (lint Q10).
   *  Rendered as `## Behavior`, after the per-agent `persona` bullet. */
  behavior: string[];
  /** Optional reference to the DOMAIN contract this spec belongs to. Domain contracts stay domain-level objects
   *  (1 domain : N agents, byte-identical shared trunk head — trunk-static law); this field lets a
   *  generated bundle point every spec at the SAME domain object so a host can construct an agent
   *  from the spec alone. A host-provided domain always overrides it. */
  theme?: DomainContract;
  /** B4 — optional runtime cross-check (implemented by AgentSpecBase): assert every `'arg'`-mechanism
   *  destructiveTool actually carries its confirm flag in the injected tool schema. Optional so an alien
   *  AgentSpec need not implement it; the backend calls it when present. */
  assertDestructiveConfirmable?(toolDefs: ReadonlyArray<{ name: string; inputSchema?: { properties?: Record<string, unknown> } }>): void;
}

const TERMINAL_TOOLS = ['replyToUser', 'askUser'];
const LAYER_ORDER: Record<Layer, number> = { agent: 0, full: 1, base: 2, minimal: 3 };

/**
 * THE HOOK×DIM MATRIX (2026-07-20, runtime-consistency audit) — which hook may carry which `dim`.
 *
 * The constructor used to validate ONE direction only ("a behavior/output guard may not be a preTool
 * gate"). The other direction was unchecked and SILENTLY INERT, because the hook decides which
 * `GuardCtx` fields exist:
 *   · `reply` is populated ONLY on the onReply path  → a `behavior` guard installed on preTool/postTool/
 *     onInput reads `ctx.reply === undefined` and can never fire (the reply-honesty kinds all read it).
 *   · `result` is populated ONLY on the postTool path → an `output` guard (`resultInvariant`) installed
 *     on onReply/onInput short-circuits on `ctx.result === undefined` and can never fire.
 *   · `tool`/`args` are populated ONLY on the tool hooks → a `spatial`/`input`/`run` guard installed on
 *     onReply reads `ctx.tool === undefined`; every kind that keys on the called tool bails out first.
 * A guard that cannot fire is worse than an absent one: it still reads as coverage in the spec header
 * and in the rendered trunk prose. So the matrix is enforced in BOTH directions and fails at
 * construction, exactly like the risk-family kinds' misconfiguration throws.
 */
const DIM_HOOKS: Record<Dim, readonly Hook[]> = {
  spatial: ['onInput', 'preTool', 'postTool'],
  input: ['onInput', 'preTool', 'postTool'],
  run: ['onInput', 'preTool', 'postTool'],
  output: ['postTool'],
  behavior: ['onReply'],
};

/** Why a given dim cannot live on a given hook — the GuardCtx field that would always be undefined. */
const DIM_HOOK_REASON: Record<Dim, string> = {
  spatial: 'it keys on ctx.tool/ctx.args, which only the tool hooks populate',
  input: 'it keys on ctx.tool/ctx.args, which only the tool hooks populate',
  run: 'it keys on ctx.tool/ctx.args, which only the tool hooks populate',
  output: 'it reads ctx.result, which only the postTool hook populates',
  behavior: 'it reads ctx.reply, which only the onReply hook populates',
};

/**
 * Wrap a guard so a throw from `check()`/`prose()` surfaces as an ATTRIBUTED {@link GuardExecutionError}
 * instead of an anonymous stack (or, worse, an error indistinguishable from a model/provider failure).
 * Returns a PLAIN object — `kind`/`dim` are copied as own properties, so `{ ...binding.guard }` spreads,
 * `guard.kind` lookups and the backend's `dim`-keyed TRUTH/FORM frontier all behave exactly as before.
 * See the policy note on {@link GuardExecutionError}: never swallowed, never converted into a deny.
 */
function attributeGuard(guard: Guard, hook: Hook, bindingId: string): Guard {
  const attribute = (phase: 'check' | 'prose', cause: unknown, tool?: string): never => {
    if (cause instanceof GuardExecutionError) throw cause; // already attributed (nested/composed guard)
    throw new GuardExecutionError({ hook, bindingId, guardKind: guard.kind, phase, tool, cause });
  };
  return {
    kind: guard.kind,
    dim: guard.dim,
    check(ctx: GuardCtx) {
      try {
        const out = guard.check(ctx);
        // A rejected PROMISE is the same author bug as a synchronous throw — attribute it too.
        return out instanceof Promise ? out.catch((e) => attribute('check', e, ctx.tool)) : out;
      } catch (e) {
        return attribute('check', e, ctx.tool);
      }
    },
    prose() {
      try {
        return guard.prose();
      } catch (e) {
        return attribute('prose', e);
      }
    },
  };
}

/** The mutator twin of {@link attributeGuard} — same policy for a throwing egress `apply()`. */
function attributeMutator(mutator: ReplyMutator, bindingId: string): ReplyMutator {
  return {
    kind: mutator.kind,
    apply(reply: string, ctx: GuardCtx) {
      try {
        return mutator.apply(reply, ctx);
      } catch (e) {
        if (e instanceof GuardExecutionError) throw e;
        throw new GuardExecutionError({
          hook: 'onReplyMutate', bindingId, guardKind: mutator.kind, phase: 'apply', cause: e,
        });
      }
    },
  };
}

export function resolveBindings(bindings: GuardBinding[] | undefined, tool?: string): GuardBinding[] {
  return (bindings ?? [])
    .filter((b) => !b.disabled && (tool === undefined || b.target === 'any' || b.target.includes(tool)))
    .sort((a, b) => LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer]);
}

export function resolveGuards(bindings: GuardBinding[] | undefined, tool?: string): Guard[] {
  return resolveBindings(bindings, tool).map((b) => b.guard);
}

export function resolveMutators(bindings: MutatorBinding[] | undefined): ReplyMutator[] {
  return (bindings ?? [])
    .filter((b) => !b.disabled)
    .sort((a, b) => LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer])
    .map((b) => b.mutator);
}

export interface ToolSchemaLike {
  required?: string[];
  properties?: Record<string, { pattern?: string; type?: string }>;
}

export interface AgentSpecConfig {
  id: string;
  mode: string;
  /** Required per-agent persona/role line (persona-on-spec law) — case-invariant; rendered as the
   *  first Behavior bullet. */
  persona: string;
  /** Optional per-agent scope declaration (see {@link AgentScope}) — renders the `## Scope precedence`
   *  block above the core rules. Absent ⇒ the block is omitted entirely. */
  scope?: AgentScope;
  tools: string[];
  systemPrompt?: (world: AgentWorld, recentUploads?: readonly string[]) => string;
  flow?: SpatialEdge[];
  /** See {@link AgentSpec.behavior} — the UNCHECKABLE language/judgement residue ONLY; never a
   *  restatement of a guarded rule (that prose comes from the guard itself). */
  behavior?: string[];
  terminal?: TerminalPolicy;
  directives?: StateDirective[];
  maxSteps?: number;
  redrives?: number;
  escalate?: { model: AgentModelRef; maxAttempts?: number };
  exhaustionReply?: (world: AgentWorld, okTools: string[], produced: string[], violations: string[]) => string;
  /** Per-agent AI-SDK call settings (see {@link AgentControls.sampling}) — merged over the
   *  conversation-level modelParams by the backend. */
  sampling?: SamplingSettings;
  /** Declared follow-up completions (see {@link ChainSpec}). Absent ⇒ controls.chains stays unset. */
  chains?: ChainSpec[];
  destructiveTools?: string[];
  /** Per destructive tool, the confirm MECHANISM the auto destructive-safety layer installs (P8a-clean —
   *  no linguistic content). `'arg'` (default for any unlisted destructive tool) = a `confirmed:true`
   *  flag gated on a prior-turn probe; `'prior-ask'` = a flag-less action gated on a prior-turn `askUser`.
   *  Absent ⇒ every destructive tool uses `'arg'` (byte-stable with the pre-mechanism layer). */
  confirmMechanism?: Record<string, 'arg' | 'prior-ask'>;
  /** Business-owned lexicon injected for the ALWAYS-ON reply layer. When `falseFailureClaimRe` is
   *  provided, `installMinimal` auto-installs `noFalseFailureClaim({ claimRe })` under
   *  `minimal:noFalseFailureClaim` (a reply-honesty invariant every agent should carry). Auto-iff-provided
   *  — an absent lexicon leaves the minimal layer exactly as before (non-breaking). Extensible: future
   *  always-on language-keyed guards add their own key here, keeping the runtime language-neutral (P8a). */
  lexicon?: { falseFailureClaimRe?: RegExp; confirmAskRe?: RegExp; selfNarrationRe?: RegExp; honestNegationRe?: RegExp };
  /** STORED BUT NOT CONSUMED — there is NO auto-schema layer in this runtime (GUARDS.md §3): passing
   *  schemas installs no `argRequired`/`argFormat`. Author those guards explicitly. Kept only so a
   *  spec can read its own schemas when authoring them; never read it as coverage. */
  toolSchemas?: Record<string, ToolSchemaLike>;
  /** Optional domain-contract reference (see {@link AgentSpec.theme}). */
  theme?: DomainContract;
}

/**
 * The ONE AgentSpec class (no Minimal/Base/Full ladder). Its constructor always installs the universal
 * invariants (noDuplicateCall + emptyReply, + noFalseFailureClaim iff `cfg.lexicon` provides its regex)
 * and, iff `destructiveTools` is non-empty, the destructive-safety protocol (confirmFirst +
 * destructiveThrottle) on those tools — confirmFirst keyed per-tool by `cfg.confirmMechanism`. Ids and
 * install order are byte-stable (`minimal:*` then `base:*`) so the layer-sorted trunk prose and
 * resolveBindings order are unchanged from the former ladder.
 */
export class AgentSpecBase implements AgentSpec {
  readonly id: string;
  readonly mode: string;
  readonly persona: string;
  readonly scope?: AgentScope;
  readonly surface: AgentSpec['surface'];
  readonly flow: SpatialEdge[];
  readonly guards: Required<AgentSpec['guards']>;
  readonly controls: AgentControls;
  readonly behavior: string[];
  readonly theme?: DomainContract;
  protected readonly destructiveTools: string[];
  protected readonly confirmMechanism: Record<string, 'arg' | 'prior-ask'>;
  protected readonly lexicon: { falseFailureClaimRe?: RegExp; confirmAskRe?: RegExp; selfNarrationRe?: RegExp; honestNegationRe?: RegExp };
  protected readonly toolSchemas: Record<string, ToolSchemaLike>;
  private seq = 0;

  constructor(cfg: AgentSpecConfig) {
    const terminals = cfg.tools.filter((t) => TERMINAL_TOOLS.includes(t));
    if (terminals.length) {
      throw new Error(
        `AgentSpec "${cfg.id}": terminal tools are runtime-owned and may not be in tools (found: ${terminals.join(', ')}).`,
      );
    }
    if (!cfg.persona?.trim()) {
      throw new Error(
        `AgentSpec "${cfg.id}": a non-empty per-agent persona is required — persona lives in the spec, never a shared domain (persona-on-spec law).`,
      );
    }
    this.id = cfg.id;
    this.mode = cfg.mode;
    this.persona = cfg.persona;
    if (cfg.scope) this.scope = { lane: cfg.scope.lane, others: [...cfg.scope.others] };
    // DESIGN RULE: every agent renders its OWN scoped prompt — no shared/global persona trunk.
    this.surface = {
      tools: [...cfg.tools],
      // Domain-agnostic: a spec never bakes a domain. If it ships no own renderer, the RUNTIME renders
      // the scoped trunk with the host-injected domain (renderScopedSpecTrunk) — so the trunk carries
      // ONLY what the spec/domain declare, and the domain skin stays outside the AgentSpec.
      // `domain` on the spec is a REFERENCE for DX, not content.
      systemPrompt: cfg.systemPrompt,
    };
    this.flow = [...(cfg.flow ?? [])];
    this.guards = { onInput: [], preTool: [], postTool: [], onReply: [], onReplyMutate: [] };
    this.controls = {
      ...(cfg.maxSteps != null ? { maxSteps: cfg.maxSteps } : {}),
      ...(cfg.redrives != null ? { redrives: cfg.redrives } : {}),
      ...(cfg.terminal ? { terminal: cfg.terminal } : {}),
      ...(cfg.directives?.length ? { directives: [...cfg.directives] } : {}),
      ...(cfg.escalate ? { escalate: cfg.escalate } : {}),
      ...(cfg.exhaustionReply ? { exhaustionReply: cfg.exhaustionReply } : {}),
      ...(cfg.sampling ? { sampling: cfg.sampling } : {}),
      ...(cfg.chains?.length ? { chains: [...cfg.chains] } : {}),
    };
    this.behavior = [...(cfg.behavior ?? [])];
    if (cfg.theme) this.theme = cfg.theme;
    this.destructiveTools = [...(cfg.destructiveTools ?? [])];
    this.confirmMechanism = { ...(cfg.confirmMechanism ?? {}) };
    this.lexicon = { ...(cfg.lexicon ?? {}) };
    this.toolSchemas = cfg.toolSchemas ?? {};
    // Install order is load-bearing (byte-stable trunk): universal invariants first, destructive layer
    // second — same as the former AgentSpecMinimal → AgentSpecBase super()/installBase() flow.
    this.installMinimal();
    this.installBase();
  }

  protected installMinimal(): void {
    this.addGuard('preTool', 'any', noDuplicateCall(), { layer: 'minimal', id: 'minimal:noDuplicateCall' });
    // Output-channel degeneration lint (promoted 2026-07-15 after targeted validation + flash N=3
    // zero-firing recert). FIRST among the onReply minimal guards: a degenerate reply must be re-driven
    // before any content-level check reasons about it. (Its prose DOES render — since 2026-07-20 every
    // hook's prose lands in the trunk; `target:'any'` onReply prose renders under `## Reply rules`. The
    // previous "onReply prose does NOT render" note here was stale, and contradicted trunk.ts's own
    // PROSE-RENDERING RULE + AgentSpec.behavior's doc — see GUARDS.md §2.)
    this.addGuard('onReply', 'any', degenerationGuard({ selfNarrationRe: this.lexicon.selfNarrationRe }), { layer: 'minimal', id: 'minimal:degenerationGuard' });
    // ALWAYS-ON reply-honesty invariant — auto-installed IFF the bundle injects its false-failure lexicon
    // (auto-iff-provided keeps a spec that ships no lexicon byte-stable). Ordered BEFORE emptyReply so the
    // resolved onReply tail is `… , minimal:noFalseFailureClaim, minimal:emptyReply` (the same relative
    // position the agent-layer install formerly held, just under a stable minimal id).
    if (this.lexicon.falseFailureClaimRe) {
      // N5: wire the domain's honest-negation pattern as the exemptRe so a MIXED-turn honest partial
      // ("renewed A; B could not be renewed — at its limit") is not vetoed. Symmetric with
      // destructiveClaimRequiresSuccess's exemptRe. Absent ⇒ byte-identical to the pre-N5 behaviour.
      this.addGuard('onReply', 'any', noFalseFailureClaim({ claimRe: this.lexicon.falseFailureClaimRe, ...(this.lexicon.honestNegationRe ? { exemptRe: this.lexicon.honestNegationRe } : {}) }), { layer: 'minimal', id: 'minimal:noFalseFailureClaim' });
    }
    this.addGuard('onReply', 'any', emptyReply(), { layer: 'minimal', id: 'minimal:emptyReply' });
  }

  /** Iff the spec declares destructiveTools: the confirm-first + throttle protocol on exactly those tools
   *  (validated ⊆ surface). The confirm MECHANISM is per-tool (`cfg.confirmMechanism`, default `'arg'`):
   *  the tools are partitioned so each mechanism renders its OWN prose under its own base id — arg-flag
   *  tools → `base:confirmFirst`, prior-ask tools → `base:confirmFirstPriorAsk` — while `destructiveThrottle`
   *  covers ALL of them. A no-op when the list is empty — every non-destructive spec is clean. */
  protected installBase(): void {
    const destructive = this.destructiveTools;
    // A `confirmMechanism` key that is NOT a destructive tool (a typo, a renamed tool, a tool the author
    // forgot to also list in `destructiveTools`) used to be ignored in silence, and the tool it MEANT to
    // key fell back to `'arg'`. For a flag-LESS destructive tool that fallback is a permanent no-op:
    // `confirmFirst`'s arg mechanism returns null as soon as `args.confirmed !== true`, which is always —
    // i.e. the destructive-confirm gate reads as installed and enforces nothing. `destructiveTools` is
    // ⊆-validated above; the mechanism map is validated the same way, for the same reason.
    const strayMech = Object.keys(this.confirmMechanism).filter((t) => !destructive.includes(t));
    if (strayMech.length) {
      throw new Error(
        `AgentSpec "${this.id}": confirmMechanism names tool(s) that are not in destructiveTools: ${strayMech.join(', ')}. ` +
          'The mechanism would be ignored and the tool would silently fall back to the arg mechanism (a no-op for a flag-less tool).',
      );
    }
    if (!destructive.length) return;
    const missing = destructive.filter((t) => !this.surface.tools.includes(t));
    if (missing.length) {
      throw new Error(`AgentSpec "${this.id}": destructiveTools not in the tool surface: ${missing.join(', ')}.`);
    }
    const mechOf = (t: string): 'arg' | 'prior-ask' => this.confirmMechanism[t] ?? 'arg';
    const argTools = destructive.filter((t) => mechOf(t) === 'arg');
    const priorAskTools = destructive.filter((t) => mechOf(t) === 'prior-ask');
    if (argTools.length) {
      // P9: askRe wired so the arg mechanism's prose-probe disjunct can accept a prior-turn
      // replyToUser confirmation-ask as the probe (guards.ts confirmFirst).
      this.addGuard('preTool', argTools, confirmFirst({ askRe: this.lexicon.confirmAskRe }), { layer: 'base', id: 'base:confirmFirst' });
    }
    if (priorAskTools.length) {
      this.addGuard('preTool', priorAskTools, confirmFirst({ mechanism: 'prior-ask', askRe: this.lexicon.confirmAskRe }), { layer: 'base', id: 'base:confirmFirstPriorAsk' });
    }
    this.addGuard('preTool', destructive, destructiveThrottle(destructive), { layer: 'base', id: 'base:destructiveThrottle' });
  }

  /**
   * B4 (bankdesk 2026-07-23) — a destructiveTool on the DEFAULT `'arg'` confirm mechanism must actually
   * carry the confirm FLAG in its tool schema. `installBase` auto-installs `confirmFirst` with the
   * default argFlag `'confirmed'`, and its prose says "call it WITHOUT confirmed first, then confirm in a
   * LATER turn" — but if the tool's schema has no `confirmed` param, the model can NEVER pass it, so the
   * check is a permanent no-op AND the prose is a two-step ritual the tool cannot honour → the model asks
   * forever (measured: `freezeAccount` in destructiveTools with a one-step schema; N6-1 caught it only by
   * READING). `installBase` runs at construction where no schema exists; this runs where the toolDefs are
   * injected (the backend, at run start). A `'prior-ask'` tool is a zero-arg confirm — exempt by design.
   * Throws (an author bug, same class as the ⊆-surface / stray-mechanism throws) naming the fix.
   */
  assertDestructiveConfirmable(toolDefs: ReadonlyArray<{ name: string; inputSchema?: { properties?: Record<string, unknown> } }>): void {
    const CONFIRM_FLAG = 'confirmed'; // = confirmFirst's default argFlag, which installBase relies on
    const argTools = this.destructiveTools.filter((t) => (this.confirmMechanism[t] ?? 'arg') === 'arg');
    if (!argTools.length) return;
    const byName = new Map(toolDefs.map((d) => [d.name, d]));
    const broken = argTools.filter((t) => {
      const props = byName.get(t)?.inputSchema?.properties;
      return !props || !(CONFIRM_FLAG in props);
    });
    if (broken.length) {
      throw new Error(
        `AgentSpec "${this.id}": destructiveTools on the 'arg' confirm mechanism must declare a '${CONFIRM_FLAG}' ` +
          `flag in their schema, but ${broken.join(', ')} do not. The auto-installed confirmFirst renders a ` +
          `"confirm first, act in a LATER turn" protocol the tool cannot honour (there is no '${CONFIRM_FLAG}' arg to ` +
          `pass), so the model asks forever. Fix ONE of: add a '${CONFIRM_FLAG}' boolean to the tool's schema; set ` +
          `confirmMechanism['${broken[0]}']='prior-ask' (a zero-arg, ask-in-a-prior-turn confirm); or drop it from ` +
          `destructiveTools (and throttle it manually if it still needs rate-limiting).`,
      );
    }
  }

  addGuard(hook: Hook, target: ToolTarget, guard: Guard, opts?: { id?: string; layer?: Layer }): string {
    // BOTH directions of the hook×dim matrix (see DIM_HOOKS): the old one-way check let a guard be
    // installed on a hook whose GuardCtx can never satisfy it — a silent no-op that still reads as
    // coverage. Fail at construction instead.
    const legalHooks = DIM_HOOKS[guard.dim];
    // An UNRECOGNISED dim used to install silently. `dim` is not free-form metadata: the backend's
    // TRUTH/SAFETY↔FORM salvage frontier keys on it (`dim !== 'behavior'` ⇒ TRUTH by construction), and
    // this matrix keys on it — so an unknown value gets an accidental classification nobody chose.
    if (!legalHooks) {
      throw new Error(
        `AgentSpec "${this.id}": guard ${guard.kind} declares an unknown dim '${guard.dim}'. ` +
          `Valid dims: ${Object.keys(DIM_HOOKS).join(' | ')}.`,
      );
    }
    if (!legalHooks.includes(hook)) {
      throw new Error(
        `AgentSpec "${this.id}": a '${guard.dim}'-dim guard (${guard.kind}) cannot be installed on '${hook}' — ` +
          `${DIM_HOOK_REASON[guard.dim]}, so the check could never fire. Legal hook(s): ${legalHooks.join(' | ')}.`,
      );
    }
    const id = opts?.id ?? `${opts?.layer ?? 'agent'}:${guard.kind}#${++this.seq}`;
    const all = [...this.guards.onInput, ...this.guards.preTool, ...this.guards.postTool, ...this.guards.onReply];
    if (all.some((b) => b.id === id)) throw new Error(`AgentSpec guard id "${id}" already exists`);
    this.guards[hook].push({ id, target, guard: attributeGuard(guard, hook, id), layer: opts?.layer ?? 'agent', disabled: false });
    return id;
  }

  addReplyCheck(guard: Guard, opts?: { id?: string; layer?: Layer }): string {
    return this.addGuard('onReply', 'any', guard, opts);
  }

  addMutator(mutator: ReplyMutator, opts?: { id?: string; layer?: Layer }): string {
    const id = opts?.id ?? `${opts?.layer ?? 'agent'}:${mutator.kind}#${++this.seq}`;
    const list = (this.guards.onReplyMutate ??= []);
    if (list.some((b) => b.id === id)) throw new Error(`AgentSpec mutator id "${id}" already exists`);
    list.push({ id, mutator: attributeMutator(mutator, id), layer: opts?.layer ?? 'agent', disabled: false });
    return id;
  }

  get isPureGuardSet(): boolean {
    const all = [...this.guards.onInput, ...this.guards.preTool, ...this.guards.postTool, ...this.guards.onReply];
    return !all.some((b) => b.guard.kind.startsWith('llm:'));
  }

  addBehavior(line: string): this {
    this.behavior.push(line);
    return this;
  }

  addFlow(edge: SpatialEdge): this {
    this.flow.push(edge);
    return this;
  }
}
