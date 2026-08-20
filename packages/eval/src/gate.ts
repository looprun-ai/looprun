/** The one gate over a subject: every verb that answers with findings, one list, one answer. */
import type { ExamCase } from '@looprun-ai/core';
import { approvable, capPaths, conductComplete, coversResolve, destructiveDisclosed,
         floorRedeclared, inertChecks, nameGate, overWide, pairing, purity, unlicensed,
         type LintFinding } from './lints.js';

/** What the gate needs beyond the directory: the pieces a caller has already loaded. Every field
 *  is optional and a verb runs only when the piece it reads is there — a caller holding no census
 *  names is not told that every `covers` key it declares resolves to nothing, and a caller with no
 *  world facts is not told that every act is unchecked. What the gate cannot read, it does not
 *  charge. */
export interface GateSubject {
  /** The declared surface as facts, keyed by act: the effect block each act sits in, the argument
   *  naming the record id, and the records table it acts on. */
  readonly facts?: {
    readonly tools: Readonly<Record<string, {
      readonly effect?: string;
      readonly target?: string | null;
      readonly entity?: string | null }>>
  };
  readonly cases?: readonly ExamCase[];
  /** The guard names `Engine.guards()` returns — the compiled rows plus the honesty rows the
   *  Rulebook injects. A `covers` key is spelled against these. */
  readonly censusNames?: ReadonlySet<string>;
  /** Whether a case's preset leaves the named guard unable to refuse in any state that preset
   *  reaches. The caller builds this from the world it has already loaded. */
  readonly presetLeavesGuardInert?: (preset: string | undefined, guardName: string) => boolean;
}

/** The static gate: every verb, one list, one answer. It runs in under a second on a thirty-act
 *  subject, which is why nothing downstream of it is worth spending a model call on until it is
 *  empty. The two row-shaped verbs — doubleStated and echoes — are not here: they return questions
 *  an author answers, and a question is not a failure. The census verb is not here either: it reads
 *  a RUN's dumps, which a subject directory does not carry. */
export function runGate(subjectDir: string, subject: GateSubject): readonly LintFinding[] {
  const { facts, cases, censusNames, presetLeavesGuardInert } = subject;
  return [
    ...purity(subjectDir),
    ...nameGate(subjectDir),
    // The surface comes from the LOADED facts: a world that builds its effect blocks in code
    // spells no act out in its source, and membership is what the pairing reads first.
    ...pairing(subjectDir, facts === undefined ? undefined : Object.keys(facts.tools)),
    ...unlicensed(subjectDir),
    ...overWide(subjectDir),
    ...floorRedeclared(subjectDir),
    ...conductComplete(subjectDir),
    ...capPaths(subjectDir),
    ...(facts === undefined ? [] : inertChecks(subjectDir, facts.tools)),
    ...(facts === undefined ? [] : destructiveDisclosed(subjectDir, facts)),
    ...(cases === undefined || censusNames === undefined ? [] : coversResolve(cases, censusNames)),
    ...(cases === undefined || presetLeavesGuardInert === undefined
      ? [] : approvable(cases, { presetLeavesGuardInert }))
  ];
}
