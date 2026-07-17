// dump-prompt — render the EXACT looprun system prompt (scoped trunk + terminal protocol) and the
// state-in-tail user message for the agents of the active project, OFFLINE (worldFactory, no model,
// no server). This is the `<dir>` producer that margin-probe.py opens: for each agent it writes
//   <dir>/<agent>.system.txt   — plain system-prompt text (renderScopedSpecTrunk + terminal protocol)
//   <dir>/<agent>.tools.json   — a JSON array of tool defs (surface + terminals) for openai_tools()
//   <dir>/<agent>.user.txt     — the state-in-tail user message (state block + optional user text)
//
// Mirrors the runtime wire (run-conversation.ts): theme = spec.theme ?? config.theme; the system is
// renderPrompt(world, []) + terminalProtocol(replyOnly); replyOnly = spec.controls.terminal?(world);
// the volatile state block rides the USER MESSAGE tail (state-in-tail law), never the trunk.
//
// Input (JSON on stdin):
//   { "outDir": "/abs/dir", "agent": "billing"|null, "preset": "default", "userText": "" }
// agent=null ⇒ dump every spec in config.specs. Output: one summary line per agent on stdout.
//
// The project (looprun.eval.config.{ts,js}) is resolved via $LOOPRUN_ROOT / cwd, and @looprun-ai/eval
// + @looprun-ai/core are loaded from THAT project's install — so this works whether the skill runs
// in-repo or was added user-wide via `npx skills add`.
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

interface DumpInput {
  outDir: string;
  agent?: string | null;
  preset?: string;
  userText?: string;
}

const raw = await new Promise<string>((res) => {
  let s = '';
  process.stdin.on('data', (d) => (s += d));
  process.stdin.on('end', () => res(s));
});
const input = JSON.parse(raw) as DumpInput;
if (!input.outDir) throw new Error('dump-prompt: input.outDir is required');

// Resolve the project's harness + runtime from the PROJECT (not from this script's own location), so
// a user-wide install still finds the project's install. loadConfig walks up from LOOPRUN_ROOT / cwd.
const projectRoot = process.env.LOOPRUN_ROOT ?? process.cwd();
const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
const evalPath = requireFromProject.resolve('@looprun-ai/eval');
const evalUrl = pathToFileURL(evalPath).href;
// @looprun-ai/core is a (possibly transitive) dep of @looprun-ai/eval — resolve it relative to the
// eval package so a project that only depends on eval still finds the runtime renderer.
const coreUrl = pathToFileURL(createRequire(evalPath).resolve('@looprun-ai/core')).href;
const { loadConfig } = (await import(evalUrl)) as { loadConfig: (startDir?: string) => Promise<{ config: any }> };
const core = (await import(coreUrl)) as {
  renderScopedSpecTrunk: (world: any, spec: any, uploads: string[], theme: any) => string;
  terminalProtocol: (replyOnly: boolean) => string;
  terminalToolDefs: () => any[];
  TERMINAL_TOOLS: readonly string[];
};
const { config } = await loadConfig(projectRoot);

const specs: Record<string, any> = config.specs ?? {};
const agentIds = input.agent ? [input.agent] : Object.keys(specs);
if (input.agent && !specs[input.agent]) {
  throw new Error(`dump-prompt: agent "${input.agent}" is not in specs. Have: ${Object.keys(specs).join(', ')}`);
}
// The scoped trunk is state-INVARIANT, so any valid preset yields the same system prompt; the preset
// only shapes the state block in the .user.txt tail. Default to a real project preset (the first
// case's) so worldFactory constructs — projects rarely name a preset "default".
const preset = input.preset ?? (config.cases ?? [])[0]?.setup?.preset ?? 'default';
const userText = input.userText ?? '';
const toolDefs: any[] = config.toolDefs ?? [];
const terminalDefs = core.terminalToolDefs();
const defByName = (name: string): any => toolDefs.find((d) => d.name === name) ?? terminalDefs.find((d) => d.name === name);

mkdirSync(input.outDir, { recursive: true });

for (const agentId of agentIds) {
  const spec = specs[agentId];
  const theme = spec.theme ?? config.theme;
  const world: any = config.worldFactory(preset, 0);

  // replyOnly + terminal protocol + active surface exactly as the runtime resolves them per turn.
  const replyOnly = spec.controls?.terminal ? spec.controls.terminal(world) === true : false;
  const renderPrompt = spec.surface.systemPrompt ?? ((w: any, u: string[]) => core.renderScopedSpecTrunk(w, spec, u, theme));
  const system = renderPrompt(world, []) + core.terminalProtocol(replyOnly);

  // state-in-tail: the volatile state block rides the USER message, never the trunk.
  const stateBlock = theme?.stateBlock ? String(theme.stateBlock(world) ?? '') : '';
  const user = (stateBlock && stateBlock.trim() ? `## Account state\n${stateBlock}\n\n` : '') + userText;

  // surface actually offered this turn: spec surface + terminals (askUser dropped when replyOnly).
  const surface = new Set<string>([...spec.surface.tools, 'replyToUser', ...(replyOnly ? [] : ['askUser'])]);
  const defs = [...surface].map(defByName).filter(Boolean);

  writeFileSync(path.join(input.outDir, `${agentId}.system.txt`), system);
  writeFileSync(path.join(input.outDir, `${agentId}.user.txt`), user);
  writeFileSync(path.join(input.outDir, `${agentId}.tools.json`), JSON.stringify(defs, null, 1));
  process.stdout.write(
    `${agentId}: system ${system.length}ch (~${Math.round(system.length / 4)}t) | user ${user.length}ch | ` +
      `tools ${defs.length}/${toolDefs.length}${replyOnly ? ' (reply-only)' : ''}\n`,
  );
}
process.stderr.write(`dump-prompt (${config.domain}/${preset}) → ${input.outDir} · ${agentIds.length} agent(s)\n`);
