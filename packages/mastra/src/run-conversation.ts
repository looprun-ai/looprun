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
 * volatile account/brand STATE (`theme.stateBlock`) rides the USER MESSAGE tail.
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
  resolveModelSettings,
  runChainCompletionPass,
  vetoStormHit,
  renderScopedSpecTrunk,
  terminalProtocol,
} from '@looprun-ai/core';
import type { AgentSpec, AgentWorld, TokenUsage, ToolDef, TrunkTheme, TurnInput, TurnRecord, RunResult } from '@looprun-ai/core';
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
   *  (mirrors the certified lineage, which gated it exactly this way). Default false. */
  stopOnRepeatedToolCall?: boolean;
  /** The domain world seam (read + exec). */
  world: AgentWorld;
  /** Tool defs (name/description/JSON-schema) for the surface + terminal tools. */
  toolDefs: ToolDef[];
  /** The domain skin. Optional when the spec carries its own theme reference. */
  theme?: TrunkTheme;
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
  const theme = deps.theme ?? spec.theme;
  if (!theme && !spec.surface.systemPrompt) {
    throw new Error(`runSpecConversation: spec "${spec.id}" has no theme — pass deps.theme or set spec.theme.`);
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

  // B4: a destructiveTool on the 'arg' confirm mechanism whose schema lacks the confirm flag renders a
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

  const renderPrompt = spec.surface.systemPrompt ?? ((w: AgentWorld, u: string[]) => renderScopedSpecTrunk(w, spec, u, theme));

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
    const attDisplay = attLabels.map((l, k) => {
      const base = attUrls[k]?.split('/').pop();
      return base ? `${l} (${base})` : l;
    });
    const userText = turns[i].userText;

    const replyOnly = spec.controls.terminal ? spec.controls.terminal(world) === true : false;
    const protocol = terminalProtocol(replyOnly);
    const activeTools = replyOnly ? [...surface, 'replyToUser'] : [...surface, 'replyToUser', 'askUser'];

    // BYTE-STABLE system prompt (scoped trunk + protocol) — no volatile state (state-in-tail).
    currentSystemPrompt = renderPrompt(world, attLabels) + protocol;

    const before = world.toolCalls.length;
    const sseBefore = world.sseActions.length;

    // State-in-tail: the volatile account/brand STATE rides the user message (after the stable
    // prefix), with uploads, then the user text. Refreshed each turn.
    const stateBlock = theme ? theme.stateBlock(world) : '';
    const tailParts: string[] = [];
    if (stateBlock && stateBlock.trim()) tailParts.push(`## Account state\n${stateBlock}`);
    if (attLabels.length) tailParts.push(`[Uploads this turn: ${attDisplay.join(', ')}]`);
    tailParts.push(userText);
    const userContent = tailParts.join('\n\n');
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
        theme,
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
