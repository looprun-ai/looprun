/**
 * @looprun-ai/mastra — compileSpec: the low-level kit for devs assembling their OWN `new Agent({...})`.
 *
 * Single-conversation by design (one world, one ledger). For multi-session hosts use LoopRunAgent.
 *
 *   const g = compileSpec(bookkeepingSpec, { world, toolDefs })
 *   const agent = new Agent({ id: 'books', name: 'Books', model, instructions: g.instructions,
 *                             tools: g.tools, hooks: g.hooks, inputProcessors: g.inputProcessors })
 *   // per turn: const { userMessageTail } = g.beginTurn(); …generate…; await g.finalizeReply(payload, redrive)
 */
import type { AgentSpec, AgentWorld, ToolDef, DomainContract, Judge } from '@looprun-ai/core';
import {
  assertJudgePresent,
  beginTurn as ledgerBeginTurn,
  createLedger,
  finalizeReply as coreFinalizeReply,
  recordTurnHistory,
  renderScopedSpecTrunk,
  terminalProtocol,
} from '@looprun-ai/core/internal';
import type { FinalizedReply, TurnLedger, RespondPayload } from '@looprun-ai/core/internal';
import { buildWorldTools } from './tools.js';
import { makeGuardHooks, makeInputProcessors } from './hooks.js';
import type { GuardHooks } from './hooks.js';
import type { LoopRunSession } from './session.js';
import { DEFAULT_REDRIVES } from './run-conversation.js';

export interface CompiledSpec {
  ledger: TurnLedger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Record<string, any>;
  /** The byte-stable trunk + the current turn's terminal-protocol variant. */
  instructions(): string;
  hooks: GuardHooks;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputProcessors?: any[];
  /** The tools active THIS turn (respects the reply-only terminal policy). */
  activeTools(): string[];
  /** Advance the turn (world + ledger) and get the state/uploads tail for the user message. Pass
   *  `userText` so onInput/guards see the real incoming text (`ctx.userText`) and it enters history. */
  beginTurn(input?: { attachments?: string[]; userText?: string }): { userMessageTail: string };
  /** Mutators → onReply checks → bounded redrive (re-generate ONE respond) → honest-abstain. Seals the
   *  turn into the conversation history so a later turn's guards read it via `ctx.history`. The `initial`
   *  and the redrive's return are STRUCTURED respond payloads (message + did). */
  finalizeReply(
    initial: RespondPayload,
    redrive: (message: string) => Promise<RespondPayload>,
  ): Promise<FinalizedReply>;
}

export function compileSpec(
  spec: AgentSpec,
  opts: { contract?: DomainContract; world: AgentWorld; toolDefs?: ToolDef[]; terminalProtocol?: boolean; redrives?: number; judge?: Judge; judgeTimeoutMs?: number },
): CompiledSpec {
  const contract = opts.contract ?? spec.contract;
  if (!contract && !spec.surface.systemPrompt) {
    throw new Error(`compileSpec "${spec.id}": no contract — pass opts.contract or set spec.contract.`);
  }
  // FAIL-LOUD-AT-START: an llmCheck installed without a judge is a wiring bug — surface it here.
  assertJudgePresent(spec, opts.judge);
  const world = opts.world;
  const terminalOn = opts.terminalProtocol !== false;
  const surface = new Set(spec.surface.tools);
  const session: LoopRunSession = {
    id: 'compiled',
    world,
    ledger: createLedger(opts.judge, opts.judgeTimeoutMs, {
      renderClaim: contract?.renderClaim,
      outcomes: contract?.outcomes,
    }),
    turnIndex: 0,
    messages: [],
    chain: Promise.resolve(),
  };
  const getSession = () => session;
  let started = false;

  const renderPrompt = spec.surface.systemPrompt
    ? (w: AgentWorld, u: string[]) => spec.surface.systemPrompt!(w, u)
    : (w: AgentWorld, u: string[]) => renderScopedSpecTrunk(w, spec, u, contract);

  // Frozen at beginTurn (and at creation, for reads before the first turn): instructions() derives from
  // it (the reply-only protocol prose), and the host reads it at times the runtime does not control. A
  // per-read evaluation lets a mid-turn world mutation make the prompt's reply-only stance flip mid-turn.
  // Per-turn is the documented contract.
  const evalReplyOnly = () => (spec.controls.terminal ? spec.controls.terminal(world) === true : false);
  let replyOnlyThisTurn = evalReplyOnly();
  const replyOnly = () => replyOnlyThisTurn;

  return {
    ledger: session.ledger,
    tools: buildWorldTools(opts.toolDefs ?? [], surface, getSession),
    instructions: () => renderPrompt(world, session.ledger.attachments) + (terminalOn ? terminalProtocol(replyOnly()) : ''),
    hooks: makeGuardHooks(spec, getSession),
    inputProcessors: makeInputProcessors(spec, getSession),
    activeTools: () => [...surface, 'respond'],
    beginTurn(input) {
      if (started) {
        world.advanceTurn();
        session.turnIndex += 1;
      }
      started = true;
      replyOnlyThisTurn = evalReplyOnly();
      ledgerBeginTurn(session.ledger, session.turnIndex, input?.userText ?? '');
      const attLabels = (input?.attachments ?? []).map((u) => world.ingestAttachment(u));
      session.ledger.attachments = attLabels;
      const stateBlock = contract ? contract.stateBlock(world) : '';
      const tailParts: string[] = [];
      if (stateBlock && stateBlock.trim()) tailParts.push(`## Account state\n${stateBlock}`);
      if (attLabels.length) tailParts.push(`[Uploads this turn: ${attLabels.join(', ')}]`);
      return { userMessageTail: tailParts.join('\n\n') };
    },
    async finalizeReply(initial, redrive) {
      const finalized = await coreFinalizeReply(spec, contract, world, session.ledger, initial, redrive, spec.controls.redrives ?? opts.redrives ?? DEFAULT_REDRIVES);
      recordTurnHistory(session.ledger, finalized.text, world);
      return finalized;
    },
  };
}
