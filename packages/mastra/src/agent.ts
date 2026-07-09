/**
 * @looprun/mastra — LoopRunAgent: a GENUINE @mastra/core Agent compiled from an AgentSpec.
 *
 * DX mirrors `new Agent({...})`:
 *
 *   export const booksAgent = new LoopRunAgent({
 *     spec: bookkeepingSpec,          // carries its domain theme reference
 *     world,                          // instance (single conversation) or factory (sessionId) => world
 *     model: 'openai/gpt-5.5',        // Mastra router string OR AI-SDK model object
 *   })
 *
 * Because it IS an Agent, it registers in a Mastra instance and shows up in Mastra Studio with
 * the guards enforcing live (agent-level hooks apply to every tool source, including MCP).
 *
 * Governance per turn (generate): session resolve → advanceTurn + ledger reset → byte-stable
 * trunk (+ terminal protocol) as per-call `instructions` → volatile state on the USER-message
 * tail → generate with toolChoice:'required' + stopWhen(terminalCalled) → forced-terminal
 * fallback → mutators → onReply checks with bounded NO-TOOLS redrive (never a processor
 * abort/retry — that re-runs side-effecting tools, measured ~100× slower) → deterministic
 * honest-abstain closure. The result's `.text` is the governed reply; `.looprun` carries the meta.
 *
 * stream(): tool-level governance only (guard hooks + terminal protocol + activeTools). Reply
 * finalization (mutators/redrive/exhaustion) requires generate() — documented degraded mode.
 */
import { stepCountIs } from 'ai';
import { Agent } from '@mastra/core/agent';
import {
  beginTurn,
  finalizeReply,
  forcedTerminalPrompt,
  isTerminal,
  renderScopedSpecTrunk,
  terminalProtocol,
  validateSpec,
} from '@looprun/core';
import type { AgentSpec, AgentWorld, ObservedCall, ToolDef, TrunkTheme } from '@looprun/core';
import { SessionStore } from './session.js';
import type { LoopRunSession, WorldFactory } from './session.js';
import { buildWorldTools, buildTerminalTools } from './tools.js';
import { makeGuardHooks, makeInputProcessors } from './hooks.js';
import { worldFromTools } from './world-adapters.js';
import type { StateView } from './world-adapters.js';
import { DEFAULT_MAX_STEPS, DEFAULT_REDRIVES } from './run-conversation.js';

export interface LoopRunAgentConfig<W extends AgentWorld = AgentWorld> {
  /** The governed AgentSpec (id/persona/tools/guards/controls/behavior). */
  spec: AgentSpec;
  /** Domain theme override; defaults to `spec.theme`. */
  theme?: TrunkTheme;
  /**
   * The world seam — a deterministic instance (single conversation) or a factory
   * `(sessionId) => world` for multi-session hosts. Omit it in native-tools mode (`tools`).
   */
  world?: W | WorldFactory<W>;
  /**
   * NATIVE-TOOLS mode (Path B, incl. MCP): pass Mastra tools (e.g. `await mcp.getTools()`).
   * They execute themselves; guards still enforce through the agent hooks. Mutually exclusive
   * with `world`+`toolDefs`. Stateful guards + theme.stateBlock read `stateView`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Record<string, any>;
  /** Domain state reads for native-tools mode (see world-adapters.ts). */
  stateView?: StateView;
  /** Tool defs (JSON-schema) executed via `world.exec` — the certified path. */
  toolDefs?: ToolDef[];
  /** Mastra model router string ('openai/gpt-5.5') or an AI-SDK model object. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  /** Options spread into every internal generate (providerOptions / modelSettings / …). */
  modelParams?: Record<string, unknown>;
  /** The certified turn shape (terminal tools + toolChoice:'required'). Default true. */
  terminalProtocol?: boolean;
  maxSteps?: number;
  redrives?: number;
  /** Throw on validateSpec warnings instead of console.warn. */
  strict?: boolean;
  /** Agent id/name override; defaults to the spec id. */
  id?: string;
  name?: string;
  /** Any further @mastra/core Agent option (memory, description, processors, …) passes through. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [agentOption: string]: any;
}

export interface LoopRunResultMeta {
  sessionId: string;
  turnIndex: number;
  /** Guard activity this turn: veto kinds, 'forced-terminal', 'redrive:*', 'exhaustion-terminal'. */
  corrections: string[];
  exhausted: boolean;
  violations: string[];
  /** This turn's slice of the observed ledger. */
  observed: ObservedCall[];
}

export interface LoopRunOptions {
  loopRun?: {
    /** Conversation key; defaults to the memory thread id, else 'default'. */
    sessionId?: string;
    /** Attachment URLs ingested into the world this turn. */
    attachments?: string[];
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [generateOption: string]: any;
}

const LOOPRUN_KEYS = new Set([
  'spec', 'theme', 'world', 'tools', 'stateView', 'toolDefs', 'model', 'modelParams',
  'terminalProtocol', 'maxSteps', 'redrives', 'strict', 'id', 'name',
]);

export class LoopRunAgent<W extends AgentWorld = AgentWorld> extends Agent {
  readonly spec: AgentSpec;
  readonly theme?: TrunkTheme;
  readonly terminalProtocolOn: boolean;
  private readonly sessions: SessionStore<W>;
  private readonly nativeToolsMode: boolean;
  private readonly surface: Set<string>;
  private readonly modelParams: Record<string, unknown>;
  private readonly maxStepsResolved: number;
  private readonly redrivesResolved: number;
  private readonly guardHooks: ReturnType<typeof makeGuardHooks>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly inputProcessorsResolved: any[] | undefined;
  private active: LoopRunSession<W> | null = null;
  private readonly renderPrompt: (world: AgentWorld, uploads: string[]) => string;

  constructor(config: LoopRunAgentConfig<W>) {
    const { spec } = config;
    const theme = config.theme ?? spec.theme;
    if (!theme && !spec.surface.systemPrompt) {
      throw new Error(`LoopRunAgent "${spec.id}": no theme — pass config.theme or set spec.theme.`);
    }
    if (config.tools && (config.world || config.toolDefs)) {
      throw new Error(`LoopRunAgent "${spec.id}": pass EITHER native tools (tools[+stateView]) OR world+toolDefs — not both.`);
    }
    if (!config.tools && !config.world) {
      throw new Error(`LoopRunAgent "${spec.id}": a world (or native tools) is required.`);
    }
    const warnings = validateSpec(spec);
    if (warnings.length) {
      if (config.strict) throw new Error(`LoopRunAgent "${spec.id}": ${warnings.map((w) => w.message).join(' | ')}`);
      for (const w of warnings) console.warn(`[looprun] ${w.message}`);
    }

    const nativeToolsMode = !!config.tools;
    const world: W | WorldFactory<W> = nativeToolsMode
      ? (worldFromTools({ stateView: config.stateView }) as W)
      : (config.world as W | WorldFactory<W>);
    const sessions = new SessionStore<W>(world);
    const getSession = () => {
      if (!this.active) throw new Error('looprun: tool executed outside a governed turn');
      return this.active;
    };

    const surface = new Set(spec.surface.tools);
    const guardHooks = makeGuardHooks(spec, getSession as () => LoopRunSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tools: Record<string, any>;
    if (nativeToolsMode) {
      tools = { ...config.tools, ...buildTerminalTools(getSession as () => LoopRunSession) };
    } else {
      tools = buildWorldTools(config.toolDefs ?? [], surface, getSession as () => LoopRunSession);
    }

    // Static default instructions (Studio/introspection); each governed turn passes the exact
    // per-turn variant via the per-execution `instructions` override.
    const staticWorld: AgentWorld = {
      exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [],
    };
    const renderPrompt = spec.surface.systemPrompt
      ? (w: AgentWorld, u: string[]) => spec.surface.systemPrompt!(w, u)
      : (w: AgentWorld, u: string[]) => renderScopedSpecTrunk(w, spec, u, theme);
    const terminalOn = config.terminalProtocol !== false;
    const staticInstructions = renderPrompt(staticWorld, []) + (terminalOn ? terminalProtocol(false) : '');

    // Pass through any further Agent option (memory, description, processors, …).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passthrough: Record<string, any> = {};
    for (const [k, v] of Object.entries(config)) if (!LOOPRUN_KEYS.has(k)) passthrough[k] = v;

    super({
      id: config.id ?? spec.id,
      name: config.name ?? config.id ?? spec.id,
      instructions: staticInstructions,
      model: config.model,
      tools,
      // Agent-level hooks: defense in depth — guards enforce on EVERY execution path (Studio
      // stream included), not only through the governed generate() below.
      hooks: guardHooks,
      ...passthrough,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    this.spec = spec;
    this.theme = theme;
    this.terminalProtocolOn = terminalOn;
    this.sessions = sessions;
    this.nativeToolsMode = nativeToolsMode;
    this.surface = surface;
    this.modelParams = config.modelParams ?? {};
    this.maxStepsResolved = spec.controls.maxSteps ?? config.maxSteps ?? DEFAULT_MAX_STEPS;
    this.redrivesResolved = spec.controls.redrives ?? config.redrives ?? DEFAULT_REDRIVES;
    this.guardHooks = guardHooks;
    this.inputProcessorsResolved = makeInputProcessors(spec, getSession as () => LoopRunSession);
    this.renderPrompt = renderPrompt;
  }

  /** Read a session's state (world/ledger/turnIndex) — hosts and tests. */
  getSession(id = 'default'): LoopRunSession<W> {
    return this.sessions.get(id);
  }

  /** Dispose a conversation's state. */
  endSession(id = 'default'): void {
    this.sessions.end(id);
  }

  private resolveSessionId(options?: LoopRunOptions): string {
    const explicit = options?.loopRun?.sessionId;
    if (explicit) return explicit;
    const thread = (options as { memory?: { thread?: string | { id?: string } } } | undefined)?.memory?.thread;
    if (typeof thread === 'string') return thread;
    if (thread && typeof thread === 'object' && thread.id) return String(thread.id);
    return 'default';
  }

  /**
   * One governed turn. Pass the user's message as a string (recommended); the volatile world
   * state rides the message tail, the reply comes back as the result's `.text` with `.looprun`
   * metadata attached.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async generate(messages: any, options?: LoopRunOptions): Promise<any> {
    const session = this.sessions.get(this.resolveSessionId(options));
    return this.sessions.run(session, async () => {
      const prevActive = this.active;
      this.active = session;
      try {
        return await this.governedTurn(session, messages, options);
      } finally {
        this.active = prevActive;
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async governedTurn(session: LoopRunSession<W>, input: any, options?: LoopRunOptions): Promise<any> {
    const { spec, theme } = this;
    const { world, ledger } = session;
    const useMemory = !!options?.memory;

    if (session.turnIndex > 0) world.advanceTurn();
    beginTurn(ledger, session.turnIndex);

    const attUrls = options?.loopRun?.attachments ?? [];
    const attLabels = attUrls.map((u) => world.ingestAttachment(u));
    ledger.attachments = attLabels;
    const attDisplay = attLabels.map((l, k) => {
      const base = attUrls[k]?.split('/').pop();
      return base ? `${l} (${base})` : l;
    });

    const userText = typeof input === 'string' ? input : null;
    if (userText === null && !Array.isArray(input)) {
      throw new Error('LoopRunAgent.generate: pass the user message as a string (or a messages array).');
    }

    const replyOnly = spec.controls.terminal ? spec.controls.terminal(world) === true : false;
    const activeTools = this.nativeToolsMode
      ? [...Object.keys((this as unknown as { tools: Record<string, unknown> }).tools ?? {}), ...(replyOnly ? ['replyToUser'] : ['replyToUser', 'askUser'])]
      : (replyOnly ? [...this.surface, 'replyToUser'] : [...this.surface, 'replyToUser', 'askUser']);

    const instructions = this.renderPrompt(world, attLabels) + (this.terminalProtocolOn ? terminalProtocol(replyOnly) : '');

    // State-in-tail: volatile state + uploads ride the user message, after the stable prefix.
    const stateBlock = theme ? theme.stateBlock(world) : '';
    const tailParts: string[] = [];
    if (stateBlock && stateBlock.trim()) tailParts.push(`## Account state\n${stateBlock}`);
    if (attLabels.length) tailParts.push(`[Uploads this turn: ${attDisplay.join(', ')}]`);
    if (userText !== null) tailParts.push(userText);
    const userContent = tailParts.join('\n\n');

    // Conversation history: Mastra memory owns it when configured; otherwise the session keeps it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let msgs: any;
    if (userText !== null) {
      if (useMemory) {
        msgs = userContent;
      } else {
        session.messages.push({ role: 'user', content: userContent });
        msgs = session.messages;
      }
    } else {
      msgs = input; // caller-managed messages array — used as-is
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passOpts: Record<string, any> = {};
    for (const [k, v] of Object.entries(options ?? {})) if (k !== 'loopRun') passOpts[k] = v;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const terminalCalled = ({ steps }: any): boolean => {
      const last = steps?.[steps.length - 1];
      for (const tc of (last?.toolCalls ?? [])) if (isTerminal(tc.toolName ?? tc.name ?? '')) return true;
      return false;
    };

    const protocolOpts = this.terminalProtocolOn
      ? { toolChoice: 'required', stopWhen: [stepCountIs(this.maxStepsResolved), terminalCalled] }
      : { stopWhen: [stepCountIs(this.maxStepsResolved)] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const full: any = await (Agent.prototype.generate as any).call(this, msgs, {
      instructions,
      activeTools,
      ...protocolOpts,
      hooks: this.guardHooks,
      ...(this.inputProcessorsResolved ? { inputProcessors: this.inputProcessorsResolved } : {}),
      ...this.modelParams,
      ...passOpts,
    });
    if (!useMemory && userText !== null && full.response?.messages) session.messages.push(...full.response.messages);

    // Forced-terminal fallback (terminal protocol only).
    if (this.terminalProtocolOn && !ledger.terminalReply.trim()) {
      const fbTools = replyOnly ? ['replyToUser'] : ['replyToUser', 'askUser'];
      const fbMsgs = useMemory || userText === null
        ? forcedTerminalPrompt(replyOnly)
        : [...session.messages, { role: 'user', content: forcedTerminalPrompt(replyOnly) }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fb: any = await (Agent.prototype.generate as any).call(this, fbMsgs, {
        instructions,
        activeTools: fbTools,
        toolChoice: 'required',
        stopWhen: [stepCountIs(2), terminalCalled],
        hooks: this.guardHooks,
        ...this.modelParams,
        ...(useMemory ? { memory: passOpts.memory } : {}),
      });
      if (!useMemory && userText !== null && fb.response?.messages) session.messages.push(...fb.response.messages);
      ledger.turnCorrections.push('forced-terminal');
    }

    const initialText: string = full?.tripwire
      ? String(full.tripwireReason ?? full.reason ?? '')
      : (this.terminalProtocolOn ? (ledger.terminalReply || full.text || '') : (full.text || ''));

    const finalized = await finalizeReply(
      spec,
      theme,
      world,
      ledger,
      initialText,
      async (message) => {
        const reMsgs = useMemory || userText === null
          ? message
          : [...session.messages, { role: 'user', content: message }];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const re: any = await (Agent.prototype.generate as any).call(this, reMsgs, {
          instructions,
          toolChoice: 'none',
          activeTools: [],
          ...this.modelParams,
          ...(useMemory ? { memory: passOpts.memory } : {}),
        });
        if (!useMemory && userText !== null && re.text) session.messages.push({ role: 'assistant', content: re.text });
        return re.text ?? '';
      },
      this.redrivesResolved,
    );

    const meta: LoopRunResultMeta = {
      sessionId: session.id,
      turnIndex: session.turnIndex,
      corrections: ledger.turnCorrections.slice(),
      exhausted: finalized.exhausted,
      violations: finalized.violations,
      observed: ledger.observed.filter((o) => o.turnIndex === session.turnIndex),
    };
    session.turnIndex += 1;

    // Return the LAST Mastra result object with the governed text + looprun meta attached.
    full.text = finalized.text;
    full.looprun = meta;
    return full;
  }

  /**
   * Streaming: tool-level governance (guard hooks + terminal protocol + activeTools + per-turn
   * instructions). Reply finalization (mutators/redrive/exhaustion) needs generate() — with the
   * terminal protocol ON the user text arrives via the terminal tool call, so nothing ungoverned
   * streams as text.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async stream(messages: any, options?: LoopRunOptions): Promise<any> {
    const session = this.sessions.get(this.resolveSessionId(options));
    const prevActive = this.active;
    this.active = session;
    try {
      const { world, ledger } = session;
      if (session.turnIndex > 0) world.advanceTurn();
      beginTurn(ledger, session.turnIndex);
      session.turnIndex += 1;
      const replyOnly = this.spec.controls.terminal ? this.spec.controls.terminal(world) === true : false;
      const instructions = this.renderPrompt(world, []) + (this.terminalProtocolOn ? terminalProtocol(replyOnly) : '');
      const activeTools = this.nativeToolsMode
        ? undefined
        : (replyOnly ? [...this.surface, 'replyToUser'] : [...this.surface, 'replyToUser', 'askUser']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passOpts: Record<string, any> = {};
      for (const [k, v] of Object.entries(options ?? {})) if (k !== 'loopRun') passOpts[k] = v;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (Agent.prototype.stream as any).call(this, messages, {
        instructions,
        ...(activeTools ? { activeTools } : {}),
        hooks: this.guardHooks,
        ...(this.inputProcessorsResolved ? { inputProcessors: this.inputProcessorsResolved } : {}),
        ...this.modelParams,
        ...passOpts,
      });
    } finally {
      // Streaming continues after return; the active pointer must survive for tool execution.
      // It is reset on the next generate()/stream() call. (Single-session Studio usage is safe.)
      if (prevActive) this.active = prevActive;
    }
  }
}

/** Factory form (composition-friendly alias of `new LoopRunAgent(config)`). */
export function createLoopRunAgent<W extends AgentWorld = AgentWorld>(config: LoopRunAgentConfig<W>): LoopRunAgent<W> {
  return new LoopRunAgent(config);
}
