/**
 * The sim runner: model server up → sandbox HERMES_HOME → one real `hermes chat -q` per task →
 * assert the fake-world end-state → report. Non-zero exit on any failure.
 *
 * SIM_BASELINE=1 swaps the governed server for the hand-rolled RAW server (raw-server.ts): the
 * same tasks, worlds and tools with ZERO looprun code in the path — the governed-vs-raw A/B.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModelServer } from '@looprun-ai/server';
import type { TurnEvent } from '@looprun-ai/server';
import { backingModel, buildAgents, rawDomains } from './agents.js';
import { hermesBin, runHermesTask, writeHermesHome } from './hermes.js';
import { createRawServer } from './raw-server.js';
import { TASKS } from './tasks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<number> {
  if (!process.env.OPENROUTER_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error(
      'A backing-model key is required: OPENROUTER_API_KEY (SIM_MODEL, default nemotron-3-ultra free) ' +
        'or GOOGLE_GENERATIVE_AI_API_KEY (gemini-3.1-flash-lite).',
    );
    return 2;
  }

  const baseline = process.env.SIM_BASELINE === '1';
  const turns: TurnEvent[] = [];
  let serverUrl: string;
  let closeServer: () => Promise<void>;
  let registry: ReturnType<typeof buildAgents> | null = null;
  let rawServer: Awaited<ReturnType<typeof createRawServer>> | null = null;

  if (baseline) {
    const domains = rawDomains();
    const { model, modelParams } = backingModel();
    rawServer = await createRawServer({ domains, model, modelParams, maxSteps: 12 });
    serverUrl = rawServer.url;
    closeServer = rawServer.close;
    console.log('RAW BASELINE MODE: hand-rolled server, zero looprun code in the path');
    console.log(`raw server up at ${serverUrl} — models: ${Object.keys(domains).join(', ')}`);
  } else {
    registry = buildAgents();
    const server = await createModelServer({
      agents: Object.fromEntries(Object.entries(registry).map(([id, entry]) => [id, entry.agent])),
      onTurn: (event) => turns.push(event),
    });
    serverUrl = server.url;
    closeServer = server.close;
    console.log(`model server up at ${serverUrl} — models: ${Object.keys(registry).join(', ')}`);
  }
  console.log(`hermes cli: ${hermesBin()}`);

  const home = join(ROOT, '.hermes-home');
  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  writeHermesHome(home, serverUrl);

  let failed = 0;
  try {
    let first = true;
    for (const task of TASKS) {
      // Free-tier pacing: let the per-minute rate-limit window reset between tasks.
      if (!first && process.env.OPENROUTER_API_KEY) await new Promise((r) => setTimeout(r, 60_000));
      first = false;
      const modelId = baseline ? `${task.model}-raw` : task.model;
      console.log(`\n━━ ${task.title}\n   model=${modelId}`);
      const before = baseline ? rawServer!.requests.length : turns.length;
      let run;
      try {
        run = await runHermesTask({ home, model: modelId, prompt: task.prompt, timeoutMs: 480_000 });
      } catch (error) {
        failed++;
        console.error(`   ✖ harness run failed: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (run.code !== 0) {
        failed++;
        console.error(`   ✖ hermes exited ${run.code}\n${run.stderr.slice(-2000)}`);
        continue;
      }

      let world: unknown;
      if (baseline) {
        const reqs = rawServer!.requests.slice(before).filter((r) => r.model === modelId);
        if (reqs.length === 0) {
          failed++;
          console.error('   ✖ the harness never reached the raw server (0 requests observed)');
          continue;
        }
        for (const r of reqs.filter((r) => !r.ok)) console.error(`   raw turn error: ${r.error}`);
        world = rawServer!.getWorld(modelId);
        console.log(`   requests=${reqs.length} (${run.durationMs} ms)`);
        console.log('   guard corrections observed: n/a (raw — no governance in the path)');
      } else {
        const taskTurns = turns.slice(before).filter((t) => t.model === modelId);
        if (taskTurns.length === 0) {
          failed++;
          console.error('   ✖ the harness never reached the model server (0 governed turns observed)');
          continue;
        }
        const sessionId = taskTurns[taskTurns.length - 1]!.sessionId;
        world = (registry as Record<string, { agent: any }>)[modelId]!.agent.getSession(sessionId).world;
        const corrections = taskTurns.flatMap((t) => t.meta.corrections);
        console.log(`   turns=${taskTurns.length} session=${sessionId} (${run.durationMs} ms)`);
        console.log(`   guard corrections observed: ${corrections.length ? corrections.join(', ') : 'none'}`);
      }

      const failures = task.assert(world);
      const reply = run.stdout.trim().split('\n').slice(-3).join('\n   ');
      console.log(`   harness saw: ${reply.slice(0, 400)}`);
      if (failures.length) {
        failed++;
        for (const f of failures) console.error(`   ✖ ${f}`);
      } else {
        console.log('   ✔ end-state assertions pass');
      }
    }
  } finally {
    await closeServer();
  }

  console.log(`\n${TASKS.length - failed}/${TASKS.length} tasks passed`);
  return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
