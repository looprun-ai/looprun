/**
 * Signal-mechanics probes — verifies HOW each guard hook surfaces in a turnRecord when driven by the
 * scripted model, so proof authors can rely on these conventions:
 *
 *  - preTool veto     → recoveryEvents `${dim}:${kind}:${tool}` (call lands ok:false; the model sees a
 *                       failure result and continues with the NEXT script step).
 *  - onReply redrive  → recoveryEvents `redrive:${kind}`; the redrive re-generates ONE respond
 *                       (respond-only, toolChoice pinned) — a correction step returning a plain
 *                       `{ text: '…' }` part falls back to that text, which is what these probes use.
 *  - postTool report  → recoveryEvents `output:${kind}:${tool}` AND the violation joins the same
 *                       redrive set (so a clean `{ text }` step clears it in one redrive).
 *  - onInput refusal  → recoveryEvents `onInput:${kind}`; the turn is tripwired (no domain tool calls).
 *  - empty terminal   → a `respond` with EMPTY message does not set the terminal reply → the runtime
 *                       forces a terminal (`forced-terminal` tag) BEFORE the onReply checks; scripts
 *                       should always close with a NON-empty `respond` unless probing that path.
 */
import { describe, expect, it } from 'vitest';
import { custom, resultInvariant } from '@looprun-ai/core';
import { buildIsolatedSpec, type GuardProof } from '@looprun-ai/core/testing';
import { runProofLoop } from '../../src/testing/index.js';
import { nothingDone } from '../delivery.js';

const turn = (userText: string) => ({ userText });

describe('signal mechanics (proof-authoring conventions)', () => {
  it('onReply redrive: correction step is a plain text part, tag redrive:<kind>', async () => {
    // A text-reading `custom` behavior guard supplies the redrive trigger (a test-local
    // custom guard may still read ctx.reply): it fires until the message says "done", so the redrive's
    // free-text continuation satisfies it.
    const proof: GuardProof = {
      guard: 'saysDone',
      make: () =>
        custom({
          kind: 'saysDone', dim: 'behavior',
          check: (ctx) => (/done/i.test(ctx.reply ?? '') ? null : 'Your reply must say what was done — include the word "done".'),
          prose: () => '',
        }),
      hook: 'onReply',
      target: 'any',
      cases: [],
    };
    const spec = buildIsolatedSpec(proof);
    const res = await runProofLoop(spec, {
      preset: 'empty',
      turns: [turn('set it up')],
      script: [
        [{ tool: 'respond', args: { message: 'All set.', did: [{ op: 'inform' }] } }],
        // The redrive re-generates a WHOLE respond payload — a candidate that declares nothing is
        // denied by the engine's declaration floor, so a free-text redrive is not a fixture
        // the runtime would accept.
        [{ tool: 'respond', args: { message: 'Done — it is all set.', did: [{ op: 'inform' }] } }],
      ],
      expect: 'redrive',
    });
    expect(res.errorMsg).toBeUndefined();
    const rec = res.turnRecords[0];
    expect(rec.recoveryEvents).toContain('redrive:saysDone');
    expect(rec.assistantFinalText).toBe(nothingDone('Done — it is all set.'));
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
        [{ tool: 'respond', args: { message: 'The status was checked.', did: [{ op: 'inform' }] } }],
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
      script: [[{ tool: 'respond', args: { message: 'never reached', did: [{ op: 'inform' }] } }]],
      expect: 'refusal',
    });
    const rec = res.turnRecords[0];
    expect(rec.recoveryEvents).toContain('onInput:custom');
    expect(rec.toolCalls).toHaveLength(0);
  });

  it('empty terminal text: forced-terminal fires before the onReply checks', async () => {
    const proof: GuardProof = {
      guard: 'saysReady',
      make: () =>
        custom({
          kind: 'saysReady', dim: 'behavior',
          check: (ctx) => (/ready/i.test(ctx.reply ?? '') ? null : 'Say it is ready.'),
          prose: () => '',
        }),
      hook: 'onReply',
      target: 'any',
      cases: [],
    };
    const spec = buildIsolatedSpec(proof);
    const res = await runProofLoop(spec, {
      preset: 'empty',
      turns: [turn('anything')],
      script: [
        [{ tool: 'respond', args: { message: '', did: [{ op: 'inform' }] } }], // empty → terminalReply unset
        [{ tool: 'respond', args: { message: 'It is ready.', did: [{ op: 'inform' }] } }], // forced-terminal retry
      ],
      expect: 'pass',
    });
    const rec = res.turnRecords[0];
    expect(rec.recoveryEvents).toContain('forced-terminal');
    expect(rec.assistantFinalText).toBe(nothingDone('It is ready.'));
  });
});
