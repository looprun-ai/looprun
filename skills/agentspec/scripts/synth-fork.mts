// synth-fork — build a margin-probe fork context from a SYNTHESIZED context (case + deterministic
// world), with NO prior real PASS/FAIL runs. This is the "skill autonomy" path: instead of diffing
// two banked eval runs (extract-fork.mjs), it replays a case's DETERMINISTIC world (the project's
// `worldFactory` + `world.exec` seam from looprun.eval.config.ts, no model in the loop) through an
// AUTHORED trajectory to emit the exact same fork-context JSON that margin-probe.py already consumes.
//
// Why it can be autonomous: the AgentWorld is fully deterministic and replayable without an LLM, so a
// case's decision-fork context (state block + user text + any faithful prior tool results) renders
// offline. The author declares the intended fork (correct vs the tempting/forbidden tool — the
// anti-magnet twin) from the case + eval intent; the world supplies byte-faithful tool results. This
// is ADDITIVE / authoring-only: nothing on the runtime/measurement path imports it.
//
// Input  (JSON on stdin):
//   {
//     "agent":    "client-books",                // for provenance only (system+tools come from the dump)
//     "caseId":   "04-set-regime-fresh-client",  // a case of the resolved project
//     "forkTurn": 0,                             // optional; the user turn the fork sits on (default: last turn)
//     "priorCalls": [                            // optional; authored calls BEFORE the fork (byte-faithful via the world)
//       { "turn": 0, "name": "listClients", "args": {} }
//     ],
//     "expect": { "kind": "tool-name", "correct": "setFiscalRegime", "wrong": "createClient" }
//   }
// Output (stdout): the extract-fork.mjs JSON shape — { caseId, divergenceIndex, correctNext, wrongNext,
//   expect, messages } — replayable byte-faithfully by margin-probe.py (which prepends the dump's system
//   + tools). `messages` is OpenAI chat format: user (state block + text) → assistant(tool_calls) →
//   tool(result) … stopping exactly BEFORE the decision the fork grades.
//
// The project (looprun.eval.config.{ts,js}) is resolved via $LOOPRUN_ROOT / cwd, and @looprun-ai/eval
// is loaded from that project's install — so this works whether the skill runs in-repo or was added
// user-wide via `npx skills add`.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

interface PriorCall { turn?: number; name: string; args?: Record<string, unknown> }
interface Expect { kind?: string; tool?: string; arg?: string; correct: string; wrong: string }
interface SynthInput {
  agent?: string;
  caseId: string;
  forkTurn?: number;
  priorCalls?: PriorCall[];
  expect?: Expect;
}

const raw = await new Promise<string>((res) => {
  let s = '';
  process.stdin.on('data', (d) => (s += d));
  process.stdin.on('end', () => res(s));
});
const input = JSON.parse(raw) as SynthInput;
if (!input.caseId) throw new Error('synth-fork: input.caseId is required');

// Resolve @looprun-ai/eval from the PROJECT (not from this script's own location), so a user-wide
// install still finds the project's harness. loadConfig walks up from LOOPRUN_ROOT / cwd for the config.
const projectRoot = process.env.LOOPRUN_ROOT ?? process.cwd();
const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
const evalUrl = pathToFileURL(requireFromProject.resolve('@looprun-ai/eval')).href;
const { loadConfig } = (await import(evalUrl)) as { loadConfig: (startDir?: string) => Promise<{ config: any }> };
const { config } = await loadConfig(projectRoot);

// ── locate the case + its world preset ───────────────────────────────────────
const cases: Array<any> = config.cases ?? [];
const kase = cases.find((c) => c.id === input.caseId);
if (!kase) throw new Error(`synth-fork: case "${input.caseId}" not found in domain "${config.domain}"`);
const turns: Array<any> = kase.turns ?? [];
if (!turns.length) throw new Error(`synth-fork: case "${input.caseId}" has no turns`);
const preset = kase.setup?.preset ?? 'default';
const forkTurn = input.forkTurn ?? turns.length - 1;
if (forkTurn < 0 || forkTurn >= turns.length) throw new Error(`synth-fork: forkTurn ${forkTurn} out of range (0..${turns.length - 1})`);

const world: any = config.worldFactory(preset, 0);
const theme: any = config.theme;
const stateBlock = (): string => (theme?.stateBlock ? String(theme.stateBlock(world) ?? '') : '');

const priorCalls = input.priorCalls ?? [];
const callsForTurn = (t: number): PriorCall[] =>
  priorCalls.filter((c) => (c.turn ?? forkTurn) === t);

// ── replay the deterministic world → OpenAI chat prefix, stop BEFORE the fork ──
// Mirrors the runtime wire (run-conversation: renderPrompt): the volatile state block rides the USER
// message (state-in-tail law), computed once per turn BEFORE the model acts; tool results come back as
// subsequent messages within the same turn.
const messages: Array<Record<string, unknown>> = [];
let callSeq = 0;
for (let t = 0; t <= forkTurn; t++) {
  if (t > 0) world.advanceTurn?.();
  const sb = stateBlock();
  const parts: string[] = [];
  if (sb.trim()) parts.push(`## Account state\n${sb}`);
  parts.push(String(turns[t].userText ?? ''));
  messages.push({ role: 'user', content: parts.join('\n\n') });

  for (const call of callsForTurn(t)) {
    const args = call.args ?? {};
    const result = await world.exec(call.name, args);
    const id = `call_synth_${callSeq++}`;
    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: [{ id, type: 'function', function: { name: call.name, arguments: JSON.stringify(args) } }],
    });
    messages.push({ role: 'tool', tool_call_id: id, content: JSON.stringify(result) });
  }
}

const expect = input.expect ?? null;
const out = {
  caseId: input.caseId,
  agent: input.agent ?? null,
  domain: config.domain,
  preset,
  forkTurn,
  synthesized: true, // provenance: built from case + deterministic world, NOT from banked runs
  divergenceIndex: messages.length, // the fork sits at the end of the assembled prefix
  correctNext: expect ? { tool: expect.correct } : null,
  wrongNext: expect ? { tool: expect.wrong } : null,
  expect,
  messages,
};
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
process.stderr.write(
  `synth-fork ${input.caseId} (${config.domain}/${preset}) forkTurn=${forkTurn} ` +
    `priorCalls=${priorCalls.length} → ${messages.length} shared msgs` +
    (expect ? ` · fork ${expect.correct} vs ${expect.wrong}` : ' · (no expect — margin-screen only)') +
    '\n',
);
