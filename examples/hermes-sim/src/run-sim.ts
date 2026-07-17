/**
 * The sim runner: model server up → sandbox HERMES_HOME → one real `hermes chat -q` per task →
 * assert the fake-world end-state → report. Non-zero exit on any failure.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModelServer } from '@looprun-ai/server';
import type { TurnEvent } from '@looprun-ai/server';
import { buildAgents } from './agents.js';
import { hermesBin, runHermesTask, writeHermesHome } from './hermes.js';
import { TASKS } from './tasks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<number> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error('GOOGLE_GENERATIVE_AI_API_KEY is required (the governed agents run on gemini-3.1-flash-lite).');
    return 2;
  }

  const registry = buildAgents();
  const turns: TurnEvent[] = [];
  const server = await createModelServer({
    agents: Object.fromEntries(Object.entries(registry).map(([id, entry]) => [id, entry.agent])),
    onTurn: (event) => turns.push(event),
  });
  console.log(`model server up at ${server.url} — models: ${Object.keys(registry).join(', ')}`);
  console.log(`hermes cli: ${hermesBin()}`);

  const home = join(ROOT, '.hermes-home');
  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  writeHermesHome(home, server.url);

  let failed = 0;
  try {
    for (const task of TASKS) {
      console.log(`\n━━ ${task.title}\n   model=${task.model}`);
      const before = turns.length;
      let run;
      try {
        run = await runHermesTask({ home, model: task.model, prompt: task.prompt });
      } catch (error) {
        failed++;
        console.error(`   ✖ harness run failed: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const taskTurns = turns.slice(before).filter((t) => t.model === task.model);
      if (run.code !== 0) {
        failed++;
        console.error(`   ✖ hermes exited ${run.code}\n${run.stderr.slice(-2000)}`);
        continue;
      }
      if (taskTurns.length === 0) {
        failed++;
        console.error('   ✖ the harness never reached the model server (0 governed turns observed)');
        continue;
      }
      const sessionId = taskTurns[taskTurns.length - 1]!.sessionId;
      const world = registry[task.model as keyof typeof registry].agent.getSession(sessionId).world;
      const failures = task.assert(world);
      const corrections = taskTurns.flatMap((t) => t.meta.corrections);
      console.log(`   turns=${taskTurns.length} session=${sessionId} (${run.durationMs} ms)`);
      console.log(`   guard corrections observed: ${corrections.length ? corrections.join(', ') : 'none'}`);
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
    await server.close();
  }

  console.log(`\n${TASKS.length - failed}/${TASKS.length} tasks passed`);
  return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
