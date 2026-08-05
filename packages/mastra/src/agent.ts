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
 * stream(): tool-level governance only (guard hooks + terminal protocol + activeTools) PLUS turn
 * sealing — the turn is recorded into history when the stream finishes, so a question really asked
 * while streaming still licenses the user's next-turn answer and the turn is auditable. Reply
 * finalization (mutators/redrive/exhaustion) requires generate() — documented degraded mode.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { stepCountIs } from 'ai';
import { Agent } from '@mastra/core/agent';
import type { AgentSpec, AgentWorld, ObservedCall, ToolDef, DomainContract, Judge } from '@looprun-ai/core';
import {
  assertJudgePresent,
  beginTurn,
  clearDeliveredTerminal,
  finalizeReply,
  forcedTerminalPrompt,
  isTerminal,
  lastTerminalArgs,
  normalizeModelParams,
  prematureTerminalCalls,
  prematureTerminalTools,
  pruneSupersededTerminals,
  recordTurnHistory,
  resolveModelSettings,
  respondPayload,
  runChainCompletionPass,
  supersededTerminalCalls,
  vetoStormHit,
  renderTurnPrompt,
} from '@looprun-ai/core/internal';
import type { RespondPayload } from '@looprun-ai/core/internal';
import { resolveConstruction } from './agent-construction.js';
import { judgeOptions, judgeText } from './judge.js';
import { SessionStore } from './session.js';
import type { LoopRunSession, WorldFactory } from './session.js';
import { makeGuardHooks, makeInputProcessors, repeatedToolCallStop } from './hooks.js';
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
   * NATIVE-TOOLS mode (Path B, incl. MCP): pass Mastra tools (e.g. `await mcp.listTools()`).
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
  /** The host-registered LLM judge for `llmCheck` guards — the model seam, NEVER named in the
   *  spec/config (like defineWorld's custom executors). Threaded into every session's GuardCtx. A spec
   *  that installs an llmCheck with this absent throws at construction (assertJudgePresent). */
  judge?: Judge;
  /** Per-call judge timeout (ms) — a hung judge resolves via failMode past this deadline.
   *  Default 30000 (the guard's own). Beside the judge at the seam; the config surface is untouched. */
  judgeTimeoutMs?: number;
  /** The certified turn shape (terminal tools + toolChoice:'required'). Default true. */
  terminalProtocol?: boolean;
  /** Certification drift gate: the expected `surfaceFingerprint()` of the RESOLVED active
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

/**
 * The governed-turn metadata attached to every result as `result.looprun`. Module-local: an
 * `internal` verdict (inventory §7.2) on a package with no `/internal` subpath.
 *
 * MIRRORED by `LoopRunResultMeta` in `packages/server/src/types.ts` (the one cross-package reader,
 * which cannot import this). Change a field here and change it there;
 * `packages/server/test/meta-mirror.test.ts` fails the typecheck if the two drift apart.
 */
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
    // `getSession` is a closure over `this` — legal before super() because it is only CALLED at
    // turn time, and the construction resolver merely stores it in the tools it builds.
    const getSession = () => {
      const s = this.turnContext.getStore();
      if (!s) throw new Error('looprun: tool executed outside a governed turn');
      return s;
    };
    const built = resolveConstruction<W>(config, getSession as () => LoopRunSession);
    const { contract, nativeToolsMode, surface, terminalOn } = built;
    // FAIL-LOUD-AT-START: an llmCheck installed without a judge is a wiring bug — surface it at
    // construction, never mid-turn. No-op for a spec with no llmCheck (zero-diff).
    assertJudgePresent(spec, config.judge);
    const sessions = new SessionStore<W>(built.world, config.judge, config.judgeTimeoutMs, {
      renderClaim: contract?.renderClaim,
      outcomes: contract?.outcomes,
    });
    const guardHooks = makeGuardHooks(spec, getSession as () => LoopRunSession, { nativeToolsMode });

    super({
      id: config.id ?? spec.id,
      name: config.name ?? config.id ?? spec.id,
      instructions: built.staticInstructions,
      model: config.model,
      tools: built.tools,
      // Agent-level hooks: defense in depth — guards enforce on EVERY execution path (Studio
      // stream included), not only through the governed generate() below.
      hooks: guardHooks,
      ...built.passthrough,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    this.spec = spec;
    this.contract = contract;
    this.terminalProtocolOn = terminalOn;
    this.sessions = sessions;
    this.nativeToolsMode = nativeToolsMode;
    this.nativeToolNames = built.nativeToolNames;
    this.nativeActiveNames = built.nativeActiveNames;
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

    const userText = typeof input === 'string' ? input : null;
    if (userText === null && !Array.isArray(input)) {
      throw new Error('LoopRunAgent.generate: pass the user message as a string (or a messages array).');
    }
    beginTurn(ledger, session.turnIndex, userText ?? '');

    const attUrls = options?.loopRun?.attachments ?? [];
    const attLabels = attUrls.map((u) => world.ingestAttachment(u));
    ledger.attachments = attLabels;

    // ONE producer for the bytes this turn sends (core/runtime/prompt.ts) — the same function the
    // offline margin instruments render through, so a replay can never feed on a prompt nothing runs.
    const { instructions, userContent, replyOnly } = renderTurnPrompt({
      spec, contract, world, userText, uploadLabels: attLabels, uploadUrls: attUrls,
      terminalProtocol: this.terminalProtocolOn,
    });

    // ONE terminal (`respond`); asking is a `did` INTENTION, not a tool — the reply-only policy
    // rides the protocol prose (terminalProtocol(replyOnly)), not the tool set.
    const activeTools = this.nativeToolsMode
      ? [...this.nativeActiveNames, 'respond']
      : [...this.surface, 'respond'];

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
        // Clear the WHOLE delivered declaration (text + did): an invalidated terminal's `did` is an
        // equally-premature claim the cross-check guards must not ground against.
        clearDeliveredTerminal(ledger);
        ledger.turnCorrections.push(`premature-terminal:${[...new Set(premature)].join(',')}`);
      }
      // …and drop the invalidated terminal's OBSERVATION too: clearing the captured
      // declaration leaves the hook-time `observed` push in place, where a `did` carrying an `ask`
      // intention reads — this turn and every later one — as a question the user answered. It never
      // reached them. Runs unconditionally: a premature terminal is never delivered, whatever its message.
      const prunedPremature = pruneSupersededTerminals(ledger, prematureTerminalCalls(full.steps));
      if (prunedPremature.length) ledger.turnCorrections.push(`premature-terminal-pruned:${[...new Set(prunedPremature)].join(',')}`);
      // Terminals that lost the delivery contest are not evidence of anything the user saw.
      const pruned = pruneSupersededTerminals(ledger, supersededTerminalCalls(full.steps));
      if (pruned.length) ledger.turnCorrections.push(`superseded-terminal:${[...new Set(pruned)].join(',')}`);
    }

    // Forced-terminal fallback (terminal protocol only).
    if (this.terminalProtocolOn && !ledger.terminalReply.trim()) {
      const fbTools = ['respond'];
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
    // The DELIVERED terminal's structured declaration (recordTerminal seated `did`); a tripwire /
    // free-text fallback carries the empty declaration beginTurn reset.
    const initial: RespondPayload = { message: initialText, did: ledger.did };

    const finalized = await finalizeReply(
      spec,
      contract,
      world,
      ledger,
      initial,
      async (message) => {
        const reMsgs = useMemory || userText === null
          ? message
          : [...session.messages, { role: 'user', content: message }];
        // A redrive re-generates ONE respond (tools disabled except respond, toolChoice pinned) — the
        // candidate returns as a STRUCTURED payload. It is NOT persisted: snapshot the ledger and restore
        // it, so a rejected draft's respond never enters observed/history (the recorded terminal + any
        // hook push are rolled back; finalizeReply re-seats `did` from the returned payload).
        const obsLen = ledger.observed.length;
        const snap = { terminalReply: ledger.terminalReply, did: ledger.did };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const re: any = await (Agent.prototype.generate as any).call(this, reMsgs, {
          instructions,
          activeTools: ['respond'],
          toolChoice: 'required',
          stopWhen: [stepCountIs(2), terminalCalled],
          hooks: this.guardHooks,
          ...this.modelParams,
          ...(useMemory ? { memory: passOpts.memory } : {}),
        });
        ledger.observed.length = obsLen;
        ledger.terminalReply = snap.terminalReply;
        ledger.did = snap.did;
        const args = lastTerminalArgs(re.steps);
        return args ? respondPayload(args) : { message: typeof re.text === 'string' ? re.text : '', did: [] };
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
    // Seal this turn into the conversation history so the NEXT turn's guards see it (user text incl.).
    recordTurnHistory(ledger, finalized.text, world);
    session.turnIndex += 1;

    // Return the LAST Mastra result object with the governed text + looprun meta attached.
    full.text = finalized.text;
    full.looprun = meta;
    return full;
  }

  /**
   * Streaming: tool-level governance (guard hooks + terminal protocol + activeTools + per-turn
   * instructions) plus TURN SEALING on stream completion. Reply finalization (mutators/redrive/
   * exhaustion) needs generate() — with the terminal protocol ON the user text arrives via the
   * terminal tool call, so nothing ungoverned streams as text.
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
      const { instructions } = renderTurnPrompt({
        spec: this.spec, contract: this.contract, world, userText: null,
        terminalProtocol: this.terminalProtocolOn,
        // The stream path consumes only the instructions — Mastra owns the message array here, so
        // the tail this would build is discarded. Not computing it keeps the state block off a
        // path that never renders it.
        instructionsOnly: true,
      });
      const activeTools = this.nativeToolsMode
        ? [...this.nativeActiveNames, 'respond']
        : [...this.surface, 'respond'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passOpts: Record<string, any> = {};
      for (const [k, v] of Object.entries(options ?? {})) if (k !== 'loopRun') passOpts[k] = v;
      // SEAL THE STREAMED TURN. This path advances `turnIndex` and feeds `observed` through the guard
      // hooks, so without a `recordTurnHistory` call the turn would stay permanently UNSEALED. The
      // cross-turn ask signal is history-only (`askedInDeliveredTurn`), so an unsealed turn fails
      // CLOSED — and closed is an availability bug here: a question the user really was asked while
      // streaming must still license the answer they give in the next turn, and the turn must be
      // auditable.
      // What is sealed is what the terminal tool captured (`terminalReply` + its `did`) — the stream
      // path runs no reply finalization by design, so there is nothing later to reconcile.
      // A stream nobody consumes never finishes and is never sealed: it licenses nothing, which is the
      // correct reading of a turn that was thrown away.
      const callerOnFinish = passOpts.onFinish;
      delete passOpts.onFinish;
      let sealed = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onFinish = async (event: any): Promise<void> => {
        if (!sealed) {
          sealed = true;
          recordTurnHistory(ledger, ledger.terminalReply, world);
        }
        if (typeof callerOnFinish === 'function') await callerOnFinish(event);
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (Agent.prototype.stream as any).call(this, messages, {
        instructions,
        ...(activeTools ? { activeTools } : {}),
        hooks: this.guardHooks,
        ...(this.inputProcessorsResolved ? { inputProcessors: this.inputProcessorsResolved } : {}),
        ...this.modelParams,
        ...passOpts,
        onFinish,
      });
    });
  }
}
