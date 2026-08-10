/**
 * @looprun-ai/mastra — scripted multi-turn conversation runner (the eval/batch surface).
 *
 * Governance → idiomatic Mastra primitives:
 *   preTool guards   → `hooks.beforeToolCall` → { proceed:false, output } veto
 *   observed action history  → `hooks.afterToolCall`
 *   onInput guards   → an `inputProcessors` entry (processInput → abort ⇒ turn refused, no LLM call)
 *   surface scoping  → `activeTools` = spec.surface.tools (+ the `respond` terminal)
 *   force-terminal   → the single `respond` tool + `toolChoice:'required'` + `stopWhen(terminalCalled)`
 *                      + a forced-terminal fallback (pushes a weak model past the action wall)
 *   onReply guards   → runtime finalization: a bounded redrive that re-generates ONE respond (respond-only,
 *                      toolChoice pinned), then mutators + honest-abstain. NOT a processor `abort({retry:true})`, which
 *                      re-runs the whole generation + re-executes side-effecting tools (measured:
 *                      ~100× slower).
 *
 * State-in-tail: the system prompt is the case-invariant scoped assembled prompt (cacheable prefix); the
 * volatile account/brand STATE (`contract.stateBlock`) rides the USER MESSAGE tail.
 */
import { stepCountIs } from 'ai';
import { Agent } from '@mastra/core/agent';
import {
  assertJudgePresent,
  beginTurn,
  clearDeliveredTerminal,
  createActionHistory,
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
import type { TokenUsage, RespondPayload, RenderOpts } from '@looprun-ai/core/internal';
import type { AgentSpec, AgentWorld, ToolDef, DomainContract, TurnInput, TurnRecord, RunResult, Judge } from '@looprun-ai/core';
import { buildWorldTools } from './tools.js';
import { makeGuardHooks, makeInputProcessors, repeatedToolCallStop } from './hooks.js';
import { defaultJudge } from './judge.js';
import type { LoopRunSession } from './session.js';

export const DEFAULT_MAX_STEPS = 16;
export const DEFAULT_REDRIVES = 1;

/** Everything the runner needs, injected by the host (an eval harness, a batch job, …). */
export interface RuntimeDeps {
  /** An AI-SDK LanguageModel or a Mastra model router string. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  /** Options spread into every generate() call (providerOptions / modelSettings / …). */
  modelParams?: Record<string, unknown>;
  /** Stop the generation on the first repeated (tool+args) call — enable for LOCAL models
   *  — a small model that loops is either stuck or retrying unchanged. Default false. */
  stopOnRepeatedToolCall?: boolean;
  /** The domain world seam (read + exec). */
  world: AgentWorld;
  /** Tool defs (name/description/JSON-schema) for the surface + terminal tools. */
  toolDefs: ToolDef[];
  /** The domain skin. Optional when the spec carries its own contract reference. */
  contract?: DomainContract;
  maxSteps?: number;
  redrives?: number;
  /** The LLM judge for `llmCheck` guards — the model seam, NEVER named in config (like
   *  defineWorld's custom executors). Threaded onto every GuardCtx. Optional: omitting it resolves
   *  the default built from this run's own agent and model.
   *
   *  EITHER WAY A FAILURE REACHES THE GUARD. The default carries the call and nothing else, so a
   *  refused endpoint or a spent quota rejects exactly as a host judge's would, and the guard's
   *  `failMode` prices it — a bound `llmCheckLie` (closed) denies every candidate while the
   *  endpoint is down, spending each turn's redrives and delivering the engine's closure. */
  judge?: Judge;
  /** Per-call judge timeout (ms) — a hung judge resolves via failMode past this deadline.
   *  Default 30000 (the guard's own). Beside the judge at the seam; the config surface is untouched. */
  judgeTimeoutMs?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUsage(u: any): TokenUsage {
  return {
    input: u?.inputTokens ?? null, output: u?.outputTokens ?? null, reasoning: u?.reasoningTokens ?? null,
    cacheRead: u?.cachedInputTokens ?? null, cacheWrite: null, total: u?.totalTokens ?? null,
  };
}

/** Run one case (all turns) for `spec` on Mastra, with the host-injected deps. */
export async function runSpecConversation(spec: AgentSpec, turns: TurnInput[], deps: RuntimeDeps): Promise<RunResult> {
  const { world, model } = deps;
  const contract = deps.contract ?? spec.contract;
  if (!contract && !spec.surface.systemPrompt) {
    throw new Error(`runSpecConversation: spec "${spec.id}" has no contract — pass deps.contract or set spec.contract.`);
  }
  // flat call settings → modelSettings (Mastra drops them top-level), then the spec's per-agent
  // sampling merged OVER them (agent wins). One object, spread into EVERY generate() call of the turn.
  const genParams = resolveModelSettings(normalizeModelParams(deps.modelParams ?? {}), spec.controls.sampling);
  // THE JUDGE EVERY BOUND RUBRIC RUNS ON. The host's own when it supplied one — its rejections
  // are what `failMode` prices. Otherwise the engine-composed default, on this run's own agent: the
  // arrow is built here and CALLED during a turn, long after `agent` below is initialised.
  const judge: Judge =
    deps.judge ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultJudge((prompt, opts) => (agent.generate as any)(prompt, opts), genParams);
  // A spec can be driven by a runtime that resolves nothing, and a rubric with no judge is a
  // wiring bug — surface it before the first turn, never mid-turn where it reads as a model failure.
  assertJudgePresent(spec, judge);
  // THE VOCABULARY A JUDGING PROMPT RENDERS IN. It comes from the contract THIS RUN was given, which a
  // host may supply in place of the spec's own — so it is resolved here, beside the judge, and rides
  // the action history onto every guard ctx.
  const renderOpts: RenderOpts = { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes };
  const maxSteps = spec.controls.maxSteps ?? deps.maxSteps ?? DEFAULT_MAX_STEPS;
  const redrives = spec.controls.redrives ?? deps.redrives ?? DEFAULT_REDRIVES;
  const surface = new Set(spec.surface.tools);

  const session: LoopRunSession = {
    id: 'run',
    world,
    actionHistory: createActionHistory(judge, deps.judgeTimeoutMs, renderOpts),
    turnIndex: 0,
    messages: [],
    chain: Promise.resolve(),
  };
  const getSession = () => session;
  const actionHistory = session.actionHistory;

  // A destructive tool's consent route is decided by its DECLARED schema: `simulate` present →
  // the simulation bypass and the downgrade are licensed; absent → every call is gated. The schema
  // is only known HERE, where toolDefs are injected — so the set is computed and seated at run start.
  if (spec.simulatableToolNames) session.actionHistory.simulatableTools = spec.simulatableToolNames(deps.toolDefs);

  const mastraTools = buildWorldTools(deps.toolDefs, surface, getSession, spec, contract);
  const guardHooks = makeGuardHooks(spec, getSession, { contract });
  const inputProcessors = makeInputProcessors(spec, getSession);

  let currentSystemPrompt = '';
  const agent = new Agent({
    name: `looprun-${spec.id}`,
    instructions: () => currentSystemPrompt,
    model,
    tools: mastraTools,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const turnRecords: TurnRecord[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = session.messages;
  let errorMsg: string | undefined;

  for (let i = 0; i < turns.length; i++) {
    if (i > 0) world.advanceTurn();
    // A scripted user reads the screen: {{CODE1}}/{{CODE2}} stand for the consent literals the PREVIOUS
    // reply put in front of them, in the order they were shown.
    const shown = (turnRecords[turnRecords.length - 1]?.assistantFinalText ?? '').match(/CONFIRM [A-Z0-9_-]+/g) ?? [];
    const userText = turns[i].userText.replace(
      /\{\{CODE(\d*)\}\}/g,
      (_m, n: string) => shown[(n ? Number(n) : 1) - 1] ?? '(no code was shown)',
    );
    beginTurn(actionHistory, i, userText);

    const attUrls = (turns[i].attachments ?? []) as string[];
    const attLabels = attUrls.map((u) => world.ingestAttachment(u));
    actionHistory.attachments = attLabels;

    // ONE producer for the bytes this turn sends (core/runtime/prompt.ts): the BYTE-STABLE system
    // prefix (scoped assembledPrompt + terminal protocol) and the state-in-tail user message (volatile account
    // state, then uploads, then the request). The offline margin instruments render through the same
    // function, so a replay can never feed on a prompt the runtime does not send.
    const { instructions, userContent, replyOnly } = renderTurnPrompt({
      spec, contract, world, userText, uploadLabels: attLabels, uploadUrls: attUrls,
    });
    currentSystemPrompt = instructions;
    // ONE terminal (`respond`); asking is a `did` INTENTION — the reply-only policy rides the protocol prose.
    const activeTools = [...surface, 'respond'];

    const before = world.toolCalls.length;
    const sseBefore = world.sseActions.length;

    messages.push({ role: 'user', content: userContent });
    const t0 = Date.now();

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const terminalCalled = ({ steps }: any): boolean => {
        const last = steps?.[steps.length - 1];
        for (const tc of (last?.toolCalls ?? [])) if (isTerminal(tc.toolName ?? tc.name ?? '')) return true;
        return false;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const full: any = await (agent.generate as any)(messages, {
        activeTools,
        toolChoice: 'required',
        stopWhen: [stepCountIs(maxSteps), terminalCalled, () => vetoStormHit(session.actionHistory),
          ...(deps.stopOnRepeatedToolCall ? [repeatedToolCallStop] : [])],
        hooks: guardHooks,
        ...(inputProcessors ? { inputProcessors } : {}),
        ...genParams,
      });
      if (full.response?.messages) messages.push(...full.response.messages);
      const steps = (full.steps ?? []) as unknown[];
      let extraCalls = 0;

      // The closing step must be TERMINAL-ONLY. A terminal that shared its step with a domain call was
      // composed BEFORE that call's result existed, so its text cannot be reporting it. Invalidate it;
      // the forced-terminal fallback right below re-closes the turn on a history that now carries the
      // tool RESULTS.
      const premature = prematureTerminalTools(full.steps);
      if (premature.length && actionHistory.terminalReply.trim()) {
        // Clear the WHOLE delivered declaration (text + did): an invalidated terminal's `did` is an
        // equally-premature claim the cross-check guards must not ground against.
        clearDeliveredTerminal(actionHistory);
        actionHistory.turnCorrections.push(`premature-terminal:${[...new Set(premature)].join(',')}`);
      }
      // …and drop the invalidated terminal's OBSERVATION too: clearing the captured
      // declaration leaves the hook-time `observed` push in place, where a `did` carrying an `ask`
      // intention reads — this turn and every later one — as a question the user answered. It never
      // reached them. Runs unconditionally: a premature terminal is never delivered, whatever its message.
      const prunedPremature = pruneSupersededTerminals(actionHistory, prematureTerminalCalls(full.steps));
      if (prunedPremature.length) actionHistory.turnCorrections.push(`premature-terminal-pruned:${[...new Set(prunedPremature)].join(',')}`);
      // Terminals that lost the delivery contest are not evidence of anything the user saw.
      const pruned = pruneSupersededTerminals(actionHistory, supersededTerminalCalls(full.steps));
      if (pruned.length) actionHistory.turnCorrections.push(`superseded-terminal:${[...new Set(pruned)].join(',')}`);

      // Forced-terminal fallback: if the model ended without a terminal call, force one (no domain tools).
      if (!actionHistory.terminalReply.trim()) {
        const fbTools = ['respond'];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fb: any = await (agent.generate as any)([...messages, { role: 'user', content: forcedTerminalPrompt(replyOnly) }], {
          activeTools: fbTools, toolChoice: 'required', stopWhen: [stepCountIs(2), terminalCalled],
          hooks: guardHooks, ...genParams,
        });
        if (fb.response?.messages) messages.push(...fb.response.messages);
        extraCalls++;
        actionHistory.turnCorrections.push('forced-terminal');
      }

      // flowChain completion — AFTER main + forced-terminal fallback (a terminal reply already exists →
      // the restate reply-accounting flows through the redrive below), BEFORE the onReply checks. Veto
      // guards only BLOCK a wrong call; a chain deterministically COMPLETES a required missing follow-up.
      // ZERO-DIFF: gated on `spec.controls.chains?.length`, so a chain-free turn builds nothing.
      if (spec.controls.chains?.length) {
        const chainPass = await runChainCompletionPass(spec.controls.chains, {
          world,
          observed: actionHistory.observed,
          turnIndex: i,
          terminalReplyPresent: actionHistory.terminalReply.trim().length > 0,
          beforeToolCall: guardHooks.beforeToolCall,
          afterToolCall: guardHooks.afterToolCall,
          forceLlmCall: async (call: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cc: any = await (agent.generate as any)(
              [...messages, { role: 'user', content: `Complete the required follow-up now: call ${call} with the correct arguments for what the user asked. Do not reply in text.` }],
              // FORCING: single active tool + toolChoice:'required' — llama-server IGNORES the named
              // `{ type:'tool', toolName }` form and degrades to free text; this is the portable form.
              { activeTools: [call], toolChoice: 'required', stopWhen: [stepCountIs(2)], hooks: guardHooks, ...genParams },
            );
            if (cc.response?.messages) messages.push(...cc.response.messages);
          },
        });
        if (chainPass.corrections.length) actionHistory.turnCorrections.push(...chainPass.corrections);
        // Restate reply-accounting joins the action history's postToolViolations — finalizeReply relays it.
        if (chainPass.replyViolations.length) actionHistory.postToolViolations.push(...chainPass.replyViolations);
        extraCalls += chainPass.llmCalls;
      }

      const initialText: string = full?.tripwire ? String(full.tripwireReason ?? full.reason ?? '') : (actionHistory.terminalReply || full.text || '');
      // The DELIVERED terminal's structured declaration (recordTerminal seated `did`); a tripwire /
      // free-text fallback carries the empty declaration beginTurn reset.
      const initial: RespondPayload = { message: initialText, did: actionHistory.did };

      // Mutators → onReply checks → bounded redrive (re-generates ONE respond) → deterministic honest-abstain.
      const finalized = await finalizeReply(
        spec,
        contract,
        world,
        actionHistory,
        initial,
        async (message) => {
          // A redrive re-generates ONE respond (respond-only, toolChoice pinned) and returns the STRUCTURED
          // payload. It is NOT persisted: snapshot the action history and restore it, so a rejected draft's respond
          // never enters observed/history (finalizeReply re-seats `did` from the returned payload).
          const obsLen = actionHistory.observed.length;
          const snap = { terminalReply: actionHistory.terminalReply, did: actionHistory.did };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const re: any = await (agent.generate as any)(
            [...messages, { role: 'user', content: message }],
            { activeTools: ['respond'], toolChoice: 'required', stopWhen: [stepCountIs(2), terminalCalled], hooks: guardHooks, ...genParams },
          );
          actionHistory.observed.length = obsLen;
          actionHistory.terminalReply = snap.terminalReply;
          actionHistory.did = snap.did;
          const args = lastTerminalArgs(re.steps);
          return args ? respondPayload(args) : { message: typeof re.text === 'string' ? re.text : '', did: [] };
        },
        redrives,
      );
      const answerText = finalized.text;
      // History reconciliation: persist the reply the user ACTUALLY received when the pipeline
      // changed it (mutator / redrive / exhaustion).
      if (answerText && answerText !== initialText) messages.push({ role: 'assistant', content: answerText });
      // Seal this turn into the conversation history so the NEXT turn's guards see it (user text incl.).
      recordTurnHistory(actionHistory, answerText, world);

      const durationMs = Date.now() - t0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newCalls = world.toolCalls.slice(before).map((tc: any) => ({
        name: tc.name, args: tc.args, resultSummary: JSON.stringify(tc.result ?? null).slice(0, 800), tookEffect: tc.tookEffect, latencyMs: 0,
      }));
      const stepCount = (steps.length || 1) + extraCalls;

      turnRecords.push({
        userText, assistantFinalText: answerText, finalMode: spec.mode, assistantMsgCount: 1,
        iters: stepCount, llmCalls: stepCount, toolCalls: newCalls, thoughts: full.reasoningText ?? null,
        tokens: mapUsage(full.totalUsage), llmCallLatenciesMs: [durationMs], durationMs, maxIterHit: stepCount >= maxSteps,
        recoveryEvents: actionHistory.turnCorrections.length ? actionHistory.turnCorrections.slice() : [],
        ...(actionHistory.attemptedCalls.length ? { attemptedCalls: actionHistory.attemptedCalls.slice() } : {}),
        sseActions: world.sseActions.slice(sseBefore), attachments: attLabels,
      });
    } catch (e) {
      const durationMs = Date.now() - t0;
      errorMsg = String(e);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (process.env.DEBUG_ERR) console.error('\n[looprun ERR]', (e as any)?.message ?? String(e));
      turnRecords.push({
        userText, assistantFinalText: '', finalMode: spec.mode, assistantMsgCount: 0,
        iters: 0, llmCalls: 1, toolCalls: [], thoughts: null,
        tokens: { input: null, output: null, reasoning: null, cacheRead: null, cacheWrite: null, total: null },
        llmCallLatenciesMs: [durationMs], durationMs, maxIterHit: false, recoveryEvents: ['error'],
      });
      break;
    }
    session.turnIndex = i + 1;
  }

  return { turnRecords, messages, errorMsg };
}
