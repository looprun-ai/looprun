/**
 * @looprun-ai/mastra — LoopRunAgent: a GENUINE @mastra/core Agent compiled from an AgentSpec.
 *
 * The shape mirrors `new Agent({...})`:
 *
 *   export const booksAgent = new LoopRunAgent({
 *     spec: bookkeepingSpec,          // carries its domain contract reference
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
import { AsyncLocalStorage } from 'node:async_hooks';
import { stepCountIs } from 'ai';
import { Agent } from '@mastra/core/agent';
import { validateSpec } from '@looprun-ai/core';
import type { AgentSpec, AgentWorld, ObservedCall, ToolDef, DomainContract } from '@looprun-ai/core';
import {
  beginTurn,
  finalizeReply,
  forcedTerminalPrompt,
  isTerminal,
  normalizeModelParams,
  prematureTerminalTools,
  pruneSupersededTerminals,
  resolveModelSettings,
  runChainCompletionPass,
  supersededTerminalCalls,
  vetoStormHit,
  renderTurnPrompt,
} from '@looprun-ai/core/internal';
import { SessionStore } from './session.js';
import type { LoopRunSession, WorldFactory } from './session.js';
import { buildWorldTools, buildTerminalTools } from './tools.js';
import { makeGuardHooks, makeInputProcessors, repeatedToolCallStop } from './hooks.js';
import { worldFromTools } from './world-adapters.js';
import { surfaceFingerprint } from './surface.js';
import type { StateView } from './world-adapters.js';
import { DEFAULT_MAX_STEPS, DEFAULT_REDRIVES } from './run-conversation.js';

export interface LoopRunAgentConfig<W extends AgentWorld = AgentWorld> {
  /** The governed AgentSpec (id/persona/tools/guards/controls/behavior). */
  spec: AgentSpec;
  /** Domain contract override; defaults to `spec.contract`. */
  contract?: DomainContract;
  /**
   * The world seam — a deterministic instance (single conversation) or a factory
   * `(sessionId) => world` for multi-session hosts. Omit it in native-tools mode (`tools`).
   */
  world?: W | WorldFactory<W>;
  /**
   * NATIVE-TOOLS mode (Path B, incl. MCP): pass Mastra tools (e.g. `await mcp.getTools()`).
   * They execute themselves; guards still enforce through the agent hooks. Mutually exclusive
   * with `world`+`toolDefs`. Stateful guards + contract.stateBlock read `stateView`.
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
  /** Stop the generation on the first repeated (tool+args) call — enable for LOCAL models
   *  — a small model that loops is either stuck or retrying unchanged. Default false. */
  stopOnRepeatedToolCall?: boolean;
  /** The certified turn shape (terminal tools + toolChoice:'required'). Default true. */
  terminalProtocol?: boolean;
  /** Certification drift gate: the expected {@link surfaceFingerprint} of the RESOLVED active
   *  surface (post spec∩host intersection, with schemas when available). When set, a mismatch at
   *  construction THROWS — the surface drifted since certification, so the seal is void. */
  expectedSurfaceHash?: string;
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
  'spec', 'contract', 'world', 'tools', 'stateView', 'toolDefs', 'model', 'modelParams',
  'terminalProtocol', 'maxSteps', 'redrives', 'strict', 'id', 'name', 'expectedSurfaceHash',
]);

export class LoopRunAgent<W extends AgentWorld = AgentWorld> extends Agent {
  readonly spec: AgentSpec;
  readonly contract?: DomainContract;
  readonly terminalProtocolOn: boolean;
  private readonly sessions: SessionStore<W>;
  private readonly nativeToolsMode: boolean;
  private readonly nativeToolNames: string[];
  /** Native mode: the RESOLVED active surface = host tools ∩ spec.surface.tools (deny-by-default). */
  private readonly nativeActiveNames: string[];
  private readonly surface: Set<string>;
  private readonly modelParams: Record<string, unknown>;
  private readonly stopOnRepeatedToolCall: boolean;
  private readonly maxStepsResolved: number;
  private readonly redrivesResolved: number;
  private readonly guardHooks: ReturnType<typeof makeGuardHooks>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly inputProcessorsResolved: any[] | undefined;
  /** Per-turn session context: tools/hooks resolve the CURRENT turn's session through this —
   *  AsyncLocalStorage, so concurrent turns on different sessions can never cross-execute. */
  private readonly turnContext = new AsyncLocalStorage<LoopRunSession<W>>();

  constructor(config: LoopRunAgentConfig<W>) {
    const { spec } = config;
    const contract = config.contract ?? spec.contract;
    if (!contract && !spec.surface.systemPrompt) {
      throw new Error(`LoopRunAgent "${spec.id}": no contract — pass config.contract or set spec.contract.`);
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
      const s = this.turnContext.getStore();
      if (!s) throw new Error('looprun: tool executed outside a governed turn');
      return s;
    };

    const surface = new Set(spec.surface.tools);
    const guardHooks = makeGuardHooks(spec, getSession as () => LoopRunSession);
    const nativeToolNames = Object.keys(config.tools ?? {});
    // Native/MCP mode enforces the spec's RATIFIED surface, deny-by-default:
    //  · a host/MCP tool the surface does not list is NEVER registered or active (one loud
    //    console.error names the exclusions — governance must be visible, not silent);
    //  · a surface tool the host does NOT provide throws — the spec promises a capability the
    //    host lacks, and a broken bundle must not run quiet.
    const nativeActiveNames = nativeToolNames.filter((t) => surface.has(t));
    if (nativeToolsMode) {
      const unprovided = spec.surface.tools.filter((t) => !nativeToolNames.includes(t));
      if (unprovided.length) {
        throw new Error(
          `LoopRunAgent "${spec.id}": spec.surface.tools promise capabilities the host does not provide: ` +
            `${unprovided.join(', ')}. Register those tools or remove them from the spec's surface.`,
        );
      }
      const excluded = nativeToolNames.filter((t) => !surface.has(t));
      if (excluded.length) {
        console.error(
          `[looprun] LoopRunAgent "${spec.id}": ${excluded.length} host-registered tool(s) are NOT in ` +
            `spec.surface.tools and will never be active (deny-by-default): ${excluded.join(', ')}. ` +
            `Add them to the spec's surface (and re-certify) if the agent should have them.`,
        );
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tools: Record<string, any>;
    if (nativeToolsMode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admitted: Record<string, any> = {};
      for (const t of nativeActiveNames) admitted[t] = config.tools![t];
      tools = { ...admitted, ...buildTerminalTools(getSession as () => LoopRunSession) };
    } else {
      tools = buildWorldTools(config.toolDefs ?? [], surface, getSession as () => LoopRunSession);
    }

    // Certification drift gate: fingerprint the RESOLVED active surface (post-intersection, with
    // schemas when available) and compare against the certified hash — a mismatch voids the seal.
    if (config.expectedSurfaceHash) {
      const resolvedNames = nativeToolsMode ? nativeActiveNames : spec.surface.tools;
      const schemaOf = (name: string): unknown =>
        nativeToolsMode
          ? config.tools![name]?.inputSchema
          : (config.toolDefs ?? []).find((d) => d.name === name)?.inputSchema;
      const actual = surfaceFingerprint(resolvedNames, resolvedNames.map(schemaOf));
      if (actual !== config.expectedSurfaceHash) {
        throw new Error(
          `LoopRunAgent "${spec.id}": surface drifted since certification — seal void; re-certify. ` +
            `expected ${config.expectedSurfaceHash}, resolved surface fingerprints to ${actual}.`,
        );
      }
    }

    // Static default instructions (Studio/introspection); each governed turn passes the exact
    // per-turn variant via the per-execution `instructions` override.
    const staticWorld: AgentWorld = {
      exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [],
    };
    const terminalOn = config.terminalProtocol !== false;
    const staticInstructions = renderTurnPrompt({
      spec, contract, world: staticWorld, userText: null, terminalProtocol: terminalOn,
      // NOTHING here may interrogate the stub world. The terminal policy is pinned (the static
      // prompt has always rendered the full protocol, and that byte identity is load-bearing), and
      // the state block is skipped outright — it is business code reading business state, and this
      // world has none. Asking it anyway throws at construction for every real contract.
      replyOnly: false,
      instructionsOnly: true,
    }).instructions;

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
    this.contract = contract;
    this.terminalProtocolOn = terminalOn;
    this.sessions = sessions;
    this.nativeToolsMode = nativeToolsMode;
    this.nativeToolNames = nativeToolNames;
    this.nativeActiveNames = nativeActiveNames;
    this.surface = surface;
    // Normalize once at the seam: flat AI-SDK call settings (temperature, maxOutputTokens, …) are
    // folded into `modelSettings` — Mastra silently drops them when spread top-level (measured
    // a flat spread ran local models with the GGUF sampler — temp 1.0, no token cap).
    // Then the spec's per-agent sampling merged OVER them (agent wins) — constant for this agent.
    this.modelParams = resolveModelSettings(normalizeModelParams(config.modelParams ?? {}), spec.controls.sampling);
    this.stopOnRepeatedToolCall = config.stopOnRepeatedToolCall ?? false;
    this.maxStepsResolved = spec.controls.maxSteps ?? config.maxSteps ?? DEFAULT_MAX_STEPS;
    this.redrivesResolved = spec.controls.redrives ?? config.redrives ?? DEFAULT_REDRIVES;
    this.guardHooks = guardHooks;
    this.inputProcessorsResolved = makeInputProcessors(spec, getSession as () => LoopRunSession);
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
    return this.sessions.run(session, () =>
      this.turnContext.run(session, () => this.governedTurn(session, messages, options)),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async governedTurn(session: LoopRunSession<W>, input: any, options?: LoopRunOptions): Promise<any> {
    const { spec, contract } = this;
    const { world, ledger } = session;
    const useMemory = !!options?.memory;

    if (session.turnIndex > 0) world.advanceTurn();
    beginTurn(ledger, session.turnIndex);

    const attUrls = options?.loopRun?.attachments ?? [];
    const attLabels = attUrls.map((u) => world.ingestAttachment(u));
    ledger.attachments = attLabels;

    const userText = typeof input === 'string' ? input : null;
    if (userText === null && !Array.isArray(input)) {
      throw new Error('LoopRunAgent.generate: pass the user message as a string (or a messages array).');
    }

    // ONE producer for the bytes this turn sends (core/runtime/prompt.ts) — the same function the
    // offline margin instruments render through, so a replay can never feed on a prompt nothing runs.
    const { instructions, userContent, replyOnly } = renderTurnPrompt({
      spec, contract, world, userText, uploadLabels: attLabels, uploadUrls: attUrls,
      terminalProtocol: this.terminalProtocolOn,
    });

    const activeTools = this.nativeToolsMode
      ? [...this.nativeActiveNames, ...(replyOnly ? ['replyToUser'] : ['replyToUser', 'askUser'])]
      : (replyOnly ? [...this.surface, 'replyToUser'] : [...this.surface, 'replyToUser', 'askUser']);

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

    const repeatStop = this.stopOnRepeatedToolCall ? [repeatedToolCallStop] : [];
    const protocolOpts = this.terminalProtocolOn
      ? { toolChoice: 'required', stopWhen: [stepCountIs(this.maxStepsResolved), terminalCalled, () => vetoStormHit(session.ledger), ...repeatStop] }
      : { stopWhen: [stepCountIs(this.maxStepsResolved), () => vetoStormHit(session.ledger), ...repeatStop] };

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

    // The closing step must be TERMINAL-ONLY. A terminal that shared its step with a domain call was
    // composed BEFORE that call's result existed, so its text cannot be reporting it. Invalidate it;
    // the forced-terminal fallback right below re-closes the turn on a history that now carries the
    // tool RESULTS.
    if (this.terminalProtocolOn) {
      const premature = prematureTerminalTools(full.steps);
      if (premature.length && ledger.terminalReply.trim()) {
        ledger.terminalReply = '';
        ledger.turnCorrections.push(`premature-terminal:${[...new Set(premature)].join(',')}`);
      }
      // Terminals that lost the delivery contest are not evidence of anything the user saw.
      const pruned = pruneSupersededTerminals(ledger, supersededTerminalCalls(full.steps));
      if (pruned.length) ledger.turnCorrections.push(`superseded-terminal:${[...new Set(pruned)].join(',')}`);
    }

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

    // flowChain completion — AFTER main + forced-terminal, BEFORE the onReply checks. ZERO-DIFF: gated
    // on `spec.controls.chains?.length`, so a chain-free turn builds nothing.
    if (spec.controls.chains?.length) {
      const chainPass = await runChainCompletionPass(spec.controls.chains, {
        world,
        observed: ledger.observed,
        turnIndex: session.turnIndex,
        terminalReplyPresent: ledger.terminalReply.trim().length > 0,
        beforeToolCall: this.guardHooks.beforeToolCall,
        afterToolCall: this.guardHooks.afterToolCall,
        forceLlmCall: async (call: string) => {
          const ccMsgs = useMemory || userText === null
            ? `Complete the required follow-up now: call ${call} with the correct arguments for what the user asked. Do not reply in text.`
            : [...session.messages, { role: 'user', content: `Complete the required follow-up now: call ${call} with the correct arguments for what the user asked. Do not reply in text.` }];
          // FORCING: single active tool + toolChoice:'required' — llama-server ignores the named
          // `{ type:'tool', toolName }` form and degrades to free text; this is the portable form.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cc: any = await (Agent.prototype.generate as any).call(this, ccMsgs, {
            instructions, activeTools: [call], toolChoice: 'required', stopWhen: [stepCountIs(2)],
            hooks: this.guardHooks, ...this.modelParams, ...(useMemory ? { memory: passOpts.memory } : {}),
          });
          if (!useMemory && userText !== null && cc.response?.messages) session.messages.push(...cc.response.messages);
        },
      });
      if (chainPass.corrections.length) ledger.turnCorrections.push(...chainPass.corrections);
      if (chainPass.replyViolations.length) ledger.postToolViolations.push(...chainPass.replyViolations);
    }

    // The terminal reply wins even with the protocol OFF — the terminal tools stay registered, and
    // a model that used one produced a real answer that `full.text` won't carry.
    const initialText: string = full?.tripwire
      ? String(full.tripwireReason ?? full.reason ?? '')
      : (ledger.terminalReply || full.text || '');

    const finalized = await finalizeReply(
      spec,
      contract,
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
        // Candidates are NOT persisted here — a rejected draft must never enter the history.
        return re.text ?? '';
      },
      this.redrivesResolved,
    );

    // History reconciliation: when the pipeline changed the outgoing text (mutator / redrive /
    // exhaustion), append the reply the user ACTUALLY received — the model must never see a draft
    // it "said" but the user never got.
    if (!useMemory && userText !== null && finalized.text && finalized.text !== initialText) {
      session.messages.push({ role: 'assistant', content: finalized.text });
    }

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
    // The whole stream (including tool executions that happen while the consumer iterates) runs
    // inside the session's AsyncLocalStorage context — no shared mutable pointer, no cross-session
    // execution.
    return this.turnContext.run(session, async () => {
      const { world, ledger } = session;
      if (session.turnIndex > 0) world.advanceTurn();
      beginTurn(ledger, session.turnIndex);
      session.turnIndex += 1;
      const { instructions, replyOnly } = renderTurnPrompt({
        spec: this.spec, contract: this.contract, world, userText: null,
        terminalProtocol: this.terminalProtocolOn,
        // The stream path consumes only the instructions — Mastra owns the message array here, so
        // the tail this would build is discarded. Not computing it keeps the state block off a
        // path that never renders it.
        instructionsOnly: true,
      });
      const activeTools = this.nativeToolsMode
        ? [...this.nativeActiveNames, ...(replyOnly ? ['replyToUser'] : ['replyToUser', 'askUser'])]
        : (replyOnly ? [...this.surface, 'replyToUser'] : [...this.surface, 'replyToUser', 'askUser']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passOpts: Record<string, any> = {};
      for (const [k, v] of Object.entries(options ?? {})) if (k !== 'loopRun') passOpts[k] = v;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (Agent.prototype.stream as any).call(this, messages, {
        instructions,
        ...(activeTools ? { activeTools } : {}),
        hooks: this.guardHooks,
        ...(this.inputProcessorsResolved ? { inputProcessors: this.inputProcessorsResolved } : {}),
        ...this.modelParams,
        ...passOpts,
      });
    });
  }
}

/** Factory form (composition-friendly alias of `new LoopRunAgent(config)`). */
export function createLoopRunAgent<W extends AgentWorld = AgentWorld>(config: LoopRunAgentConfig<W>): LoopRunAgent<W> {
  return new LoopRunAgent(config);
}
