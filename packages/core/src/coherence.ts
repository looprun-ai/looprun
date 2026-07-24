/**
 * @looprun-ai/core — TRUNK PROVENANCE + the coherence QUERIES.
 *
 * THE CAUSE-ROOT THIS FILE CLOSES. `renderScopedSpecTrunk` used to end in `parts.join('\n\n')`. At the
 * instant of that join every trace of PROVENANCE died and what remained was an opaque string: you could
 * no longer ask "who emitted this rule?", "does any other section say the opposite?", "does a tool's own
 * schema already say this?". Contradictions between sections — and between the trunk and the tool
 * schemas the model also reads — were therefore not merely unnoticed, they were STRUCTURALLY
 * INVISIBLE: there was nothing left to interrogate.
 *
 * The fix is to make the trunk a FOLD over a typed table. {@link TrunkLine} is the atomic normative
 * unit (who said it, in which section, under which hook/target, about WHAT, with which polarity, and
 * the exact bytes it renders as); {@link TrunkBlock}/{@link TrunkRow} carry the layout so the fold
 * reproduces the previous string BYTE-FOR-BYTE (trunk-static law / D8 cacheable prefix). The queries
 * below then run over the table as a PROGRAM (a test), not as an instruction to a careful reader.
 *
 * DOMAIN NEUTRALITY (P8a). This file carries no business vocabulary. `subject` is derived from the
 * GUARD KIND (runtime vocabulary — see {@link GUARD_KIND_SUBJECT}) and, for prose that has no guard
 * behind it (domain voice / core invariants / persona / behavior / directives / a tool description),
 * from an INJECTED {@link SubjectRule} lexicon the host supplies — exactly the seam every
 * language-keyed guard already uses.
 */

/** Whether a normative line ADDS an obligation, REMOVES a permission, or merely states a fact. */
export type TrunkPolarity = 'require' | 'forbid' | 'inform';

/** An injected subject rule: "text matching `re` is about `subject`". Business-owned (P8a). */
export interface SubjectRule {
  subject: string;
  re: RegExp;
}

/**
 * The CONTROLLED subject vocabulary the runtime can derive on its own — keyed on the guard KIND, which
 * is runtime vocabulary and therefore carries no business content. A kind absent from this table
 * derives `subject: null`, and that is INFORMATION, not a gap: a normative line whose subject cannot be
 * identified is a lint candidate (nothing can be said about how it interacts with the rest of the
 * trunk). `custom()` guards land there by construction — they declare a free-form kind.
 */
export const GUARD_KIND_SUBJECT: Readonly<Record<string, string>> = Object.freeze({
  // spatial / run — ordering and budgets
  requiresBefore: 'tool-ordering',
  forbidThisTurn: 'tool-forbidden',
  noDuplicateCall: 'duplicate-call',
  maxCalls: 'call-budget',
  precondition: 'state-precondition',
  consentRequired: 'consent',
  noInstructionFromData: 'instruction-from-data',
  // input — argument schema
  argRequired: 'arg-schema',
  argAbsent: 'arg-schema',
  argFormat: 'arg-schema',
  // output
  resultInvariant: 'result-invariant',
  // destructive-safety protocol
  confirmFirst: 'confirm-before-destructive',
  // These two were both mapped to a single 'two-step-order' subject and query (a) immediately flagged
  // them as contradicting (a per-turn CAP reads `require`, a same-turn BAN reads `forbid`). They are
  // different rules, so the defect was the SUBJECT being too coarse — the query found a vocabulary bug,
  // which is exactly what a subject that two opposite-polarity guards share is evidence of.
  destructiveThrottle: 'destructive-throttle',
  noActAfterAskSameTurn: 'act-after-ask',
  pendingConfirmMustAsk: 'relay-pending-confirmation',
  destructiveClaimRequiresSuccess: 'destructive-claim-honesty',
  // reply honesty / hygiene
  noFabricatedSuccess: 'fabricated-success',
  noFalseFailureClaim: 'false-failure-claim',
  emptyReply: 'non-empty-reply',
  degenerationGuard: 'reply-hygiene',
  replySingleQuestion: 'single-question',
  replyMustMention: 'reply-must-mention',
  replyConfirmsLabels: 'reply-must-mention',
  replyMaxOccurrences: 'cta-budget',
  // risk families
  minimalDisclosure: 'pii-disclosure',
  noCompetitorClaim: 'competitor-claims',
  noOutOfSurfaceActionClaim: 'out-of-surface-claim',
  noUngroundedRegulatedFigure: 'regulated-advice',
  // reply MUTATORS (onReplyMutate). They carry no prose (a `ReplyMutator` is `{ kind, apply }`), so
  // they never render into the trunk — but they ARE governance (a deterministic egress rewrite), and a
  // subject here is what lets `mutatorLines` surface them to the CENSUS (B4). A rewrite that substitutes
  // a term the trunk elsewhere tells the model to USE is a real contradiction the census could not see
  // while mutators were absent from the normative table.
  jargonScrub: 'term-substitution',
});

/**
 * POLARITY, derived deterministically from the rendered text.
 *
 * A MIXED LINE IS `inform`, NOT a coin-flip between the two. The first cut of this function used a
 * precedence (forbid wins) and it was WRONG in the only way that matters: a multi-clause line — a
 * domain voice paragraph, a core invariant that states the positive path and then bans the shortcut —
 * matches both marker sets, so precedence assigned it a polarity it does not actually have, and query
 * (a) then reported it as contradicting every clean single-clause rule on the same subject. Measured on
 * atlas-r2: ~200 fabricated "contradictions", none real. Polarity is only DECIDABLE for a line that
 * asserts one thing; when both markers fire, the honest answer is that this text does not cleanly
 * require or forbid — it informs. That keeps query (a) sound (it may miss, it does not cry wolf), and
 * a mixed line is still fully covered by queries (b) and (c), which do not read polarity as a claim.
 *
 * The `require` test runs on the text with the prohibition phrases REMOVED, so "you must not X" is a
 * clean `forbid` rather than a mixed line (the `must` belongs to the `must not`).
 *
 * The marker sets are deliberately small and strong — the trunk is always rendered in English (the
 * domain's language clause tells the model which language to REPLY in; it does not translate the prompt).
 */
const FORBID_SRC = "never|must not|may not|cannot|can'?t|do not|don'?t|forbidden";
const FORBID_RE = new RegExp(`\\b(?:${FORBID_SRC})\\b`, 'i');
const REQUIRE_RE = /\b(?:always|must|require[sd]?|needs?|only (?:after|when|with|once|if)|at most|at least)\b/i;
/**
 * A prohibition QUALIFIED by an exception connective is a REQUIREMENT expressed negatively: "never
 * move money WITHOUT an explicit confirmation" and "always confirm before moving money" are one rule,
 * not two. Without this, query (a) reported every such pair as a contradiction with the positively
 * phrased guard prose on the same subject — the dominant false-positive shape in policy prose.
 */
const NEGATIVE_REQUIREMENT_RE = new RegExp(
  `\\b(?:${FORBID_SRC})\\b[^.;]{0,160}?\\b(?:without|unless|until|before|except|other than)\\b`,
  'i',
);

/**
 * The polarity markers, as an INJECTABLE lexicon (I7). The defaults are the English marker sets above —
 * the trunk itself is always rendered in English, so the DEFAULT keeps every existing derivation
 * byte-for-byte. But a SUBJECT whose prose is authored in another natural language (its `behavior[]`
 * written in the business's own tongue) has its polarity mis-read by the English markers, degrading the
 * coherence CENSUS for that subject. A host running the census over a non-English subject injects its own lexicon —
 * exactly the seam `SubjectRule`/`deriveSubject` already give the subject axis. Polarity is query-only
 * metadata (it is NOT part of the rendered trunk bytes), so injecting a lexicon can never move a
 * certified number.
 */
export interface PolarityLexicon {
  /** Prohibition markers (never / must not / …). */
  forbid: RegExp;
  /** Obligation markers (always / must / …). */
  require: RegExp;
  /** A prohibition QUALIFIED by an exception connective ⇒ a requirement phrased negatively. */
  negativeRequirement: RegExp;
  /** The `forbid` alternation SOURCE — used to subtract forbids before testing `require` (mixed lines). */
  forbidSrc: string;
}

export const DEFAULT_POLARITY_LEXICON: PolarityLexicon = Object.freeze({
  forbid: FORBID_RE,
  require: REQUIRE_RE,
  negativeRequirement: NEGATIVE_REQUIREMENT_RE,
  forbidSrc: FORBID_SRC,
});

export function derivePolarity(text: string, lex: PolarityLexicon = DEFAULT_POLARITY_LEXICON): TrunkPolarity {
  if (lex.negativeRequirement.test(text)) return 'require';
  const forbids = lex.forbid.test(text);
  // Fresh /g copy per call — a module-level /g regex would leak lastIndex between calls (T1 purity).
  const requires = lex.require.test(text.replace(new RegExp(`\\b(?:${lex.forbidSrc})\\b`, 'gi'), ' '));
  if (forbids && requires) return 'inform'; // mixed ⇒ no clean polarity to assert
  if (forbids) return 'forbid';
  if (requires) return 'require';
  return 'inform';
}

/** Re-derive each line's polarity with an injected {@link PolarityLexicon} — the census entry point for a
 *  non-English subject (I7). Pure: returns new lines, never mutates. Trunk-render polarity is unchanged;
 *  this is applied ONLY by a census caller that supplies the subject's own markers. */
export function withPolarityLexicon<L extends NormativeLine>(lines: readonly L[], lex: PolarityLexicon): L[] {
  return lines.map((l) => ({ ...l, polarity: derivePolarity(l.text, lex) }));
}

/**
 * SUBJECT, derived deterministically: the guard kind wins when there is a guard behind the line
 * (it is the precise, machine-owned answer), otherwise the FIRST matching injected lexicon rule wins
 * (source order is the tiebreak, so the derivation is stable). No match ⇒ `null`.
 */
export function deriveSubject(
  text: string,
  opts?: { guardKind?: string; lexicon?: readonly SubjectRule[] },
): string | null {
  const byKind = opts?.guardKind ? GUARD_KIND_SUBJECT[opts.guardKind] : undefined;
  if (byKind) return byKind;
  for (const rule of opts?.lexicon ?? []) if (rule.re.test(text)) return rule.subject;
  return null;
}

/**
 * One atomic normative unit of the trunk, with its provenance.
 *
 * `text` holds the EXACT bytes this unit contributes to the rendered trunk (a whole line for most
 * sections; a single `; `-joined fragment inside a `## Tool rules` row). The fold never re-derives or
 * re-formats it — that is what makes byte-identity provable rather than hoped for.
 */
export interface TrunkLine {
  /** WHO emitted it: `domain.voice` · `domain.coreInvariants` · `domain.languageClause` · `spec.scope` ·
   *  `spec.flow` · `spec.persona` · `spec.behavior` · `spec.controls.directives` · `guard:<kind>`. */
  owner: string;
  /** The section heading it renders under (`null` for the heading-less voice / language blocks). */
  section: string | null;
  /** For guard-owned lines: the hook the binding sits on. */
  hook?: string;
  /** For guard-owned lines: the binding's tool target (`'any'` or the tool list). */
  target?: 'any' | readonly string[];
  /** For a `## Tool rules` fragment: the tool whose row it renders in. */
  tool?: string;
  /** The normative SUBJECT in controlled vocabulary — `null` when none could be derived (a lint signal). */
  subject: string | null;
  polarity: TrunkPolarity;
  /** The exact rendered bytes of this unit. */
  text: string;
}

/** One physical line of the trunk: `prefix + lines.map(text).join(sep) + suffix`. */
export interface TrunkRow {
  prefix: string;
  sep: string;
  suffix: string;
  lines: TrunkLine[];
}

/** One `\n\n`-separated part of the trunk: an optional heading plus its rows. */
export interface TrunkBlock {
  heading: string | null;
  rows: TrunkRow[];
}

/** Render one row back to its exact bytes. */
export function foldRow(row: TrunkRow): string {
  return `${row.prefix}${row.lines.map((l) => l.text).join(row.sep)}${row.suffix}`;
}

/** THE FOLD: blocks → the trunk string. The inverse of {@link TrunkBlock} construction, and the ONLY
 *  place the trunk's bytes are produced. */
export function foldTrunk(blocks: readonly TrunkBlock[]): string {
  return blocks
    .map((b) => [...(b.heading != null ? [b.heading] : []), ...b.rows.map(foldRow)].join('\n'))
    .join('\n\n');
}

/** Flatten blocks to the normative table the queries run over. */
export function trunkLines(blocks: readonly TrunkBlock[]): TrunkLine[] {
  return blocks.flatMap((b) => b.rows.flatMap((r) => r.lines));
}

// ── THE COHERENCE QUERIES ────────────────────────────────────────────────────
//
// Each returns FINDINGS (data), never throws — the caller decides which severity gates a build. They
// accept any `NormativeLine`, not just trunk lines, because the trunk is not the whole normative
// surface the model reads: a tool DESCRIPTION and a param DOC are prompt text with exactly the same
// force, and a rule stated in both places is two copies of one rule with one owner each.

/** The minimum a query needs — so a tool description/param doc can be queried beside a trunk line. */
export interface NormativeLine {
  owner: string;
  section?: string | null;
  subject: string | null;
  polarity: TrunkPolarity;
  text: string;
}

/** The minimum of a reply MUTATOR binding this file reads (`spec.guards.onReplyMutate[i]`). */
export interface MutatorBindingLike {
  id: string;
  mutator: { kind: string };
  disabled?: boolean;
}

/**
 * Query-only normative lines for the reply MUTATORS (B4). A `ReplyMutator` has no `prose()`, so it never
 * renders into the trunk (trunk.ts) and was therefore INVISIBLE to the census — yet it governs (a
 * deterministic egress rewrite). This surfaces each ENABLED mutator as an `inform` line whose subject is
 * derived from its kind (see the mutator entries in {@link GUARD_KIND_SUBJECT}), so query (a)/(c) can at
 * last reason about it (e.g. a `jargonScrub` that rewrites a term the trunk elsewhere tells the model to
 * USE). These lines are for the CENSUS surface ONLY — they are NOT rendered, so the trunk bytes and every
 * certified number are untouched. `section: null` keeps them out of any section-scoped view.
 */
export function mutatorLines(bindings: readonly MutatorBindingLike[] | undefined, owner = 'spec.mutator'): NormativeLine[] {
  return (bindings ?? [])
    .filter((b) => !b.disabled)
    .map((b) => ({
      owner: `${owner}:${b.mutator.kind}`,
      section: null,
      subject: GUARD_KIND_SUBJECT[b.mutator.kind] ?? null,
      polarity: 'inform' as const,
      text: `[reply mutator ${b.mutator.kind} (${b.id})]`,
    }));
}

export interface ContradictionFinding {
  subject: string;
  a: NormativeLine;
  b: NormativeLine;
}

/**
 * POLARITY IS ONLY DECIDABLE FOR A SINGLE-CLAUSE LINE — the scope condition of query (a).
 *
 * A domain voice paragraph, a four-sentence tool description, a behavior essay: each states several
 * rules at once, so ANY polarity assigned to it is a summary of clauses that individually point both
 * ways. Measured on atlas-r2, running query (a) over multi-clause text produced 110 findings and zero
 * defects — every one was a long paragraph "contradicting" a short guard prose that says the same
 * thing. A query with a 100% false-positive rate is not a gate, it is a thing people learn to ignore.
 *
 * So (a) is scoped to lines that assert ONE thing: no interior sentence break, and short enough to be
 * a rule rather than a passage. Guard `prose()` fragments — the population the prose+check pairing
 * actually cares about — are all in scope by construction. Excluded lines are not silently dropped:
 * {@link findUnassessableLines} reports them, so the residue is visible rather than assumed empty.
 */
export function isSingleClause(text: string): boolean {
  return text.length <= 240 && !/[.!?]\s/.test(text);
}

/** Normative lines that query (a) cannot adjudicate — multi-clause passages (see {@link isSingleClause}). */
export function findUnassessableLines(lines: readonly NormativeLine[]): NormativeLine[] {
  return lines.filter((l) => l.subject !== null && !isSingleClause(l.text));
}

/** (a) CONTRADICTION — the same subject asserted with OPPOSITE polarity by DIFFERENT owners.
 *  `inform` is not an opposite of anything: only require↔forbid contradict. Scoped to single-clause
 *  lines (`opts.allowMultiClause` lifts the scope condition — for census/diagnosis, never for a gate). */
export function findContradictions(
  lines: readonly NormativeLine[],
  opts?: { allowMultiClause?: boolean },
): ContradictionFinding[] {
  const out: ContradictionFinding[] = [];
  const seen = new Set<string>();
  const scoped = opts?.allowMultiClause ? lines : lines.filter((l) => isSingleClause(l.text));
  const bySubject = groupBySubject(scoped);
  for (const [subject, group] of bySubject) {
    const requires = group.filter((l) => l.polarity === 'require');
    const forbids = group.filter((l) => l.polarity === 'forbid');
    for (const a of requires) {
      for (const b of forbids) {
        if (a.owner === b.owner) continue; // one owner may legitimately state both halves of a rule
        // One finding per DISTINCT pair: the same prose renders once per tool row and once per agent,
        // so without this the census reports one defect dozens of times and reads as a wall.
        const key = `${subject}\u0000${a.owner}\u0000${a.text}\u0000${b.owner}\u0000${b.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ subject, a, b });
      }
    }
  }
  return out;
}

export interface DuplicationFinding {
  subject: string;
  polarity: TrunkPolarity;
  /** How many lines assert it. */
  count: number;
  /** The distinct owners asserting it, with their own counts — the CENSUS. */
  owners: Array<{ owner: string; count: number }>;
  /** How many of the `count` lines are byte-identical repeats of some other line. */
  verbatimRepeats: number;
}

/** (b) DUPLICATION — the same subject+polarity asserted by MORE THAN ONE owner. Warn-level with a
 *  census: duplication is not automatically wrong (a tool-scoped restatement can be deliberate), but
 *  every copy is a place the rule can drift out of step with the check that enforces it. */
export function findDuplications(lines: readonly NormativeLine[]): DuplicationFinding[] {
  const groups = new Map<string, NormativeLine[]>();
  for (const l of lines) {
    if (!l.subject) continue;
    const key = `${l.subject} ${l.polarity}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(l);
  }
  const out: DuplicationFinding[] = [];
  for (const [key, group] of groups) {
    const owners = new Map<string, number>();
    for (const l of group) owners.set(l.owner, (owners.get(l.owner) ?? 0) + 1);
    if (owners.size < 2) continue;
    const seen = new Set<string>();
    let verbatimRepeats = 0;
    for (const l of group) {
      if (seen.has(l.text)) verbatimRepeats++;
      else seen.add(l.text);
    }
    const [subject, polarity] = key.split(' ');
    out.push({
      subject,
      polarity: polarity as TrunkPolarity,
      count: group.length,
      owners: [...owners].map(([owner, count]) => ({ owner, count })).sort((x, y) => y.count - x.count || x.owner.localeCompare(y.owner)),
      verbatimRepeats,
    });
  }
  return out.sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject));
}

export interface SingleOwnerFinding {
  subject: string;
  owners: string[];
  lines: NormativeLine[];
}

/**
 * (c) SINGLE OWNER — a subject declared to have exactly ONE authoritative owner is asserted by more
 * than one. This is the query that reaches OUTSIDE the trunk: pass the tool descriptions and param
 * docs alongside the trunk lines and a rule stated both by a tool schema and by the trunk becomes an
 * ERROR rather than an invisible second source of truth (the measured case: a `replyToUser` param doc
 * saying the reply is "in the brand language" while the trunk's language clause makes it the USER'S
 * language — two owners, two answers, one of them read at the exact moment the model writes the reply).
 */
export function findMultiOwnerSubjects(
  lines: readonly NormativeLine[],
  singleOwnerSubjects: readonly string[],
): SingleOwnerFinding[] {
  const want = new Set(singleOwnerSubjects);
  const out: SingleOwnerFinding[] = [];
  for (const [subject, group] of groupBySubject(lines)) {
    if (!want.has(subject)) continue;
    const owners = [...new Set(group.map((l) => l.owner))].sort();
    if (owners.length > 1) out.push({ subject, owners, lines: [...group] });
  }
  return out.sort((a, b) => a.subject.localeCompare(b.subject));
}

function groupBySubject(lines: readonly NormativeLine[]): Map<string, NormativeLine[]> {
  const bySubject = new Map<string, NormativeLine[]>();
  for (const l of lines) {
    if (!l.subject) continue;
    const g = bySubject.get(l.subject);
    if (g) g.push(l);
    else bySubject.set(l.subject, [l]);
  }
  return bySubject;
}

/** (lint) Normative lines with NO derivable subject — nothing can be asked about how they interact
 *  with the rest of the surface. Reported, not failed: the residue is expected to be non-empty. */
export function findSubjectlessLines(lines: readonly NormativeLine[]): NormativeLine[] {
  return lines.filter((l) => l.subject === null);
}
