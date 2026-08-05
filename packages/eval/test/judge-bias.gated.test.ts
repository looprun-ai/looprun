/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SELF-JUDGEMENT BIAS MEASUREMENT. GATED. This file does nothing in the everyday run.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * One direct model call per fixture per repetition — the SHIPPED envelope, the SHIPPED question and
 * the SHIPPED reader, no agent, no tools, no engine. The call is the one a bound `llmCheckLie` makes,
 * and the answer is read the way the runtime reads it.
 *
 * ```
 *   pnpm -r build \
 *     && LOOPRUN_BATTERY=1 GOOGLE_GENERATIVE_AI_API_KEY=<key> \
 *        pnpm -C packages/eval exec vitest run test/judge-bias.gated.test.ts
 * ```
 *
 * Every repetition is recorded, not only the fold: a fixture whose verdict flips between repetitions
 * is itself the finding, and an averaged number would hide it. Output lands beside the recording as
 * `JUDGE-BIAS.json`. The fold that turns those outcomes into the two shipped numbers runs on every
 * commit, without a key, in `judge-bias-metrics.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { judgePrompt, readJudgeVerdict, LIE_QUESTION } from '@looprun-ai/core/internal';
import type { GuardCtx } from '@looprun-ai/core';
import { batterySkipReason } from './battery/gate.js';
import { BIAS_FIXTURES, foldBias, type BiasFixture, type BiasOutcome } from './battery/judge-bias.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');
const REPS = Number(process.env.LOOPRUN_BIAS_REPS ?? 3);

const ctxFor = (f: BiasFixture): GuardCtx => ({
  args: {},
  world: { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] },
  observed: [],
  turnIndex: f.history.length,
  userText: '',
  history: f.history as unknown as GuardCtx['history'],
  reply: f.reply,
  did: f.did,
});

describe('the same-model judge against known verdicts', () => {
  const skip = batterySkipReason();
  it.skipIf(skip !== null)('measures false negatives and false positives', async () => {
    const { model, modelParams } = geminiFlashLiteThinkOff();
    const outcomes: BiasOutcome[] = [];
    const perRepetition: Array<{ id: string; rep: number; violates: boolean; denied: boolean; answer: string }> = [];
    for (const f of BIAS_FIXTURES) {
      for (let rep = 0; rep < REPS; rep++) {
        const { text } = await generateText({
          model,
          prompt: judgePrompt(LIE_QUESTION, ctxFor(f)),
          ...modelParams,
        });
        const { violation } = readJudgeVerdict(text);
        const denied = violation !== null;
        outcomes.push({ id: f.id, violates: f.violates, denied });
        perRepetition.push({ id: f.id, rep, violates: f.violates, denied, answer: text.trim().split('\n')[0] ?? '' });
      }
    }
    const fold = foldBias(outcomes);
    // A fixture the judge answered differently across repetitions is not a stable verdict, and the
    // fold alone cannot show that — so the flip is named in the output beside the two numbers.
    const flipped = [...new Set(BIAS_FIXTURES.map((f) => f.id))].filter((id) => {
      const answers = new Set(perRepetition.filter((r) => r.id === id).map((r) => r.denied));
      return answers.size > 1;
    });
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      join(OUT_DIR, 'JUDGE-BIAS.json'),
      JSON.stringify({ model: 'geminiFlashLiteThinkOff', repetitions: REPS, fold, flipped, perRepetition }, null, 2),
    );
    expect(fold.total).toBe(BIAS_FIXTURES.length);
  }, 900_000);
});
