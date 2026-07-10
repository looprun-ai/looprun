/**
 * @looprun-ai/mastra — governance → Mastra primitives.
 *
 * preTool guards ride `hooks.beforeToolCall` ({ proceed:false, output } veto — the model sees the
 * correction and retries within the SAME generation, no extra round-trip). The observed ledger is
 * fed by `hooks.afterToolCall`. Mastra applies hooks to ALL tool sources (assigned, toolsets,
 * client, MCP), so guards also govern native/MCP tools with zero extra wiring.
 */
import { evaluatePreTool, evaluateOnInput, isTerminal, recordToolResult } from '@looprun-ai/core';
import type { AgentSpec } from '@looprun-ai/core';
import type { LoopRunSession } from './session.js';
import type { SessionAccessor } from './tools.js';

export interface GuardHooks {
  beforeToolCall(ctx: { toolName: string; input: unknown }): Promise<void | { proceed: false; output: unknown }>;
  afterToolCall(ctx: { toolName: string; input: unknown; output?: unknown; error?: unknown }): void;
}

export function makeGuardHooks(spec: AgentSpec, getSession: SessionAccessor): GuardHooks {
  return {
    async beforeToolCall({ toolName, input }) {
      if (isTerminal(toolName)) return undefined;
      const session = getSession();
      const args = (input ?? {}) as Record<string, unknown>;
      const verdict = await evaluatePreTool(spec, session.ledger, session.world, toolName, args);
      if (verdict.verdict === 'deny') {
        return { proceed: false as const, output: { success: false, error: verdict.reason } };
      }
      return undefined;
    },
    afterToolCall({ toolName, input, output }) {
      if (isTerminal(toolName)) return;
      const session = getSession();
      recordToolResult(session.ledger, toolName, (input ?? {}) as Record<string, unknown>, output);
    },
  };
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
