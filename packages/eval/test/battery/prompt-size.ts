/**
 * PROMPT SIZE and TRUNK STABILITY — both read off the bytes the runtime actually sent
 * ({@link RecordedCall}), never off a re-render.
 *
 * The split the plan asks for, and where each part comes from:
 *
 * ```
 *   trunk         the system message MINUS the terminal-protocol suffix — voice, rules, guard prose
 *   protocol      the terminal-protocol block the runtime appends (one of two known variants)
 *   tool schemas  the tool definitions the SDK sent with the call, serialized
 *   state         the state-in-tail block on the user message: everything before the request
 *   userText      the request itself
 * ```
 *
 * TOKENS. There is no tokenizer in this repo and adding one to count a fixture's bytes would be a
 * dependency bought for a rounding. So the per-block token figure is an ESTIMATE at a stated
 * divisor, and the turn's REPORTED input tokens (what the provider billed) ride beside it. A later
 * run diffs the estimate against the estimate and the reported against the reported; neither is
 * compared to the other.
 *
 * TRUNK STABILITY is the strong measurement here, because it needs no estimate: the same system
 * bytes across every generation of one conversation, or not.
 */
import { createHash } from 'node:crypto';
import { terminalProtocol } from '@looprun-ai/core/internal';
import { lastUserTextOf, systemOf, type RecordedCall } from './recording-model.js';

/** Characters per token, for the per-block estimate only. Stated, never inferred. */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export interface PromptSplit {
  trunk: number;
  protocol: number;
  toolSchemas: number;
  state: number;
  userText: number;
  /** trunk + protocol + toolSchemas + state + userText. */
  total: number;
}

export interface PromptMeasurement {
  chars: PromptSplit;
  /** `chars` divided by {@link CHARS_PER_TOKEN_ESTIMATE}, rounded up per block. */
  tokensEstimated: PromptSplit;
  /** The provider's own count for the turn, when the run reported one. */
  reportedInputTokens: number | null;
  reportedOutputTokens: number | null;
}

/** Measure ONE recorded call. `userText` is the scenario's turn text — known exactly, so the
 *  state block is the tail minus it rather than a guess at where the block ends. */
export function measureCall(call: RecordedCall, userText: string): PromptSplit {
  const system = systemOf(call);
  const protocol = protocolLengthOf(system);
  const tail = lastUserTextOf(call);
  // The tail is `state \n\n uploads \n\n request`, joined by the prompt producer. The battery sends
  // no uploads, so whatever precedes the request (plus the two-character join) is the state block.
  const userTextChars = tail.endsWith(userText) ? userText.length : 0;
  const state = Math.max(0, tail.length - userTextChars - (userTextChars && tail.length > userTextChars ? 2 : 0));
  const toolSchemas = JSON.stringify(call.tools ?? []).length;
  const trunk = Math.max(0, system.length - protocol);
  return { trunk, protocol, toolSchemas, state, userText: userTextChars, total: trunk + protocol + toolSchemas + state + userTextChars };
}

/** The estimate, per block. */
export function estimateTokens(chars: PromptSplit): PromptSplit {
  const t = (n: number) => Math.ceil(n / CHARS_PER_TOKEN_ESTIMATE);
  return { trunk: t(chars.trunk), protocol: t(chars.protocol), toolSchemas: t(chars.toolSchemas), state: t(chars.state), userText: t(chars.userText), total: t(chars.total) };
}

/**
 * How many characters of `system` are the terminal protocol.
 *
 * The runtime appends one of exactly two blocks, so this is a suffix test against both — not a
 * pattern. A system prompt matching neither reports 0, and the trunk figure then carries the
 * protocol; the battery surfaces that as `protocol: 0`, which is visible rather than silently wrong.
 */
function protocolLengthOf(system: string): number {
  for (const replyOnly of [false, true]) {
    const block = terminalProtocol(replyOnly);
    if (system.endsWith(block)) return block.length;
  }
  return 0;
}

export interface TrunkStability {
  /** Every distinct system-message hash seen across the conversation, in first-seen order. */
  hashes: string[];
  /** How many generations were sampled. */
  samples: number;
  /** One distinct hash across every generation of the conversation. */
  stable: boolean;
}

/**
 * Trunk stability over ONE conversation: the system message of EVERY generation — main turns,
 * forced-terminal fallbacks and redrives alike — hashed and compared.
 *
 * Sampling every generation matters: a redrive re-renders nothing (it reuses the turn's
 * instructions), so a run whose redrive drifted would be invisible to an endpoint-only sample.
 */
export function trunkStability(calls: readonly RecordedCall[]): TrunkStability {
  const hashes: string[] = [];
  for (const call of calls) {
    const h = sha256(systemOf(call));
    if (!hashes.includes(h)) hashes.push(h);
  }
  return { hashes, samples: calls.length, stable: hashes.length <= 1 };
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}
