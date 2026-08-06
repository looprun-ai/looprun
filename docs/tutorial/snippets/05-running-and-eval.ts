/**
 * Chapter 05 · running and eval — the scripted runner, the pinned decoding, and the programmatic
 * half of the `looprun-eval` verbs.
 *
 * Nothing here runs on import: every function that would spend money, spawn a process or write to
 * disk is exported and called by a test (or by you), never at module top level.
 *
 * The eval package has no `looprun/eval` facade subpath, so its symbols come from the scoped
 * package name `@looprun-ai/eval` (outline §6, decision 5 — a Task 12 open question).
 */
import { fileURLToPath } from 'node:url';
import { geminiThinkingOff, pinnedDecoding } from 'looprun';
import type { RunResult, TurnInput, TurnRecord } from 'looprun';
import { runSpecConversation } from 'looprun/mastra';
import type { RuntimeDeps } from 'looprun/mastra';
import { geminiFlashLiteThinkOff } from 'looprun/models';
import {
  agentForCase,
  certCommand,
  foldCommand,
  lintPaths,
  lintSpecExecution,
  lintSpecLaws,
  lintSpecQuality,
  lintSubject,
  loadSubject,
  mintSeal,
  runCommand,
  stripGovernance,
  verifySeal,
} from '@looprun-ai/eval';
import type { Subject, CertSummary } from '@looprun-ai/eval';
import { schedulerSpec } from './scheduler/spec.ts';
import { SCHEDULER_TOOLS } from './scheduler/tools.ts';
import { SchedulerWorld } from './scheduler/world.ts';

// ── 1 · runSpecConversation: a scripted conversation, start to finish ─────────────────────────
/** The authored turns. `TurnInput` also carries optional `attachments: string[]`. */
export const SCHEDULER_TURNS: TurnInput[] = [
  { userText: 'What is on my calendar this week?' },
  { userText: 'Book "Design review" on 2 March from 10:15 to 10:45.' },
];

/**
 * The authored deps. `model` is any AI-SDK LanguageModel (or a Mastra router string); `world` is
 * ONE instance for the whole conversation — the runner calls `advanceTurn()` between turns.
 */
export function schedulerDeps(model: unknown): RuntimeDeps {
  return {
    model,
    world: new SchedulerWorld(),
    toolDefs: SCHEDULER_TOOLS,
    modelParams: pinnedDecoding({ seed: 7 }),
  };
}

export async function runScheduler(model: unknown): Promise<RunResult> {
  return runSpecConversation(schedulerSpec, SCHEDULER_TURNS, schedulerDeps(model));
}

/** What you assert on: one `TurnRecord` per turn, and the calls that reached the world. */
export const executedToolNames = (record: TurnRecord): string[] => record.toolCalls.map((c) => c.name);

/** `recoveryEvents` is the guard activity of the turn — a veto kind here is a rule that fired. */
export const guardEvents = (result: RunResult): string[] => result.turnRecords.flatMap((r) => r.recoveryEvents);

// ── 2 · pin the decoding, so a re-run means something ─────────────────────────────────────────
/** Local models: temperature 0 + a seed llama.cpp honors, and a cap on a runaway generation. */
export const LOCAL_DECODING = pinnedDecoding({ seed: 7, maxOutputTokens: 2048 });

/** Gemini: 'off' is the NUMERIC `thinkingBudget: 0` — a `thinkingLevel` value does not disable it. */
export const GEMINI_PINNED = { temperature: 0, ...geminiThinkingOff() };

/**
 * The cloud validation model, thinking off. `modelParams` here is ONLY the thinking-off provider
 * options — no temperature — so assigning it alone would drop the pinning above. Spread it over
 * `pinnedDecoding()`: thinking-off and greedy decoding are two independent settings.
 */
export function cloudValidationDeps(): RuntimeDeps {
  const { model, modelParams } = geminiFlashLiteThinkOff();
  return { ...schedulerDeps(model), modelParams: { ...pinnedDecoding(), ...modelParams } };
}

// ── 3 · the subject directory ─────────────────────────────────────────────────────────────────
/** The subject is a DIRECTORY with a fixed layout — `loadSubject` reads the layout, not a config. */
export const SUBJECT_DIR = fileURLToPath(new URL('./scheduler-subject', import.meta.url));

export const loadSchedulerSubject = (): Promise<Subject> => loadSubject(SUBJECT_DIR);

/** Which spec a case routes to: the `CASE_AGENT` map, else the single spec of a one-spec subject. */
export const routedAgent = (subject: Subject, caseId: string): string => agentForCase(subject, caseId);

/** The ungoverned control variant: the same prompt with the enforcement layer disarmed. */
export function ungovernedVariant(subject: Subject, caseId: string) {
  const spec = subject.specs[routedAgent(subject, caseId)]!;
  return stripGovernance(spec, subject.contract);
}

// ── 4 · the preflight: five lints, no model, no spend ─────────────────────────────────────────
/** Everything `looprun-eval lint --spec-laws --subject <dir>` runs, as one list of findings. */
export async function preflight(subject: Subject): Promise<string[]> {
  return [
    ...lintPaths([SUBJECT_DIR]).map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`),
    ...lintSpecLaws(subject.specs),
    ...(await lintSpecExecution(subject.specs)),
    ...lintSpecQuality(subject.specs, subject.toolDefs),
    ...lintSubject(subject),
  ];
}

// ── 5 · the measured loop, programmatically ───────────────────────────────────────────────────
/**
 * `run → (judge) → fold → cert → seal`. The judge step is not a function call: a coding agent reads
 * `cases.jsonl` against `evals/judge-prompt.md` and writes `verdicts.jsonl` beside it.
 *
 * Spends money (one model call per turn per case), so it is exported, never invoked here.
 */
export async function measureScheduler(model: string, date: string): Promise<string> {
  const runDir = await runCommand({ subject: SUBJECT_DIR, model, date });
  // …the judge writes <runDir>/verdicts.jsonl here…
  foldCommand({ dump: `${runDir}/cases.jsonl`, verdicts: `${runDir}/verdicts.jsonl` });
  const cert = certCommand({ dir: runDir, bar: 0.9, date }) as CertSummary;
  if (!cert.certified) return `BELOW BAR: ${(cert.passRate * 100).toFixed(1)}% over ${cert.cases} case(s)`;

  // The seal binds the certificate to the hash of the governed artifacts. Any later edit voids it.
  const seal = mintSeal(SUBJECT_DIR, {
    targets: [{ model, rate: cert.passRate, reps: cert.reps }],
    bar: cert.bar,
    date,
  });
  return `certified, sealed ${seal.artifactHash.slice(0, 16)}…`;
}

/** Re-verification: recompute the artifact hash and compare. A mismatch is VOID, never re-stamped. */
export function schedulerSealIsIntact(): boolean {
  return verifySeal(SUBJECT_DIR).ok;
}
