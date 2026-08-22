/** The one gate over a subject: every verb that answers with findings, one list, one answer. */
import type { AgentSpec, DeclaredWorld, DomainContract, ExamCase, LiveWorldCard,
              McpWorldCard } from '@looprun-ai/core';
import { AgentFactory, factsFromWorld, Rulebook } from '@looprun-ai/core';
import { approvable, approvedActsDisclosed, capPaths, conductComplete, coversResolve,
         destructiveDisclosed, floorRedeclared, inertChecks, nameGate, noEffectDenied, overWide,
         pairing, presetsDeclared, promptBudgeted, purity, readsOrdered, requiredReadsDisclosed,
         unlicensed, unspokenChecks, type LintFinding } from './lints.js';

/** What the gate needs beyond the directory. Every field is REQUIRED, and the two a subject
 *  directory cannot answer on its own take an explicit `null` to opt out: a caller with no census
 *  in hand writes `censusNames: null` and reads in its own code that two verbs did not run. A field
 *  left out is a compile error — never a shorter, cleaner findings list.
 *
 *  The world is the declared card itself: the gate derives the surface facts from it with the same
 *  derivation the prompt proof uses, so the acts the verbs read are the acts the engine compiles. */
export interface GateSubject {
  readonly world: DeclaredWorld | McpWorldCard | LiveWorldCard;
  /** One spec per desk, and the business they share. The prompt a subject sends every turn is
   *  rendered from these, so the byte budget is measured over them. A domain with no shared
   *  business writes `contract: undefined`. */
  readonly specs: Readonly<Record<string, AgentSpec>>;
  readonly contract: DomainContract | undefined;
  readonly cases: readonly ExamCase[];
  /** The guard names `Engine.guards()` returns — the compiled rows plus the honesty rows the
   *  Rulebook injects. A case's `covers` key is spelled against these. `null` opts out. */
  readonly censusNames: ReadonlySet<string> | null;
  /** Whether a case's preset leaves the named guard unable to refuse in any state that preset
   *  reaches. The caller builds this from the world it has already run the preset against.
   *  `null` opts out. */
  readonly presetLeavesGuardInert: ((preset: string | undefined, guardName: string) => boolean) | null;
}

/** The cards a census is read off: one desk each, the business they share, and the world whose
 *  acts decide which floor guards the engine installs. */
export interface CensusSubject {
  readonly specs: Readonly<Record<string, AgentSpec>>;
  readonly contract: DomainContract | undefined;
  readonly world: DeclaredWorld | McpWorldCard | LiveWorldCard;
}

/** THE census a `covers` key is spelled against: every guard name the engine installs across the
 *  desks of one subject. The engine answers it — the compiled rows come from AgentFactory and the
 *  honesty rows from the Rulebook that injects them, exactly as a live turn walks them. Nothing
 *  here keeps a list of guard names, so a row the engine adds arrives here the day it is added.
 *
 *  The union across desks is the answer because a case names the guard it means to trip and the
 *  desk it runs on is the case's own business. */
export function censusFor(subject: CensusSubject): ReadonlySet<string> {
  const facts = factsFromWorld(subject.world);
  const factory = new AgentFactory();
  const names = new Set<string>();
  for (const desk of Object.values(subject.specs)) {
    for (const guard of new Rulebook(factory.governed(desk, subject.contract, facts)).guards().guards) {
      names.add(guard.name);
    }
  }
  return names;
}

/** The static gate: every verb, one list, one answer. It runs in under a second on a thirty-act
 *  subject, which is why nothing downstream of it is worth spending a model call on until it is
 *  empty. The two row-shaped verbs — doubleStated and echoes — are not here: they return questions
 *  an author answers, and a question is not a failure. `seamSpoken` is not here for the same
 *  reason, and one of its own: every sentence it asks for is a sentence the prompt then carries on
 *  every turn, so how many of an act's refusals are worth stating is a budget the author spends,
 *  not a rule a gate decides. The census verb is not here either: it reads a RUN's dumps, which a
 *  subject directory does not carry. */
export function runGate(subjectDir: string, subject: GateSubject): readonly LintFinding[] {
  const facts = factsFromWorld(subject.world);
  const { cases, censusNames, presetLeavesGuardInert } = subject;
  const acting = Object.values(facts.tools)
    .filter(fact => fact.effect !== 'read').map(fact => fact.name);
  return [
    ...purity(subjectDir),
    ...nameGate(subjectDir),
    // The surface and the acts both come from the DERIVED facts: a world that builds its effect
    // blocks in code spells no act out in its source, and membership is what the pairing reads
    // first — then every act it holds, each of which owes a check.
    ...pairing(subjectDir, Object.keys(facts.tools), acting),
    ...unlicensed(subjectDir),
    ...overWide(subjectDir),
    ...floorRedeclared(subjectDir),
    ...conductComplete(subjectDir),
    ...capPaths(subjectDir),
    ...inertChecks(subjectDir, facts.tools),
    ...unspokenChecks(subjectDir),
    ...destructiveDisclosed(subjectDir, facts, cases),
    // Both tenses of a consent question an exam renders: the one that asks, and the one that
    // reports what the act did.
    ...approvedActsDisclosed(subjectDir, cases, facts),
    // What every desk sends on every turn, against the ceiling the subject's owner declared.
    ...promptBudgeted(subjectDir, subject),
    // The scenario a case names is read off the card the gate already holds, so this verb needs
    // nothing a subject directory cannot answer and takes no opt-out.
    ...presetsDeclared(cases, subject.world),
    // What the exam already makes derivable, enforced instead of taught: a read a case requires
    // is a read an act is ordered behind, and a read a case requires answers in figures.
    ...readsOrdered(subjectDir, cases, facts, subject.world),
    ...requiredReadsDisclosed(subjectDir, cases, facts),
    // An act the exam expects refused is an act the cards can refuse: a mechanism that decides the
    // call, not an order that reading clears.
    ...noEffectDenied(subjectDir, cases),
    ...(censusNames === null ? [] : coversResolve(cases, censusNames)),
    ...(presetLeavesGuardInert === null ? [] : approvable(cases, { presetLeavesGuardInert }))
  ];
}
