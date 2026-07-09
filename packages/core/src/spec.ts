/**
 * @looprun/core — the AgentSpec INTERFACE + class hierarchy (framework-free).
 *
 * The ruleset IS the spec (no compile step). A backend (e.g. @looprun/mastra) consumes this
 * interface directly, mapping each hook to a framework primitive:
 *   onInput  → an input processor (abort ⇒ turn refused, no LLM call)
 *   preTool  → a `beforeToolCall` veto ({ proceed:false, output: correction })
 *   postTool → recorded via `afterToolCall`
 *   onReply  → runtime finalization (bounded no-tools redrive; exhaustion ⇒ a deterministic
 *              guard-authored closure)
 *   controls → maxSteps (stop condition) · terminal (reply-only policy) · directives · escalate ·
 *              exhaustionReply
 *
 * Layer hierarchy (guards installed by the constructor, layer-tagged and addressable):
 *   AgentSpecMinimal — invariants EVERY agent carries: noDuplicateCall (preTool) + emptyReply (onReply).
 *   AgentSpecBase    — Minimal + the destructive-safety protocol on `destructiveTools`:
 *                      confirmFirst + destructiveThrottle.
 *   AgentSpecFull    — Base + the schema-auto layer (argRequired/argFormat from tool JSON schemas).
 * resolveBindings sorts each hook agent → full → base → minimal so an agent correction wins.
 */
import { argFormat, argRequired, confirmFirst, destructiveThrottle, emptyReply, noDuplicateCall } from './guards.js';
import type { AgentWorld, Dim, Guard, GuardCtx, ReplyMutator, SpatialEdge } from './rules.js';
import type { TrunkTheme } from './trunk.js';

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

export interface AgentControls {
  maxSteps?: number;
  redrives?: number;
  terminal?: TerminalPolicy;
  directives?: StateDirective[];
  escalate?: { model: AgentModelRef; maxAttempts?: number };
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
  destructiveTools?: string[];
  toolSchemas?: Record<string, ToolSchemaLike>;
  /** Optional domain-theme reference (see {@link AgentSpec.theme}). */
  theme?: TrunkTheme;
}

export class AgentSpecMinimal implements AgentSpec {
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
    };
    this.behavior = [...(cfg.behavior ?? [])];
    if (cfg.theme) this.theme = cfg.theme;
    this.destructiveTools = [...(cfg.destructiveTools ?? [])];
    this.toolSchemas = cfg.toolSchemas ?? {};
    this.installMinimal();
  }

  protected installMinimal(): void {
    this.addGuard('preTool', 'any', noDuplicateCall(), { layer: 'minimal', id: 'minimal:noDuplicateCall' });
    this.addGuard('onReply', 'any', emptyReply(), { layer: 'minimal', id: 'minimal:emptyReply' });
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

export class AgentSpecBase extends AgentSpecMinimal {
  constructor(cfg: AgentSpecConfig) {
    super(cfg);
    this.installBase();
  }

  protected installBase(): void {
    const destructive = this.destructiveTools;
    if (!destructive.length) return;
    const missing = destructive.filter((t) => !this.surface.tools.includes(t));
    if (missing.length) {
      throw new Error(`AgentSpec "${this.id}": destructiveTools not in the tool surface: ${missing.join(', ')}.`);
    }
    this.addGuard('preTool', destructive, confirmFirst(), { layer: 'base', id: 'base:confirmFirst' });
    this.addGuard('preTool', destructive, destructiveThrottle(destructive), { layer: 'base', id: 'base:destructiveThrottle' });
  }
}

export class AgentSpecFull extends AgentSpecBase {
  constructor(cfg: AgentSpecConfig) {
    super(cfg);
    this.installFull();
  }

  protected installFull(): void {
    for (const tool of this.surface.tools) {
      const s = this.toolSchemas[tool];
      if (!s) continue;
      for (const field of s.required ?? []) {
        this.addGuard('preTool', [tool], argRequired(field), { layer: 'full', id: `full:argRequired:${tool}.${field}` });
      }
      for (const [field, prop] of Object.entries(s.properties ?? {})) {
        if (!prop.pattern) continue;
        try {
          this.addGuard('preTool', [tool], argFormat(field, prop.pattern), { layer: 'full', id: `full:argFormat:${tool}.${field}` });
        } catch { /* a malformed pattern degrades one guard, not the import */ }
      }
    }
  }
}
