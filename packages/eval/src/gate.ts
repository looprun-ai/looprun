/** The one gate over a subject: every verb that answers with findings, one list, one answer. */
import type { AgentSpec, DeclaredWorld, DomainContract, ExamCase, LiveWorldCard,
              McpWorldCard } from '@looprun-ai/core';
import { AgentFactory, CardError, factsFromWorld, Rulebook } from '@looprun-ai/core';
import { approvable, capPaths, cardWeight, conductComplete, coversResolve,
         destructiveDisclosed, floorRedeclared, inertChecks, laneWidth, nameGate, noEffectDenied,
         overWide, pairing, presetsDeclared, purity, seamSpoken, seamUnreached,
         unlicensed, unspokenChecks, type LintFinding } from './lints.js';

/** What the gate needs beyond the directory. Every field is REQUIRED, and the one a subject
 *  directory cannot answer on its own takes an explicit `null` to opt out: a caller with no census
 *  in hand writes `censusNames: null` and reads in its own code that one verb did not run. A field
 *  left out is a compile error — never a shorter, cleaner findings list.
 *
 *  The world is the declared card itself: the gate derives the surface facts from it with the same
 *  derivation the prompt proof uses, so the acts the verbs read are the acts the engine compiles. */
export interface GateSubject {
  readonly world: DeclaredWorld | McpWorldCard | LiveWorldCard;
  /** One spec per desk, and the business they share. A domain with no shared business writes
   *  `contract: undefined`. */
  readonly specs: Readonly<Record<string, AgentSpec>>;
  readonly contract: DomainContract | undefined;
  readonly cases: readonly ExamCase[];
  /** The guard names `Engine.guards()` returns — the compiled rows plus the honesty rows the
   *  Rulebook injects. A case's `covers` key is spelled against these. `null` opts out. */
  readonly censusNames: ReadonlySet<string> | null;
  /** Whether a case's preset leaves the named guard unable to refuse in any state that preset
   *  reaches. The caller builds this from the world it has already run the preset against, and
   *  answers for every case it hands over: this is the one verb that asks whether a covered guard
   *  can fire at all, and a subject it does not run on is a subject whose covers keys are spelling
   *  checked and nothing more. */
  readonly presetLeavesGuardInert: (preset: string | undefined, guardName: string) => boolean;
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
 *  desk it runs on is the case's own business.
 *
 *  A desk whose card does not compile installs no guards, so it puts no names in the census and
 *  the census still answers: the gate's own verbs report that card's problems as findings, and a
 *  covers key spelled against the refused desk resolves nowhere — both statements reach the
 *  author in the same list. */
export function censusFor(subject: CensusSubject): ReadonlySet<string> {
  const facts = factsFromWorld(subject.world);
  const factory = new AgentFactory();
  const names = new Set<string>();
  for (const desk of Object.values(subject.specs)) {
    try {
      for (const guard of new Rulebook(factory.governed(desk, subject.contract, facts)).guards().guards) {
        names.add(guard.name);
      }
    } catch (error) {
      if (!(error instanceof CardError)) throw error;
    }
  }
  return names;
}

/** What the gate answers: the failing rows, and the seam budget beside them. The gate is red
 *  exactly when `findings` is non-empty. `seams` fails nothing — one line per row of the seam
 *  table that no case drives into and no seam law names, printed with the run so the whole
 *  unspoken table stays visible without a prompt sentence paid for any of it. */
export interface GateReport {
  readonly findings: readonly LintFinding[];
  readonly seams: readonly LintFinding[];
}

/** The static gate: every verb, one answer. It runs in under a second on a thirty-act subject,
 *  which is why nothing downstream of it is worth spending a model call on until its findings are
 *  empty. The two row-shaped verbs — doubleStated and echoes — are not here: they return questions
 *  an author answers, and a question is not a failure. The census verb is not here either: it
 *  reads a RUN's dumps, which a subject directory does not carry.
 *
 *  The seam rides as a budget, row by row. A case's preset can leave the world refusing an act
 *  with one code — the case drives into that row, its operator stands in front of that refusal,
 *  and the row unspoken is a failing finding; a seam law on one of the act's other codes pays
 *  nothing for it. A case with no preset drives into nothing: the no-effect it expects is the
 *  consent hold's work. Every other unspoken row rides back under `seams`, one warning line per
 *  row, printed with the run and failing nothing — which refusals are worth a sentence the prompt
 *  then carries on every turn stays the author's spend.
 *
 *  One problem, one row: two verbs reading the same refused card answer with the same sentence,
 *  and a list that prints it twice teaches nothing the first row did not. */
export function runGate(subjectDir: string, subject: GateSubject): GateReport {
  const facts = factsFromWorld(subject.world);
  const { cases, censusNames, presetLeavesGuardInert } = subject;
  const acting = Object.values(facts.tools)
    .filter(fact => fact.effect !== 'read').map(fact => fact.name);
  const answered = [
    ...purity(subjectDir),
    ...nameGate(subjectDir),
    // The surface and the acts both come from the DERIVED facts: a world that builds its effect
    // blocks in code spells no act out in its source, and membership is what the pairing reads
    // first — then every act it holds, each of which owes a check.
    ...pairing(subjectDir, Object.keys(facts.tools), acting),
    ...unlicensed(subjectDir),
    ...overWide(subjectDir),
    ...floorRedeclared(subjectDir),
    // The desks as the caller holds them, not as the source spells them: a conduct law is a guard
    // on the compiled spec, and the six voices are read off every desk of the house at once.
    ...conductComplete(subject.specs),
    // The two stated numbers, measured on the desks the engine compiles: the acts one lane holds,
    // and what the cards behind that lane weigh against the prefix that teaches the desk.
    ...laneWidth(subject),
    ...cardWeight(subject),
    ...capPaths(subjectDir),
    ...inertChecks(subjectDir, facts.tools),
    ...unspokenChecks(subjectDir),
    ...destructiveDisclosed(subjectDir, facts, cases),
    // The scenario a case names is read off the card the gate already holds, so this verb needs
    // nothing a subject directory cannot answer and takes no opt-out.
    ...presetsDeclared(cases, subject.world),
    // An act the exam expects refused is an act the cards can refuse: a mechanism that decides the
    // call, not an order that reading clears.
    ...noEffectDenied(subjectDir, cases),
    // The same act meets the operator at the seam: every row a case's preset drives the world
    // into is spoken on the cards under its own code, or the gate is red.
    ...seamSpoken(subjectDir, cases, subject.world),
    ...(censusNames === null ? [] : coversResolve(cases, censusNames)),
    // A case covers a guard to prove it fires; whether its scenario leaves that guard able to
    // refuse is answered for every subject, and no subject sits this verb out.
    ...approvable(cases, { presetLeavesGuardInert })
  ];
  const findings = answered.filter((finding, at) => answered
    .findIndex(other => other.code === finding.code && other.sentence === finding.sentence) === at);
  return { findings, seams: seamUnreached(subjectDir, cases, facts, subject.world) };
}
