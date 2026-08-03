/**
 * THE GUARD-PROOF CATALOG — every guard kind exported by src/guards/ carries one {@link GuardProof}
 * here (≥1 positive, ≥1 negative, ≥1 neutral case; L1 fires/silent obligations plus L3 loop cases).
 * The ratchet (ratchet.test.ts) fails CI when a new guard kind ships without a proof.
 *
 * ## The COLLECTIVE RULESET
 * The collective super-agent (proofs-collective.test.ts) installs EVERY proof's guard at the params
 * below over the shared 11-tool fixture surface. Every L3 script in this catalog must therefore respect
 * ALL of these rules except the one its own negative case violates:
 *
 * | guard                          | target                     | install params                                     |
 * |--------------------------------|----------------------------|----------------------------------------------------|
 * | requiresBefore                 | createItem                 | requiresBefore(['searchItem'])                     |
 * | forbidThisTurn                 | updateItem                 | (updateItem is the DEDICATED forbidden tool)       |
 * | argRequired                    | createItem                 | argRequired('title')                               |
 * | argAbsent                      | deleteItem                 | argAbsent('force')                                 |
 * | argFormat                      | setPrimary                 | argFormat('id', '^itm-\\d+$')                      |
 * | precondition                   | createMedia                | quotaRemaining() > 0                               |
 * | maxCalls                       | createItem                 | max 2 per turn (default 'turn' scope)              |
 * | noDuplicateCall                | any (auto minimal)         | —                                                  |
 * | confirmFirst                   | deleteItem(via:either) purgeAll(via:ask) (auto base) | record-bound probe + recency (within:1) |
 * | noActAfterAskSameTurn          | deleteItem, purgeAll       | —                                                  |
 * | destructiveThrottle            | deleteItem, purgeAll (auto base) | —                                            |
 * | resultInvariant                | reportStatus (postTool)    | fires when result.count === 0                      |
 * | custom                         | listItems                  | denies args.page > 3                               |
 * | pendingConfirmMustAsk          | any (onReply)              | structural: unresolved probe requires an `ask` intention in the DELIVERED did this turn (ctx.did authoritative) |
 * | degenerationGuard              | any (auto minimal)         | — (param-free artifact-shape lint)                 |
 * | (DELETED — tier-③, SCG-T5) replyMentions (→ claimCoversRubric, polarity is a FIELD) · replySingleQuestion / replyMaxOccurrences (punctuation/CTA literalism, → llmCheck) · emptyReply (zero-width break, subsumed by respond schema minLength 1 + forced-terminal fallback) |
 * | llmCheck                       | collective:'skip'          | scripted adjudicator; the honesty/risk text judgment lives here now |
 * | consentRequired                | useMedia                   | consentOk = world.hasPrimary()                     |
 * | (DELETED — no-regex law 2026-08-02) noFabricatedSuccess · destructiveClaimRequiresSuccess · noFalseFailureClaim · minimalDisclosure · noInstructionFromData · noCompetitorClaim · noOutOfSurfaceActionClaim · noUngroundedRegulatedFigure |
 * | askedEarlier                   | createItem                 | askedEarlier({ tool:'createItem', arg:'condition' }) — gates the non-schema `condition` arg |
 * | (ABSORBED 2026-08-02) confirmedNeedsEarlierProbe → confirmFirst({ via:'probe' }) — record-bound probe now a via of the ONE confirm gate |
 * | (MERGED then DELETED) replyMustMention + replyConfirmsLabels → replyMentions → DELETED (tier-③, SCG-T5); reply-coverage is now claimCoversRubric over structured `did` (polarity is a FIELD) |
 * | llmCheck                       | collective:'skip'          | rubric+host adjudicator are agent-specific; proven isolated L1+L3 |
 *
 * ## SCRIPT CONVENTIONS (verified in signal-mechanics.test.ts)
 *  1. Every turn's script ends with a NON-empty `respond` (`args.message`; `did:[{op:'ask'}]` when asking; a
 *     `did: []` — or the real claim array — is required, an absent `did` reads as `claims-invalid`). An
 *     empty message never sets the terminal reply and triggers `forced-terminal`.
 *  2. Redrive correction steps may be PLAIN `{ text: '…' }` parts — the redrive re-generates ONE respond
 *     (respond-only, toolChoice pinned), and a step that returns free text instead falls back to that text.
 *  3. Call searchItem before any createItem; always pass `title` to createItem; never call updateItem
 *     (outside forbidThisTurn's own negative case); setPrimary ids match `itm-\d+`; ≤2 createItem per
 *     turn (vary titles to dodge noDuplicateCall); listItems `page` ≤ 3.
 *  4. Destructive protocol: deleteItem first WITHOUT `confirmed` (the probe), the SAME turn's reply asks
 *     "are you sure"; `confirmed:true` only in a LATER turn. purgeAll only after an earlier-turn ask.
 *     At most one destructive SUCCESS per turn. Never pass `force` to deleteItem.
 *  5. Replies: no '?' except confirmation/ask replies (which say "are you sure"); never
 *     deleted/removed/purged unless the destructive action truly succeeded this turn (or the sentence is
 *     an offer/question); never can't/unable-to/failed-to when every call succeeded; never mention a
 *     g###/u### label that was not produced or known to refExists; no scaffolding markup; no "published
 *     to production" (noFabricatedSuccess banRe); no repeated lines; no "created/generated the media"
 *     claims without a real label.
 *  6. RISK-FAMILY params (catalog-risk-families.ts) are chosen to be inert everywhere else: no reply
 *     may name `RivalCo`, carry `contactPhone`/`homeAddress`, claim a refund, or state `\d+ mg`; no
 *     createItem title may carry a bulk `delete/remove/purge all|every` imperative; `useMedia` is the
 *     consent-gated tool and no other script calls it.
 */
import type { GuardProof } from '../../src/testing/index.js';
import { BEHAVIOR_PROOFS } from './catalog-behavior.js';
import { RISK_FAMILY_PROOFS } from './catalog-risk-families.js';
import { RUN_OUTPUT_PROOFS } from './catalog-run-output.js';
import { SPATIAL_INPUT_PROOFS } from './catalog-spatial-input.js';

export const GUARD_PROOFS: GuardProof[] = [
  ...SPATIAL_INPUT_PROOFS,
  ...RUN_OUTPUT_PROOFS,
  ...BEHAVIOR_PROOFS,
  ...RISK_FAMILY_PROOFS,
];

/** ReplyMutator kinds proven by a dedicated describe in proofs-l1.test.ts. A NEW mutator export in
 *  src/guards/ must be added here (the ratchet goes red until it is) AND get its own proof block. */
export const PROVEN_MUTATORS = ['jargonScrub'];
