/** The one gate over a subject: every verb that answers with findings, one list, one answer. */
import type { DeclaredWorld, ExamCase, LiveWorldCard, McpWorldCard } from '@looprun-ai/core';
import { factsFromWorld } from '@looprun-ai/core';
import { approvable, capPaths, conductComplete, coversResolve, destructiveDisclosed,
         floorRedeclared, inertChecks, nameGate, overWide, pairing, purity, unlicensed,
         type LintFinding } from './lints.js';

/** What the gate needs beyond the directory. Every field is REQUIRED, and the two a subject
 *  directory cannot answer on its own take an explicit `null` to opt out: a caller with no census
 *  in hand writes `censusNames: null` and reads in its own code that two verbs did not run. A field
 *  left out is a compile error — never a shorter, cleaner findings list.
 *
 *  The world is the declared card itself: the gate derives the surface facts from it with the same
 *  derivation the prompt proof uses, so the acts the verbs read are the acts the engine compiles. */
export interface GateSubject {
  readonly world: DeclaredWorld | McpWorldCard | LiveWorldCard;
  readonly cases: readonly ExamCase[];
  /** The guard names `Engine.guards()` returns — the compiled rows plus the honesty rows the
   *  Rulebook injects. A case's `covers` key is spelled against these. `null` opts out. */
  readonly censusNames: ReadonlySet<string> | null;
  /** Whether a case's preset leaves the named guard unable to refuse in any state that preset
   *  reaches. The caller builds this from the world it has already run the preset against.
   *  `null` opts out. */
  readonly presetLeavesGuardInert: ((preset: string | undefined, guardName: string) => boolean) | null;
}

/** The static gate: every verb, one list, one answer. It runs in under a second on a thirty-act
 *  subject, which is why nothing downstream of it is worth spending a model call on until it is
 *  empty. The two row-shaped verbs — doubleStated and echoes — are not here: they return questions
 *  an author answers, and a question is not a failure. The census verb is not here either: it reads
 *  a RUN's dumps, which a subject directory does not carry. */
export function runGate(subjectDir: string, subject: GateSubject): readonly LintFinding[] {
  const facts = factsFromWorld(subject.world);
  const { cases, censusNames, presetLeavesGuardInert } = subject;
  return [
    ...purity(subjectDir),
    ...nameGate(subjectDir),
    // The surface comes from the DERIVED facts: a world that builds its effect blocks in code
    // spells no act out in its source, and membership is what the pairing reads first.
    ...pairing(subjectDir, Object.keys(facts.tools)),
    ...unlicensed(subjectDir),
    ...overWide(subjectDir),
    ...floorRedeclared(subjectDir),
    ...conductComplete(subjectDir),
    ...capPaths(subjectDir),
    ...inertChecks(subjectDir, facts.tools),
    ...destructiveDisclosed(subjectDir, facts),
    ...(censusNames === null ? [] : coversResolve(cases, censusNames)),
    ...(presetLeavesGuardInert === null ? [] : approvable(cases, { presetLeavesGuardInert }))
  ];
}
