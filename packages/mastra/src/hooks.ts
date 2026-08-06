/**
 * @looprun-ai/mastra — governance → Mastra primitives.
 *
 * preTool guards ride `hooks.beforeToolCall` ({ proceed:false, output } veto — the model sees the
 * correction and retries within the SAME generation, no extra round-trip). The observed action history is
 * fed by `hooks.afterToolCall`. Mastra applies hooks to ALL tool sources (assigned, toolsets,
 * client, MCP), so guards also govern native/MCP tools with zero extra wiring.
 */
import { evaluatePreTool, evaluateOnInput, enforcePostTool, governanceVeto, isTerminal, recordTerminalCall, recordToolResult, resolveGuards, resultOk, terminalPayloadRejection } from '@looprun-ai/core/internal';
import type { AgentSpec, GuardCtx } from '@looprun-ai/core';
import type { LoopRunSession } from './session.js';
import type { SessionAccessor } from './tools.js';

export interface GuardHooks {
  beforeToolCall(ctx: { toolName: string; input: unknown }): Promise<void | { proceed: false; output: unknown }>;
  afterToolCall(ctx: { toolName: string; input: unknown; output?: unknown; error?: unknown }): Promise<void> | void;
}

export interface GuardHookOptions {
  /** NATIVE-TOOLS mode (incl. MCP): the tools execute themselves and the synthesized world keeps no
   *  action history of its own, so `afterToolCall` writes the call into `world.toolCalls`. Without it the
   *  world's record is permanently empty and every effect reads as unverifiable. */
  nativeToolsMode?: boolean;
}

export function makeGuardHooks(spec: AgentSpec, getSession: SessionAccessor, opts: GuardHookOptions = {}): GuardHooks {
  return {
    async beforeToolCall({ toolName, input }) {
      if (isTerminal(toolName)) {
        const args = (input ?? {}) as Record<string, unknown>;
        // REFUSE BEFORE OBSERVING. Mastra wraps the tool's `execute`, so this hook runs
        // OUTSIDE the terminal's own input validation: a `respond` the runtime will REJECT (blank
        // message / no `did`) would otherwise be pushed into `observed` with `ok:true` — a call that
        // never executed, recorded as a successful observation, and (when its `did` carried an `ask`)
        // read as a question the user answered. Vetoing here also turns today's silent zod failure into
        // a GOVERNED correction the model can act on.
        const rejection = terminalPayloadRejection(args);
        if (rejection) {
          getSession().actionHistory.turnCorrections.push('terminal-rejected');
          return { proceed: false as const, output: governanceVeto('terminalPayload', rejection, false) };
        }
        // SYNCHRONOUS segment (no await above): record the terminal call at HOOK time so a same-step
        // sibling call's preTool checks can see it — see recordTerminalCall's doc for the concurrency
        // rationale. The terminal tool's execute captures the reply text and does NOT push again.
        recordTerminalCall(getSession().actionHistory, toolName, args);
        return undefined;
      }
      const session = getSession();
      const args = (input ?? {}) as Record<string, unknown>;
      // In native-tools mode the tools execute themselves — there is no executor here to run a
      // downgraded simulation with, so a consent denial takes the veto-question route instead.
      const verdict = await evaluatePreTool(spec, session.actionHistory, session.world, toolName, args, { canDowngrade: !opts.nativeToolsMode });
      if (verdict.verdict === 'deny') {
        // The envelope, not a bare `{success:false,error}`: the model must be able to tell a GUARD
        // correction (fix and retry — the world was never called) from a WORLD refusal (a business
        // fact to report to the user).
        return { proceed: false as const, output: governanceVeto(verdict.guard.kind, verdict.reason, verdict.mustCloseTurn) };
      }
      if (verdict.verdict === 'downgrade') {
        // One downgrade, never a loop: the re-entry carries `simulate: true`, so it cannot downgrade
        // again; any other guard's denial of it stands.
        const again = await evaluatePreTool(spec, session.actionHistory, session.world, toolName, verdict.args, { canDowngrade: false });
        if (again.verdict === 'deny') {
          return { proceed: false as const, output: governanceVeto(again.guard.kind, again.reason, again.mustCloseTurn) };
        }
        // The runtime executes the simulation itself and hands the model its result: the model asked
        // for the act and receives `requiresConfirmation` + the simulation — which is what keeps its
        // next sentence honest. Recorded here because a replaced call never reaches afterToolCall.
        const output = session.world.exec(toolName, verdict.args);
        recordToolResult(session.actionHistory, toolName, verdict.args, output, session.world);
        return { proceed: false as const, output };
      }
      return undefined;
    },
    async afterToolCall({ toolName, input, output }) {
      if (isTerminal(toolName)) return;
      const session = getSession();
      const { actionHistory, world } = session;
      const args = (input ?? {}) as Record<string, unknown>;
      // NATIVE-TOOLS mode: the tool executed ITSELF, so nothing has written the world's action history — and an
      // empty action history would make every call read as "changed nothing". Record the call here,
      // where the runtime knows it ran and what it returned. EFFECT is derived from the RESULT, the only
      // evidence this path has: a call that succeeded and did NOT come back asking for confirmation
      // changed something. That keeps the legitimate simulate-first flow alive (a simulation answering
      // `requiresConfirmation` is effect-free) while a tool that mutates while claiming `simulate: true` —
      // the case the throttle exists for — counts as the effect it is.
      if (opts.nativeToolsMode) {
        const ok = output !== undefined && resultOk(output);
        const pending = (output as { requiresConfirmation?: unknown } | null | undefined)?.requiresConfirmation === true;
        // INFERRED, not attested: there is no executor to ask on this path, so the flag really means "the
        // call succeeded and did not come back asking for confirmation" — true of every successful READ
        // too. `effectInferred` marks it so the honesty core keeps the `writeTools` intersection here
        // instead of applying the attested-effect law to a guess.
        world.toolCalls.push({ name: toolName, args, result: output, tookEffect: ok && !pending, effectInferred: true });
      }
      recordToolResult(actionHistory, toolName, args, output, world);
      // OUTPUT-dim (postTool) result invariants — this is where the postTool hook fires. ZERO-DIFF: a spec
      // with no postTool guards short-circuits here (no ctx built, no action history writes). The tool already
      // executed — enforcement records an `output:…` correction + joins the reply-violation set so the
      // bounded no-tools redrive relays it (a report/repair, never a veto). Mastra AWAITS afterToolCall
      // but DISCARDS its return, so the guard cannot rewrite the model-visible result mid-generate.
      if (!spec.guards.postTool?.length) return;
      const postGuards = resolveGuards(spec.guards.postTool, toolName);
      if (!postGuards.length) return;
      const gctx: GuardCtx = {
        args, tool: toolName, world, observed: actionHistory.observed, turnIndex: actionHistory.turnIndex,
        userText: actionHistory.currentUserText, consent: actionHistory.consentThisTurn, history: actionHistory.history,
        attachmentsThisTurn: actionHistory.attachments, result: output,
        did: actionHistory.did,
        notes: actionHistory.turnCorrections,
        judge: actionHistory.judge, judgeTimeoutMs: actionHistory.judgeTimeoutMs, renderOpts: actionHistory.renderOpts,
      };
      const { corrections, violations } = await enforcePostTool(postGuards, gctx);
      if (corrections.length) actionHistory.turnCorrections.push(...corrections);
      if (violations.length) actionHistory.postToolViolations.push(...violations);
    },
  };
}

/**
 * Stop condition: end the generation the moment
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
        const reason = await evaluateOnInput(spec, session.actionHistory, session.world);
        if (reason) a.abort(reason);
        return a.messages;
      },
    },
  ];
}
