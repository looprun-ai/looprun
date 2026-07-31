/**
 * @looprun-ai/core — the TRUNK's attributed table and the FOLD that renders it.
 *
 * THE CAUSE-ROOT THIS FILE CLOSES. `renderScopedSpecTrunk` used to end in `parts.join('\n\n')`. At the
 * instant of that join every trace of PROVENANCE died and what remained was an opaque string: you could
 * no longer ask "who emitted this rule?", "under which hook?", "about WHAT?".
 *
 * The fix is to make the trunk a FOLD over a typed table. {@link TrunkLine} is the atomic normative
 * unit (who said it, in which section, under which hook/target, about WHAT, with which polarity, and
 * the exact bytes it renders as); {@link TrunkBlock}/{@link TrunkRow} carry the layout so the fold
 * reproduces the previous string BYTE-FOR-BYTE (trunk-static law / D8 cacheable prefix).
 *
 * DOMAIN NEUTRALITY (P8a). This file carries no business vocabulary. `subject` is derived from the
 * GUARD KIND (runtime vocabulary — see {@link GUARD_KIND_SUBJECT}) and, for prose that has no guard
 * behind it (domain voice / core invariants / persona / behavior / directives), from an INJECTED
 * {@link SubjectRule} lexicon the host supplies — exactly the seam every language-keyed guard uses.
 *
 * This module is PRIVATE to the package: it is reachable from no entry point. `trunk.ts` is its only
 * consumer.
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
  // These two are deliberately NOT one subject: a per-turn CAP reads `require` and a same-turn BAN
  // reads `forbid`, so a single shared subject would describe two different rules as one.
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
});

/**
 * POLARITY, derived deterministically from the rendered text.
 *
 * A MIXED LINE IS `inform`, NOT a coin-flip between the two. The first cut of this function used a
 * precedence (forbid wins) and it was WRONG in the only way that matters: a multi-clause line — a
 * domain voice paragraph, a core invariant that states the positive path and then bans the shortcut —
 * matches both marker sets, so precedence assigned it a polarity it does not actually have. Polarity is
 * only DECIDABLE for a line that asserts one thing; when both markers fire, the honest answer is that
 * this text does not cleanly require or forbid — it informs.
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
 * not two.
 */
const NEGATIVE_REQUIREMENT_RE = new RegExp(
  `\\b(?:${FORBID_SRC})\\b[^.;]{0,160}?\\b(?:without|unless|until|before|except|other than)\\b`,
  'i',
);
/** Fresh /g source — a module-level /g regex would leak `lastIndex` between calls (T1 purity). */
const FORBID_STRIP_SRC = `\\b(?:${FORBID_SRC})\\b`;

export function derivePolarity(text: string): TrunkPolarity {
  if (NEGATIVE_REQUIREMENT_RE.test(text)) return 'require';
  const forbids = FORBID_RE.test(text);
  const requires = REQUIRE_RE.test(text.replace(new RegExp(FORBID_STRIP_SRC, 'gi'), ' '));
  if (forbids && requires) return 'inform'; // mixed ⇒ no clean polarity to assert
  if (forbids) return 'forbid';
  if (requires) return 'require';
  return 'inform';
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
function foldRow(row: TrunkRow): string {
  return `${row.prefix}${row.lines.map((l) => l.text).join(row.sep)}${row.suffix}`;
}

/** THE FOLD: blocks → the trunk string. The inverse of {@link TrunkBlock} construction, and the ONLY
 *  place the trunk's bytes are produced. */
export function foldTrunk(blocks: readonly TrunkBlock[]): string {
  return blocks
    .map((b) => [...(b.heading != null ? [b.heading] : []), ...b.rows.map(foldRow)].join('\n'))
    .join('\n\n');
}
