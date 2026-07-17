#!/usr/bin/env node
// synth-fork.mjs — the AUTONOMOUS margin-probe fork builder. Produces the same fork-context JSON that
// margin-probe.py consumes, but from a SYNTHESIZED context (a case + its deterministic world) with
// ZERO prior real runs — where extract-fork.mjs needs a banked PASS run AND a banked FAIL run.
//
// It replays a case's deterministic world byte-faithfully (the project's `worldFactory` + `world.exec`
// seam from looprun.eval.config.ts, no model in the loop) through an AUTHORED trajectory. The author
// declares the decision fork (correct tool vs the tempting/forbidden twin — the anti-magnet) from the
// case + eval intent; the world supplies faithful tool results. This is the from-scratch path the
// measured loop's "Margin screen (post-E2)" calls for: no history to bank first.
//
//   node synth-fork.mjs <spec.json> <out.json>
//
// <spec.json> is the synth-fork input contract (see synth-fork.mts header):
//   { "caseId": "...", "agent": "client-books",
//     "forkTurn": 0, "priorCalls": [ { "turn": 0, "name": "listClients", "args": {} } ],
//     "expect": { "kind": "tool-name", "correct": "setFiscalRegime", "wrong": "createClient" } }
//
// Then feed <out.json> to margin-probe.py exactly like an extract-fork.mjs context:
//   margin-probe.py battery <out.json> --dump <dir> --agent <id>
//
// The script self-locates the looprun project (LOOPRUN_ROOT / walk-up for looprun.eval.config.{ts,js})
// so it works in-repo or installed user-wide, matching the other skill scripts. The world-stepper runs
// on the project's own tsx (devDependency) so it resolves the project's @looprun-ai/eval + agent bundle.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [specFile, outFile] = process.argv.slice(2);
if (!outFile) {
  console.error('usage: synth-fork.mjs <spec.json> <out.json>');
  process.exit(1);
}

const CONFIG_NAMES = ['looprun.eval.config.ts', 'looprun.eval.config.mts', 'looprun.eval.config.js', 'looprun.eval.config.mjs'];
const isProject = (d) => {
  try { return CONFIG_NAMES.some((n) => fs.statSync(path.join(d, n)).isFile()); } catch { return false; }
};
const walkUp = (start) => {
  let d = start;
  while (d && d !== path.dirname(d)) {
    if (isProject(d)) return d;
    d = path.dirname(d);
  }
  return null;
};
const resolveRoot = () => {
  if (process.env.LOOPRUN_ROOT && isProject(process.env.LOOPRUN_ROOT)) return process.env.LOOPRUN_ROOT;
  return walkUp(process.cwd()) || walkUp(path.dirname(fileURLToPath(import.meta.url)));
};
const root = resolveRoot();
if (!root) {
  console.error('synth-fork: cannot find a looprun project (no looprun.eval.config.{ts,js} found).');
  console.error('  Fix: run from inside the project, or export LOOPRUN_ROOT=/path/to/project');
  process.exit(1);
}

const spec = fs.readFileSync(specFile, 'utf8');
JSON.parse(spec); // fail fast on malformed spec

// Run the world-stepper on the project's tsx so its imports resolve against the project install.
const stepper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'synth-fork.mts');
const localTsx = path.join(root, 'node_modules', '.bin', 'tsx');
const useLocal = fs.existsSync(localTsx);
const cmd = useLocal ? localTsx : 'npx';
const args = useLocal ? [stepper] : ['--yes', 'tsx', stepper];

const res = spawnSync(cmd, args, {
  cwd: root,
  input: spec,
  env: { ...process.env, LOOPRUN_ROOT: root },
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'inherit'],
});
if (res.status !== 0) {
  console.error(`synth-fork: world-stepper failed${res.error ? ` — ${res.error.message}` : ''}`);
  process.exit(1);
}

// The .mts prints ONE JSON object on stdout (diagnostics go to stderr). Guard against any stray lines.
const stdout = res.stdout ?? '';
const jsonStart = stdout.indexOf('{');
if (jsonStart < 0) { console.error('synth-fork: no JSON on stdout from the world-stepper'); process.exit(1); }
const ctx = JSON.parse(stdout.slice(jsonStart));
fs.writeFileSync(outFile, JSON.stringify(ctx, null, 1));
console.log(
  `${ctx.caseId}: SYNTHESIZED fork (${ctx.domain}/${ctx.preset}) forkTurn=${ctx.forkTurn} — ` +
    `${ctx.messages.length} shared msgs` +
    (ctx.expect ? ` · ${ctx.expect.correct} vs ${ctx.expect.wrong}` : ' · margin-screen only') +
    ` → ${outFile}`,
);
