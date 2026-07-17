/**
 * @looprun-ai/mastra — governance → Mastra primitives.
 *
 * preTool guards ride `hooks.beforeToolCall` ({ proceed:false, output } veto — the model sees the
 * correction and retries within the SAME generation, no extra round-trip). The observed ledger is
 * fed by `hooks.afterToolCall`. Mastra applies hooks to ALL tool sources (assigned, toolsets,
 * client, MCP), so guards also govern native/MCP tools with zero extra wiring.
 */
import { evaluatePreTool, evaluateOnInput, enforcePostTool, isTerminal, recordTerminalCall, recordToolResult, resolveGuards } from '@looprun-ai/core';
import type { AgentSpec, GuardCtx } from '@looprun-ai/core';
import type { LoopRunSession } from './session.js';
import type { SessionAccessor } from './tools.js';

export interface GuardHooks {
  beforeToolCall(ctx: { toolName: string; input: unknown }): Promise<void | { proceed: false; output: unknown }>;
  afterToolCall(ctx: { toolName: string; input: unknown; output?: unknown; error?: unknown }): Promise<void> | void;
}

export function makeGuardHooks(spec: AgentSpec, getSession: SessionAccessor): GuardHooks {
  return {
    async beforeToolCall({ toolName, input }) {
      if (isTerminal(toolName)) {
        // SYNCHRONOUS segment (no await above): record the terminal call at HOOK time so a same-step
        // sibling call's preTool checks can see it — see recordTerminalCall's doc for the concurrency
        // rationale. The terminal tool's execute captures the reply text and does NOT push again.
        recordTerminalCall(getSession().ledger, toolName, (input ?? {}) as Record<string, unknown>);
        return undefined;
      }
      const session = getSession();
      const args = (input ?? {}) as Record<string, unknown>;
      const verdict = await evaluatePreTool(spec, session.ledger, session.world, toolName, args);
      if (verdict.verdict === 'deny') {
        return { proceed: false as const, output: { success: false, error: verdict.reason } };
      }
      return undefined;
    },
    async afterToolCall({ toolName, input, output }) {
      if (isTerminal(toolName)) return;
      const session = getSession();
      const { ledger, world } = session;
      const args = (input ?? {}) as Record<string, unknown>;
      recordToolResult(ledger, toolName, args, output);
      // OUTPUT-dim (postTool) result invariants — enforce the previously-dead hook. ZERO-DIFF: a spec
      // with no postTool guards short-circuits here (no ctx built, no ledger writes). The tool already
      // executed — enforcement records an `output:…` correction + joins the reply-violation set so the
      // bounded no-tools redrive relays it (a report/repair, never a veto). Mastra AWAITS afterToolCall
      // but DISCARDS its return, so the guard cannot rewrite the model-visible result mid-generate.
      if (!spec.guards.postTool?.length) return;
      const postGuards = resolveGuards(spec.guards.postTool, toolName);
      if (!postGuards.length) return;
      const gctx: GuardCtx = {
        args, tool: toolName, world, observed: ledger.observed, turnIndex: ledger.turnIndex,
        attachmentsThisTurn: ledger.attachments, result: output,
      };
      const { corrections, violations } = await enforcePostTool(postGuards, gctx);
      if (corrections.length) ledger.turnCorrections.push(...corrections);
      if (violations.length) ledger.postToolViolations.push(...violations);
    },
  };
}

/**
 * Stop condition (verbatim from the certified reference lineage): end the generation the moment
 * ANY tool call repeats (same tool + same args) within this turn's steps — guard-denied calls
 * included, since they appear in steps too. Apply it for LOCAL models (small models loop; the
 * repeat is either a loop or a retry-without-change — both deserve the forced close).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function repeatedToolCallStop({ steps }: any): boolean {
  const seen = new Set<string>();
  for (const s of (steps ?? [])) {
    for (const tc of (s.toolCalls ?? [])) {
      const key = (tc.toolName ?? tc.name ?? '') + ':' + JSON.stringify(tc.input ?? tc.args ?? {});
      if (seen.has(key)) return true;
      seen.add(key);
    }
  }
  return false;
}

/** onInput guards as a Mastra input processor: abort ⇒ the turn is refused with no LLM call. */
export function makeInputProcessors(
  spec: AgentSpec,
  getSession: SessionAccessor,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] | undefined {
  if (!spec.guards.onInput?.length) return undefined;
  return [
    {
      id: 'looprun-onInput',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async processInput(a: any) {
        const session: LoopRunSession = getSession();
        const reason = await evaluateOnInput(spec, session.ledger, session.world);
        if (reason) a.abort(reason);
        return a.messages;
      },
    },
  ];
}
