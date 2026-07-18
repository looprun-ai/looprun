/**
 * @looprun-ai/core — the AgentSpec INTERFACE + class hierarchy (framework-free).
 *
 * The ruleset IS the spec (no compile step). A backend (e.g. @looprun-ai/mastra) consumes this
 * interface directly, mapping each hook to a framework primitive:
 *   onInput  → an input processor (abort ⇒ turn refused, no LLM call)
 *   preTool  → a `beforeToolCall` veto ({ proceed:false, output: correction })
 *   postTool → recorded via `afterToolCall`
 *   onReply  → runtime finalization (bounded no-tools redrive; exhaustion ⇒ a deterministic
 *              guard-authored closure)
 *   controls → maxSteps (stop condition) · terminal (reply-only policy) · directives · chains ·
 *              escalate · sampling · exhaustionReply
 *
 * ONE class, `AgentSpecBase` (the former Minimal/Base/Full ladder is collapsed — a spec is a spec).
 * Its constructor auto-installs, layer-tagged and addressable, exactly:
 *   - ALWAYS the invariants EVERY agent carries: noDuplicateCall (preTool, id `minimal:noDuplicateCall`)
 *     + emptyReply (onReply, id `minimal:emptyReply`);
 *   - IFF `destructiveTools` is non-empty, the destructive-safety protocol on those tools:
 *     confirmFirst (id `base:confirmFirst`) + destructiveThrottle (id `base:destructiveThrottle`).
 * Per-tool schema guards (argRequired/argFormat) are now AUTHORED explicitly by the spec — there is no
 * auto-schema layer. The `minimal:`/`base:` id namespaces are retained (load-bearing for resolveBindings
 * layer ordering + trunk prose order). resolveBindings sorts each hook agent → full → base → minimal so
 * an agent correction always wins.
 */
import { confirmFirst, degenerationGuard, destructiveThrottle, emptyReply, noDuplicateCall, noFalseFailureClaim } from './guards.js';
import type { AgentWorld, Dim, Guard, GuardCtx, ObservedCall, ReplyMutator, SpatialEdge } from './rules.js';
import type { TrunkTheme } from './trunk.js';
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
  target: ToolTarget; // ignored for onInput/onReply
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
  escalate?: { model: AgentModelRef; maxAttempts?: number };
  /** Per-agent AI-SDK call settings, merged OVER the conversation-level modelParams (agent wins) by the
   *  backend — so a creative content agent can run at temperature 0.7 beside a temp-0 admin agent in the
   *  same domain. Absent ⇒ the conversation-level modelParams apply unchanged. */
  sampling?: SamplingSettings;
  /** Committed when the reply still violates its checks after all redrives — MUST be a pure function
   *  of verified observations (structurally unable to fabricate). Omitted ⇒ the theme/default closure. */
  exhaustionReply?: (world: AgentWorld, okTools: string[], produced: string[], violations: string[]) => string;
}

export interface AgentSpec {
  id: string;
  mode: string;
  /** THIS agent's persona/role line (persona-on-spec law: per-agent, owned by the spec — never a
   *  shared/global persona; the domain-common VOICE lives on the theme). Rendered as the FIRST
   *  `## Behavior` bullet — per-agent divergence as late as possible so the domain's agents share a
   *  maximal static trunk prefix (trunk-static law). MUST be case-invariant (state-in-tail law). */
  persona: string;
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
  behavior: string[];
  /** Optional reference to the DOMAIN theme this spec belongs to. Themes stay domain-level objects
   *  (1 theme : N agents, byte-identical shared trunk head — trunk-static law); this field lets a
   *  generated bundle point every spec at the SAME theme object so a host can construct an agent
   *  from the spec alone. A host-provided theme always overrides it. */
  theme?: TrunkTheme;
}

const TERMINAL_TOOLS = ['replyToUser', 'askUser'];
const LAYER_ORDER: Record<Layer, number> = { agent: 0, full: 1, base: 2, minimal: 3 };

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
  tools: string[];
  systemPrompt?: (world: AgentWorld, recentUploads?: readonly string[]) => string;
  flow?: SpatialEdge[];
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
  lexicon?: { falseFailureClaimRe?: RegExp; confirmAskRe?: RegExp; selfNarrationRe?: RegExp };
  toolSchemas?: Record<string, ToolSchemaLike>;
  /** Optional domain-theme reference (see {@link AgentSpec.theme}). */
  theme?: TrunkTheme;
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
  readonly surface: AgentSpec['surface'];
  readonly flow: SpatialEdge[];
  readonly guards: Required<AgentSpec['guards']>;
  readonly controls: AgentControls;
  readonly behavior: string[];
  readonly theme?: TrunkTheme;
  protected readonly destructiveTools: string[];
  protected readonly confirmMechanism: Record<string, 'arg' | 'prior-ask'>;
  protected readonly lexicon: { falseFailureClaimRe?: RegExp; confirmAskRe?: RegExp; selfNarrationRe?: RegExp };
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
        `AgentSpec "${cfg.id}": a non-empty per-agent persona is required — persona lives in the spec, never a shared theme (persona-on-spec law).`,
      );
    }
    this.id = cfg.id;
    this.mode = cfg.mode;
    this.persona = cfg.persona;
    // DESIGN RULE: every agent renders its OWN scoped prompt — no shared/global persona trunk.
    this.surface = {
      tools: [...cfg.tools],
      // Theme-agnostic rendering: a spec never bakes theme strings into its prompt. If it ships no
      // own renderer, the RUNTIME renders the scoped trunk with the theme (renderScopedSpecTrunk) —
      // so the trunk carries ONLY what the spec/theme declare, and the domain skin stays outside
      // the AgentSpec. `theme` here is a REFERENCE for DX, not content.
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
    // before any content-level check reasons about it. onReply prose does NOT render into the trunk.
    this.addGuard('onReply', 'any', degenerationGuard({ selfNarrationRe: this.lexicon.selfNarrationRe }), { layer: 'minimal', id: 'minimal:degenerationGuard' });
    // ALWAYS-ON reply-honesty invariant — auto-installed IFF the bundle injects its false-failure lexicon
    // (auto-iff-provided keeps a spec that ships no lexicon byte-stable). Ordered BEFORE emptyReply so the
    // resolved onReply tail is `… , minimal:noFalseFailureClaim, minimal:emptyReply` (the same relative
    // position the agent-layer install formerly held, just under a stable minimal id).
    if (this.lexicon.falseFailureClaimRe) {
      this.addGuard('onReply', 'any', noFalseFailureClaim({ claimRe: this.lexicon.falseFailureClaimRe }), { layer: 'minimal', id: 'minimal:noFalseFailureClaim' });
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

  addGuard(hook: Hook, target: ToolTarget, guard: Guard, opts?: { id?: string; layer?: Layer }): string {
    if (hook === 'preTool' && (guard.dim === 'behavior' || guard.dim === 'output')) {
      throw new Error(`AgentSpec "${this.id}": a '${guard.dim}'-dim guard (${guard.kind}) cannot be a preTool gate — use onReply/postTool.`);
    }
    const id = opts?.id ?? `${opts?.layer ?? 'agent'}:${guard.kind}#${++this.seq}`;
    const all = [...this.guards.onInput, ...this.guards.preTool, ...this.guards.postTool, ...this.guards.onReply];
    if (all.some((b) => b.id === id)) throw new Error(`AgentSpec guard id "${id}" already exists`);
    this.guards[hook].push({ id, target, guard, layer: opts?.layer ?? 'agent', disabled: false });
    return id;
  }

  addReplyCheck(guard: Guard, opts?: { id?: string; layer?: Layer }): string {
    return this.addGuard('onReply', 'any', guard, opts);
  }

  addMutator(mutator: ReplyMutator, opts?: { id?: string; layer?: Layer }): string {
    const id = opts?.id ?? `${opts?.layer ?? 'agent'}:${mutator.kind}#${++this.seq}`;
    const list = (this.guards.onReplyMutate ??= []);
    if (list.some((b) => b.id === id)) throw new Error(`AgentSpec mutator id "${id}" already exists`);
    list.push({ id, mutator, layer: opts?.layer ?? 'agent', disabled: false });
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
