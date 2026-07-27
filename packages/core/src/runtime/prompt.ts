/**
 * @looprun-ai/core — the TURN PROMPT producer: the single owner of the bytes the model receives.
 *
 * WHY THIS EXISTS. The assembly used to live inside the backend, duplicated across the two drivers:
 * each one folded `trunk + terminal protocol` into the instructions and `state block + uploads +
 * user text` into the message tail. Two copies of one law is a drift hazard, and it is worse than
 * ordinary duplication because the drift is INVISIBLE — a wrong prompt still produces a number.
 *
 * The offline instruments (the margin probe and its fork replays) need those exact bytes without
 * running a model. Giving them a REPLICA of this assembly is the failure this module is built to
 * make impossible: a replica silently diverges on the next refactor and the instrument keeps
 * reporting, now about a prompt nothing runs. So there is one producer, the drivers call it, the
 * instruments call it, and `prompt-identity.test.ts` pins that a real turn sends what it returns.
 *
 * PURE: no clock, no entropy, no I/O, no model. `world` is READ (projection + the contract's state
 * block); attachment ingestion happens in the caller, because it MUTATES the world.
 */
import { renderScopedSpecTrunk } from '../trunk.js';
import type { DomainContract } from '../trunk.js';
import type { AgentSpec } from '../spec.js';
import type { AgentWorld } from '../rules.js';
import { terminalProtocol } from './terminal.js';

export interface TurnPromptInput {
  spec: AgentSpec;
  /** The domain contract. Absent ⇒ no voice/invariants/state block (a contract-less spec). */
  contract?: DomainContract;
  world: AgentWorld;
  /** The user's message. `null` when the caller drives with a messages array — the tail then omits it. */
  userText: string | null;
  /** Labels returned by `world.ingestAttachment`, in call order. */
  uploadLabels?: string[];
  /** The original attachment URLs, SAME order — used only for the human-readable display suffix. */
  uploadUrls?: string[];
  /** Append the terminal-protocol block to the instructions. Default `true`. */
  terminalProtocol?: boolean;
  /**
   * Force the reply-only decision instead of asking the spec's terminal policy.
   *
   * Two callers need it and neither is a governed turn: the STATIC instructions a host shows in a
   * studio (rendered against a stub world the policy must never be asked about), and an offline
   * replay pinning the decision the recorded run actually took.
   */
  replyOnly?: boolean;
  /**
   * Render the INSTRUCTIONS only and leave `userContent` empty.
   *
   * The state block is business code reading business state. A caller that renders against a STUB
   * world — the static instructions a host shows in a studio — has no state to ask about, and asking
   * anyway runs a domain accessor against an object that does not have it. That is not a defensive
   * concern: it throws, and it throws at construction, on every contract whose state block reads
   * anything real. Callers that consume only `instructions` say so here.
   */
  instructionsOnly?: boolean;
}

export interface TurnPrompt {
  /** The system instructions: the scoped trunk (or the spec's own override) + the terminal protocol. */
  instructions: string;
  /** The user message content: state block + uploads + user text, in that order. */
  userContent: string;
  /** Whether the spec's terminal policy forces reply-only for THIS world state. */
  replyOnly: boolean;
  /** `label (basename)` per upload — exposed so a caller that logs uploads shows the same strings. */
  uploadDisplay: string[];
}

/** `label (basename)` when the URL has a basename, else the bare label. */
export function uploadDisplayLabels(labels: string[], urls: string[] = []): string[] {
  return labels.map((l, k) => {
    const base = urls[k]?.split('/').pop();
    return base ? `${l} (${base})` : l;
  });
}

/** True when the spec's terminal policy forces reply-only in this world state. */
export function isReplyOnly(spec: AgentSpec, world: AgentWorld): boolean {
  return spec.controls.terminal ? spec.controls.terminal(world) === true : false;
}

/**
 * Render ONE turn's prompt — the exact `instructions` + `userContent` a governed turn sends.
 *
 * State-in-tail: the stable prefix (voice, rules, guard prose, protocol) is the SYSTEM message and
 * stays byte-identical across turns so it caches; everything volatile (account state, uploads, the
 * request) rides the USER message. Changing this order changes every cached prefix.
 */
export function renderTurnPrompt(input: TurnPromptInput): TurnPrompt {
  const { spec, contract, world, userText } = input;
  const labels = input.uploadLabels ?? [];
  const display = uploadDisplayLabels(labels, input.uploadUrls);
  const replyOnly = input.replyOnly ?? isReplyOnly(spec, world);

  const trunk = spec.surface.systemPrompt
    ? spec.surface.systemPrompt(world, labels)
    : renderScopedSpecTrunk(world, spec, labels, contract);
  const instructions = trunk + (input.terminalProtocol === false ? '' : terminalProtocol(replyOnly));

  if (input.instructionsOnly) {
    return { instructions, userContent: '', replyOnly, uploadDisplay: display };
  }

  const stateBlock = contract ? contract.stateBlock(world) : '';
  const tailParts: string[] = [];
  if (stateBlock && stateBlock.trim()) tailParts.push(`## Account state\n${stateBlock}`);
  if (labels.length) tailParts.push(`[Uploads this turn: ${display.join(', ')}]`);
  if (userText !== null) tailParts.push(userText);

  return { instructions, userContent: tailParts.join('\n\n'), replyOnly, uploadDisplay: display };
}
