/**
 * @looprun-ai/mastra — scripted multi-turn conversation runner (the eval/batch surface).
 *
 * Governance → idiomatic Mastra primitives:
 *   preTool guards   → `hooks.beforeToolCall` → { proceed:false, output } veto
 *   observed ledger  → `hooks.afterToolCall`
 *   onInput guards   → an `inputProcessors` entry (processInput → abort ⇒ turn refused, no LLM call)
 *   surface scoping  → `activeTools` = spec.surface.tools (+ terminal tools)
 *   force-terminal   → replyToUser/askUser tools + `toolChoice:'required'` + `stopWhen(terminalCalled)`
 *                      + a forced-terminal fallback (pushes a weak model past the action wall)
 *   onReply guards   → runtime finalization: a bounded NO-TOOLS re-generate redrive (toolChoice:'none'),
 *                      then mutators + honest-abstain. NOT a processor `abort({retry:true})`, which
 *                      re-runs the whole generation + re-executes side-effecting tools (measured:
 *                      ~100× slower).
 *
 * State-in-tail: the system prompt is the case-invariant scoped trunk (cacheable prefix); the
 * volatile account/brand STATE (`contract.stateBlock`) rides the USER MESSAGE tail.
 */
import { stepCountIs } from 'ai';
import { Agent } from '@mastra/core/agent';
import {
  beginTurn,
  createLedger,
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
import type { TokenUsage } from '@looprun-ai/core/internal';
import type { AgentSpec, AgentWorld, ToolDef, DomainContract, TurnInput, TurnRecord, RunResult } from '@looprun-ai/core';
import { buildWorldTools } from './tools.js';
import { makeGuardHooks, makeInputProcessors, repeatedToolCallStop } from './hooks.js';
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
  const maxSteps = spec.controls.maxSteps ?? deps.maxSteps ?? DEFAULT_MAX_STEPS;
  const redrives = spec.controls.redrives ?? deps.redrives ?? DEFAULT_REDRIVES;
  const surface = new Set(spec.surface.tools);

  const session: LoopRunSession = {
    id: 'run',
    world,
    ledger: createLedger(),
    turnIndex: 0,
    messages: [],
    chain: Promise.resolve(),
  };
  const getSession = () => session;
  const ledger = session.ledger;

  // A destructiveTool on the 'arg' confirm mechanism whose schema lacks the confirm flag renders a
  // two-step ritual it can never honour (the model asks forever). The schema is only known HERE, where
  // toolDefs are injected — so the cross-check runs at run start. Throws (author bug) if mis-authored.
  spec.assertDestructiveConfirmable?.(deps.toolDefs);

  const mastraTools = buildWorldTools(deps.toolDefs, surface, getSession);
  const guardHooks = makeGuardHooks(spec, getSession);
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
    beginTurn(ledger, i);

    const attUrls = (turns[i].attachments ?? []) as string[];
    const attLabels = attUrls.map((u) => world.ingestAttachment(u));
    ledger.attachments = attLabels;
    const userText = turns[i].userText;

    // ONE producer for the bytes this turn sends (core/runtime/prompt.ts): the BYTE-STABLE system
    // prefix (scoped trunk + terminal protocol) and the state-in-tail user message (volatile account
    // state, then uploads, then the request). The offline margin instruments render through the same
    // function, so a replay can never feed on a prompt the runtime does not send.
    const { instructions, userContent, replyOnly } = renderTurnPrompt({
      spec, contract, world, userText, uploadLabels: attLabels, uploadUrls: attUrls,
    });
    currentSystemPrompt = instructions;
    const activeTools = replyOnly ? [...surface, 'replyToUser'] : [...surface, 'replyToUser', 'askUser'];

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
        stopWhen: [stepCountIs(maxSteps), terminalCalled, () => vetoStormHit(session.ledger),
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
      if (premature.length && ledger.terminalReply.trim()) {
        ledger.terminalReply = '';
        ledger.turnCorrections.push(`premature-terminal:${[...new Set(premature)].join(',')}`);
      }
      // Terminals that lost the delivery contest are not evidence of anything the user saw.
      const pruned = pruneSupersededTerminals(ledger, supersededTerminalCalls(full.steps));
      if (pruned.length) ledger.turnCorrections.push(`superseded-terminal:${[...new Set(pruned)].join(',')}`);

      // Forced-terminal fallback: if the model ended without a terminal call, force one (no domain tools).
      if (!ledger.terminalReply.trim()) {
        const fbTools = replyOnly ? ['replyToUser'] : ['replyToUser', 'askUser'];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fb: any = await (agent.generate as any)([...messages, { role: 'user', content: forcedTerminalPrompt(replyOnly) }], {
          activeTools: fbTools, toolChoice: 'required', stopWhen: [stepCountIs(2), terminalCalled],
          hooks: guardHooks, ...genParams,
        });
        if (fb.response?.messages) messages.push(...fb.response.messages);
        extraCalls++;
        ledger.turnCorrections.push('forced-terminal');
      }

      // flowChain completion — AFTER main + forced-terminal fallback (a terminal reply already exists →
      // the restate reply-accounting flows through the redrive below), BEFORE the onReply checks. Veto
      // guards only BLOCK a wrong call; a chain deterministically COMPLETES a required missing follow-up.
      // ZERO-DIFF: gated on `spec.controls.chains?.length`, so a chain-free turn builds nothing.
      if (spec.controls.chains?.length) {
        const chainPass = await runChainCompletionPass(spec.controls.chains, {
          world,
          observed: ledger.observed,
          turnIndex: i,
          terminalReplyPresent: ledger.terminalReply.trim().length > 0,
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
        if (chainPass.corrections.length) ledger.turnCorrections.push(...chainPass.corrections);
        // Restate reply-accounting joins the ledger's postToolViolations — finalizeReply relays it.
        if (chainPass.replyViolations.length) ledger.postToolViolations.push(...chainPass.replyViolations);
        extraCalls += chainPass.llmCalls;
      }

      const initialText: string = full?.tripwire ? String(full.tripwireReason ?? full.reason ?? '') : (ledger.terminalReply || full.text || '');

      // Mutators → onReply checks → bounded NO-TOOLS redrive → deterministic honest-abstain.
      const finalized = await finalizeReply(
        spec,
        contract,
        world,
        ledger,
        initialText,
        async (message) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const re: any = await (agent.generate as any)(
            [...messages, { role: 'user', content: message }],
            { toolChoice: 'none', activeTools: [], ...genParams },
          );
          // Candidates are NOT persisted — a rejected draft must never enter the history.
          return re.text ?? '';
        },
        redrives,
      );
      const answerText = finalized.text;
      // History reconciliation: persist the reply the user ACTUALLY received when the pipeline
      // changed it (mutator / redrive / exhaustion).
      if (answerText && answerText !== initialText) messages.push({ role: 'assistant', content: answerText });

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
        recoveryEvents: ledger.turnCorrections.length ? ledger.turnCorrections.slice() : [],
        ...(ledger.attemptedCalls.length ? { attemptedCalls: ledger.attemptedCalls.slice() } : {}),
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
