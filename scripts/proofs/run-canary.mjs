#!/usr/bin/env node
/**
 * Run the SLM canary — the report-only robustness lane that replays the deterministic guard
 * scenarios against a REAL small local model (see governance/GOVERNANCE.md). It NEVER gates a PR.
 *
 * Availability-first: this often runs on a machine WITHOUT the model weights (e.g. a contributor's
 * laptop). So it checks the model status FIRST; when the binary or the GGUF is missing it writes a
 * `{ skipped: true }` artifact, prints a friendly note, and exits 0 — a skipped canary is not a
 * failure. When the model IS available it spawns the isolated canary vitest lane and prints the tally.
 *
 * Usage: node scripts/proofs/run-canary.mjs [--model micro|minimal|normal|pro]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ARTIFACTS = join(ROOT, 'governance', '.artifacts');
const OUT = join(ARTIFACTS, 'canary.json');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const model = argValue('--model', 'micro');

/** Load the models package — via the workspace specifier, falling back to its built dist. */
async function loadModels() {
  try {
    return await import('@looprun-ai/models');
  } catch {
    return import(join(ROOT, 'packages', 'models', 'dist', 'index.js'));
  }
}

function writeSkipped(reason) {
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(OUT, JSON.stringify({ skipped: true, reason, model }, null, 2) + '\n');
}

async function main() {
  let status;
  try {
    const { localModelStatus } = await loadModels();
    status = await localModelStatus(model);
  } catch (e) {
    writeSkipped(`could not query model status: ${e?.message ?? String(e)}`);
    console.log(`canary skipped (model ${model} not available locally): ${e?.message ?? String(e)}`);
    process.exit(0);
  }

  const available = status.server.up || (status.binary.ok && status.modelFile.exists);
  if (!available) {
    const reason = !status.binary.ok
      ? status.binary.note ?? 'llama-server binary not found'
      : !status.modelFile.exists
        ? `model file missing: ${status.modelFile.path}`
        : 'model not available';
    writeSkipped(reason);
    console.log(`canary skipped (model ${model} not available locally): ${reason}`);
    process.exit(0);
  }

  console.log(`canary: model ${model} available — running the real-model lane (this can take minutes)…`);
  const res = spawnSync(
    'pnpm',
    ['-C', 'packages/mastra', 'exec', 'vitest', 'run', '--config', 'vitest.canary.config.ts'],
    { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CANARY_MODEL: model } },
  );

  if (existsSync(OUT)) {
    try {
      const a = JSON.parse(readFileSync(OUT, 'utf8'));
      if (!a.skipped) {
        console.log(`\ncanary (model ${a.model}) — pass ${a.passRate}  [report-only, never gates]`);
        console.log(
          `  caught ${a.totals.caught}  clean ${a.totals.clean}  exhausted ${a.totals.exhausted}  error ${a.totals.error}  (total ${a.totals.total})`,
        );
      }
    } catch {
      /* leave the raw artifact for inspection */
    }
  }
  process.exit(res.status ?? 0);
}

main();
