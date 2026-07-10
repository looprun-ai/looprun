/**
 * @looprun-ai/mastra — compileSpec: the low-level kit for devs assembling their OWN `new Agent({...})`.
 *
 * Single-conversation by design (one world, one ledger). For multi-session hosts use LoopRunAgent.
 *
 *   const g = compileSpec(bookkeepingSpec, { world, toolDefs })
 *   const agent = new Agent({ id: 'books', name: 'Books', model, instructions: g.instructions,
 *                             tools: g.tools, hooks: g.hooks, inputProcessors: g.inputProcessors })
 *   // per turn: const { userMessageTail } = g.beginTurn(); …generate…; await g.finalizeReply(text, redrive)
 */
import {
  beginTurn as ledgerBeginTurn,
  createLedger,
  finalizeReply as coreFinalizeReply,
  renderScopedSpecTrunk,
  terminalProtocol,
} from '@looprun-ai/core';
import type { AgentSpec, AgentWorld, FinalizedReply, ToolDef, TrunkTheme, TurnLedger } from '@looprun-ai/core';
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
  /** Advance the turn (world + ledger) and get the state/uploads tail for the user message. */
  beginTurn(input?: { attachments?: string[] }): { userMessageTail: string };
  /** Mutators → onReply checks → bounded no-tools redrive → honest-abstain. */
  finalizeReply(text: string, redrive: (message: string) => Promise<string>): Promise<FinalizedReply>;
}

export function compileSpec(
  spec: AgentSpec,
  opts: { theme?: TrunkTheme; world: AgentWorld; toolDefs?: ToolDef[]; terminalProtocol?: boolean; redrives?: number },
): CompiledSpec {
  const theme = opts.theme ?? spec.theme;
  if (!theme && !spec.surface.systemPrompt) {
    throw new Error(`compileSpec "${spec.id}": no theme — pass opts.theme or set spec.theme.`);
  }
  const world = opts.world;
  const terminalOn = opts.terminalProtocol !== false;
  const surface = new Set(spec.surface.tools);
  const session: LoopRunSession = {
    id: 'compiled',
    world,
    ledger: createLedger(),
    turnIndex: 0,
    messages: [],
    chain: Promise.resolve(),
  };
  const getSession = () => session;
  let started = false;

  const renderPrompt = spec.surface.systemPrompt
    ? (w: AgentWorld, u: string[]) => spec.surface.systemPrompt!(w, u)
    : (w: AgentWorld, u: string[]) => renderScopedSpecTrunk(w, spec, u, theme);

  const replyOnly = () => (spec.controls.terminal ? spec.controls.terminal(world) === true : false);

  return {
    ledger: session.ledger,
    tools: buildWorldTools(opts.toolDefs ?? [], surface, getSession),
    instructions: () => renderPrompt(world, session.ledger.attachments) + (terminalOn ? terminalProtocol(replyOnly()) : ''),
    hooks: makeGuardHooks(spec, getSession),
    inputProcessors: makeInputProcessors(spec, getSession),
    activeTools: () => (replyOnly() ? [...surface, 'replyToUser'] : [...surface, 'replyToUser', 'askUser']),
    beginTurn(input) {
      if (started) {
        world.advanceTurn();
        session.turnIndex += 1;
      }
      started = true;
      ledgerBeginTurn(session.ledger, session.turnIndex);
      const attLabels = (input?.attachments ?? []).map((u) => world.ingestAttachment(u));
      session.ledger.attachments = attLabels;
      const stateBlock = theme ? theme.stateBlock(world) : '';
      const tailParts: string[] = [];
      if (stateBlock && stateBlock.trim()) tailParts.push(`## Account state\n${stateBlock}`);
      if (attLabels.length) tailParts.push(`[Uploads this turn: ${attLabels.join(', ')}]`);
      return { userMessageTail: tailParts.join('\n\n') };
    },
    finalizeReply(text, redrive) {
      return coreFinalizeReply(spec, theme, world, session.ledger, text, redrive, spec.controls.redrives ?? opts.redrives ?? DEFAULT_REDRIVES);
    },
  };
}
