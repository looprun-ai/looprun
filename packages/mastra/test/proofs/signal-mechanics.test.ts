/**
 * Signal-mechanics probes — verifies HOW each guard hook surfaces in a turnRecord when driven by the
 * scripted model, so proof authors can rely on these conventions:
 *
 *  - preTool veto     → recoveryEvents `${dim}:${kind}:${tool}` (call lands ok:false; the model sees a
 *                       failure result and continues with the NEXT script step).
 *  - onReply redrive  → recoveryEvents `redrive:${kind}`; the redrive re-generate runs with
 *                       toolChoice:'none' and takes `re.text` — so the correction script step MUST be a
 *                       plain `{ text: '…' }` part, NEVER a replyToUser call.
 *  - postTool report  → recoveryEvents `output:${kind}:${tool}` AND the violation joins the same
 *                       redrive set (so a clean `{ text }` step clears it in one redrive).
 *  - onInput refusal  → recoveryEvents `onInput:${kind}`; the turn is tripwired (no domain tool calls).
 *  - empty terminal   → a replyToUser with EMPTY text does not set the terminal reply → the runtime
 *                       forces a terminal (`forced-terminal` tag) BEFORE the onReply checks; scripts
 *                       should always close with a NON-empty replyToUser unless probing that path.
 */
import { describe, expect, it } from 'vitest';
import { custom, replyMustMention, resultInvariant } from '@looprun-ai/core';
import { buildIsolatedSpec, type GuardProof } from '@looprun-ai/core/testing';
import { runProofLoop } from '../../src/testing/index.js';

const turn = (userText: string) => ({ userText });

describe('signal mechanics (proof-authoring conventions)', () => {
  it('onReply redrive: correction step is a plain text part, tag redrive:<kind>', async () => {
    const proof: GuardProof = {
      guard: 'replyMustMention',
      make: () => replyMustMention(['done'], 'Your reply must say what was done — include the word "done".'),
      hook: 'onReply',
      target: 'any',
      cases: [],
    };
    const spec = buildIsolatedSpec(proof);
    const res = await runProofLoop(spec, {
      preset: 'empty',
      turns: [turn('set it up')],
      script: [
        [{ tool: 'replyToUser', args: { text: 'All set.' } }],
        [{ text: 'Done — it is all set.' }], // redrive step: PLAIN TEXT (toolChoice:'none')
      ],
      expect: 'redrive',
    });
    expect(res.errorMsg).toBeUndefined();
    const rec = res.turnRecords[0];
    expect(rec.recoveryEvents).toContain('redrive:replyMustMention');
    expect(rec.assistantFinalText).toBe('Done — it is all set.');
  });

  it('postTool report: output:<kind>:<tool> tag + joins the redrive set (cleared by one text step)', async () => {
    const proof: GuardProof = {
      guard: 'resultInvariant',
      make: () => resultInvariant((r) => ((r as { count?: number }).count ?? 0) > 0, 'The status shows no items — report the discrepancy instead of a routine summary.'),
      hook: 'postTool',
      target: ['reportStatus'],
      cases: [],
    };
    const spec = buildIsolatedSpec(proof);
    const res = await runProofLoop(spec, {
      preset: 'seeded-media', // no items in this preset → reportStatus count 0 → invariant fails
      turns: [turn('check the status')],
      script: [
        [{ tool: 'reportStatus', args: {} }],
        [{ tool: 'replyToUser', args: { text: 'The status was checked.' } }],
        [{ text: 'The status was checked — the count does not match the expected zero.' }],
      ],
      expect: 'redrive',
      tool: 'reportStatus',
    });
    expect(res.errorMsg).toBeUndefined();
    const rec = res.turnRecords[0];
    expect(rec.recoveryEvents).toContain('output:resultInvariant:reportStatus');
    expect(rec.recoveryEvents).toContain('redrive:resultInvariant');
  });

  it('onInput refusal: onInput:<kind> tag, turn tripwired with no domain tool calls', async () => {
    const proof: GuardProof = {
      guard: 'custom',
      make: () =>
        custom({
          kind: 'custom',
          dim: 'run',
          check: (ctx) => (ctx.world.hasPrimary() ? null : 'No primary item is set yet — onboarding first.'),
          prose: () => 'requires a primary item',
        }),
      hook: 'onInput',
      target: 'any',
      cases: [],
    };
    const spec = buildIsolatedSpec(proof);
    const res = await runProofLoop(spec, {
      preset: 'empty', // hasPrimary() false → refusal
      turns: [turn('create something')],
      script: [[{ tool: 'replyToUser', args: { text: 'never reached' } }]],
      expect: 'refusal',
    });
    const rec = res.turnRecords[0];
    expect(rec.recoveryEvents).toContain('onInput:custom');
    expect(rec.toolCalls).toHaveLength(0);
  });

  it('empty terminal text: forced-terminal fires before the onReply checks', async () => {
    const proof: GuardProof = {
      guard: 'replyMustMention',
      make: () => replyMustMention(['ready'], 'Say it is ready.'),
      hook: 'onReply',
      target: 'any',
      cases: [],
    };
    const spec = buildIsolatedSpec(proof);
    const res = await runProofLoop(spec, {
      preset: 'empty',
      turns: [turn('anything')],
      script: [
        [{ tool: 'replyToUser', args: { text: '' } }], // empty → terminalReply unset
        [{ tool: 'replyToUser', args: { text: 'It is ready.' } }], // forced-terminal retry
      ],
      expect: 'pass',
    });
    const rec = res.turnRecords[0];
    expect(rec.recoveryEvents).toContain('forced-terminal');
    expect(rec.assistantFinalText).toBe('It is ready.');
  });
});
