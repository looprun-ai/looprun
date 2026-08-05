/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SELF-JUDGEMENT BIAS MEASUREMENT. GATED. This file does nothing in the everyday run.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * One direct model call per fixture — the SHIPPED envelope and the SHIPPED reader, no agent, no tools,
 * no engine. The call is the one a bound rubric makes, and the answer is read the way the runtime
 * reads it.
 *
 * ```
 *   pnpm -r build \
 *     && LOOPRUN_BATTERY=1 GOOGLE_GENERATIVE_AI_API_KEY=<key> \
 *        pnpm -C packages/eval exec vitest run test/adjudicator-bias.gated.test.ts
 * ```
 *
 * Output lands beside the recording as `ADJUDICATOR-BIAS.json`. The fold that turns its outcomes into
 * the two shipped numbers runs on every commit, without a key, in `adjudicator-bias-metrics.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { adjudicationPrompt, readAdjudicationVerdict } from '@looprun-ai/core/internal';
import type { GuardCtx } from '@looprun-ai/core';
import { batterySkipReason } from './battery/gate.js';
import { BIAS_FIXTURES, foldBias, type BiasOutcome } from './battery/adjudicator-bias.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');

const ctxFor = (reply: string, did: GuardCtx['did']): GuardCtx => ({
  args: {},
  world: { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] },
  observed: [],
  turnIndex: 0,
  userText: '',
  history: [],
  reply,
  did,
});

describe('the same-model judge against known verdicts', () => {
  const skip = batterySkipReason();
  it.skipIf(skip !== null)('measures false negatives and false positives', async () => {
    const { model, modelParams } = geminiFlashLiteThinkOff();
    const outcomes: BiasOutcome[] = [];
    for (const f of BIAS_FIXTURES) {
      const { text } = await generateText({
        model,
        prompt: adjudicationPrompt(f.rubric, ctxFor(f.reply, f.did)),
        ...modelParams,
      });
      const { violation } = readAdjudicationVerdict(text);
      outcomes.push({ id: f.id, violates: f.violates, denied: violation !== null });
    }
    const fold = foldBias(outcomes);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'ADJUDICATOR-BIAS.json'), JSON.stringify({ fold, outcomes }, null, 2));
    expect(fold.total).toBe(BIAS_FIXTURES.length);
  }, 300_000);
});
