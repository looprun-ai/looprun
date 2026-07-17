#!/usr/bin/env node
// dump-prompt.mjs — render the byte-exact looprun system prompt + tool defs per agent into a <dir>,
// OFFLINE (worldFactory, no model). This is the `<dir>` producer the margin-probe / synth-fork
// pipeline opens: for each agent it emits <dir>/<agent>.system.txt (plain system prompt) +
// <dir>/<agent>.tools.json (JSON array of tool defs) — the exact byte-shape margin-probe.py reads via
// `--dump <dir> --agent <id>` — plus <dir>/<agent>.user.txt (the state-in-tail user message).
//
//   node dump-prompt.mjs <outDir> [agent] [--preset <p>] [--user <text>]
//   node dump-prompt.mjs .forks/dump              # every agent of the resolved project
//   node dump-prompt.mjs .forks/dump billing      # just one agent
//
// The script self-locates the looprun project (LOOPRUN_ROOT / walk-up for looprun.eval.config.{ts,js})
// so it works in-repo or installed user-wide, matching the other skill scripts. The renderer runs on
// the project's own tsx (devDependency) so it resolves the project's @looprun-ai/{eval,core} + bundle.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const positional = [];
let preset = null; // null ⇒ the worker picks the first case's preset (state-invariant trunk)
let userText = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--preset') preset = argv[++i] ?? preset;
  else if (argv[i] === '--user') userText = argv[++i] ?? userText;
  else positional.push(argv[i]);
}
const [outDir, agent] = positional;
if (!outDir) {
  console.error('usage: dump-prompt.mjs <outDir> [agent] [--preset <p>] [--user <text>]');
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
  console.error('dump-prompt: cannot find a looprun project (no looprun.eval.config.{ts,js} found).');
  console.error('  Fix: run from inside the project, or export LOOPRUN_ROOT=/path/to/project');
  process.exit(1);
}

const spec = JSON.stringify({ outDir: path.resolve(outDir), agent: agent ?? null, preset, userText });

// Run the renderer on the project's tsx so its imports resolve against the project install.
const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dump-prompt.mts');
const localTsx = path.join(root, 'node_modules', '.bin', 'tsx');
const useLocal = fs.existsSync(localTsx);
const cmd = useLocal ? localTsx : 'npx';
const args = useLocal ? [worker] : ['--yes', 'tsx', worker];

const res = spawnSync(cmd, args, {
  cwd: root,
  input: spec,
  env: { ...process.env, LOOPRUN_ROOT: root },
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (res.status !== 0) {
  console.error(`dump-prompt: renderer failed${res.error ? ` — ${res.error.message}` : ''}`);
  process.exit(1);
}
