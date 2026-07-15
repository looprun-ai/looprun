/**
 * SLM CANARY — the report-only robustness lane (NOT a .test.ts, so it never runs in the default
 * vitest lanes; drive it with `pnpm proofs:canary`).
 *
 * The deterministic proof suite drives the guards with a SCRIPTED fake LLM (the hard CI gate). This
 * lane re-runs the SAME governed scenarios with a REAL small LOCAL model — no script — and asks the
 * one question a deterministic proof cannot: *with a real small model behaving naturally, do governed
 * turns still end compliant?* It is NON-DETERMINISTIC by nature and NEVER gates a PR.
 *
 * Outcome taxonomy (per scenario):
 *   - caught    — the runtime intervened (a guard veto/redrive/refusal/report, a forced-terminal, or a
 *                 reply mutator) and the governed turn still closed;
 *   - clean     — zero recovery events (the model behaved on its own);
 *   - exhausted — the guards caught it but the model never produced a compliant reply, so honest-abstain
 *                 fired (`exhaustion-terminal` / `exhaustion-salvage`);
 *   - error     — the run threw / set errorMsg.
 *
 * PASS-RATE: `caught + clean + exhausted` are ALL compliant outcomes (the governed turn ended safely);
 * only `error` counts as a failure. Each scenario is a vitest `it` that asserts ONLY `outcome !== 'error'`
 * — everything else is data written to `governance/.artifacts/canary.json`, not a test failure.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCollectiveSpec, FixtureWorld, FIXTURE_TOOL_DEFS } from '@looprun-ai/core/testing';
import type { RunResult } from '@looprun-ai/core';
// eslint-disable-next-line import/no-extraneous-dependencies -- devDependency, canary-only
import { localModel } from '@looprun-ai/models';
import { GUARD_PROOFS } from '../../core/test/proofs/catalog.js';
import { runSpecConversation } from '../src/run-conversation.js';

const MODEL_ALIAS = process.env.CANARY_MODEL ?? 'micro';

// ONE collective spec carries every non-skipped guard (built once, reused across scenarios).
const SPEC = buildCollectiveSpec(GUARD_PROOFS);

// The real local model is resolved once and shared (single-thread sequential run → no races).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModel(): Promise<any> {
  return (modelPromise ??= localModel(MODEL_ALIAS));
}

type Outcome = 'caught' | 'clean' | 'exhausted' | 'error';

/** Classify a real-model run into the compliant taxonomy (only `error` is a failure). */
function classify(res: RunResult): { outcome: Outcome; recoveryEvents: string[] } {
  const events = res.turnRecords.flatMap((r) => r.recoveryEvents ?? []);
  if (res.errorMsg || events.includes('error')) return { outcome: 'error', recoveryEvents: events };
  if (events.includes('exhaustion-terminal') || events.includes('exhaustion-salvage')) {
    return { outcome: 'exhausted', recoveryEvents: events };
  }
  if (events.length > 0) return { outcome: 'caught', recoveryEvents: events };
  return { outcome: 'clean', recoveryEvents: events };
}

interface ScenarioResult {
  guard: string;
  name: string;
  polarity: string;
  outcome: Outcome;
  recoveryEvents: string[];
}

const scenarios: ScenarioResult[] = [];

// Register one `it` per (proof, l3 case, polarity). Content-contract reply guards (collective:'skip')
// are excluded exactly as in the deterministic collective proof.
for (const proof of GUARD_PROOFS.filter((p) => p.collective !== 'skip')) {
  const loopCases = proof.cases.filter((c) => c.l3 !== undefined);
  if (!loopCases.length) continue;
  describe(`canary · ${proof.guard}`, () => {
    for (const c of loopCases) {
      it(`canary · ${proof.guard} · ${c.name}`, async () => {
        const l3 = c.l3!;
        let outcome: Outcome;
        let recoveryEvents: string[];
        try {
          const model = await getModel();
          const res = await runSpecConversation(SPEC, l3.turns, {
            model,
            modelParams: {},
            world: new FixtureWorld(l3.preset),
            toolDefs: FIXTURE_TOOL_DEFS,
            stopOnRepeatedToolCall: true, // mirror the local-model gate of the certified lineage
          });
          ({ outcome, recoveryEvents } = classify(res));
        } catch (e) {
          outcome = 'error';
          recoveryEvents = [`threw:${(e as Error)?.message ?? String(e)}`];
        }
        scenarios.push({ guard: proof.guard, name: c.name, polarity: c.polarity, outcome, recoveryEvents });
        // The ONLY assertion — a governed turn that ended safely (caught/clean/exhausted) passes.
        expect(outcome, `recoveryEvents: [${recoveryEvents.join(', ')}]`).not.toBe('error');
      });
    }
  });
}

afterAll(() => {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..', '..', '..');
  const artifactsDir = join(root, 'governance', '.artifacts');
  mkdirSync(artifactsDir, { recursive: true });

  const totals = {
    caught: scenarios.filter((s) => s.outcome === 'caught').length,
    clean: scenarios.filter((s) => s.outcome === 'clean').length,
    exhausted: scenarios.filter((s) => s.outcome === 'exhausted').length,
    error: scenarios.filter((s) => s.outcome === 'error').length,
    total: scenarios.length,
  };
  const compliant = totals.caught + totals.clean + totals.exhausted;
  const artifact = {
    model: MODEL_ALIAS,
    startedAt: null,
    scenarios,
    totals,
    passRate: `${compliant}/${totals.total}`,
  };
  writeFileSync(join(artifactsDir, 'canary.json'), JSON.stringify(artifact, null, 2) + '\n');
});
