/**
 * THE GUARD-PROOF CATALOG — every guard kind exported by src/guards.ts carries one {@link GuardProof}
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
 * | labelExists                    | useMedia                   | labelExists('label')                               |
 * | argFormat                      | setPrimary                 | argFormat('id', '^itm-\\d+$')                      |
 * | labelProvenance                | editMedia                  | expect 'generated', FIXTURE_LABEL_SCHEME.uploadRe  |
 * | precondition                   | createMedia                | quotaRemaining() > 0                               |
 * | maxCallsPerTurn                | createItem                 | max 2 per turn                                     |
 * | maxCallsPerConversation        | createMedia                | max 3 per conversation                             |
 * | noDuplicateCall                | any (auto minimal)         | —                                                  |
 * | confirmFirst                   | deleteItem(arg) purgeAll(prior-ask) (auto base) | lexicon.confirmAskRe          |
 * | noActAfterAskSameTurn          | deleteItem, purgeAll       | —                                                  |
 * | destructiveThrottle            | deleteItem, purgeAll (auto base) | —                                            |
 * | resultInvariant                | reportStatus (postTool)    | fires when result.count === 0                      |
 * | custom                         | listItems                  | denies args.page > 3                               |
 * | noFabricatedSuccess            | any (onReply)              | tool 'createMedia', FIXTURE_LEXICON.fabricated     |
 * | pendingConfirmMustAsk          | any (onReply)              | FIXTURE_LEXICON.confirmAskRe                       |
 * | destructiveClaimRequiresSuccess| any (onReply)              | ['deleteItem','purgeAll'], FIXTURE_LEXICON.destructiveClaim |
 * | replyNoProductionClaim         | any (onReply)              | FIXTURE_LEXICON.productionClaimRe                  |
 * | noFalseFailureClaim            | any (auto minimal, lexicon)| FIXTURE_LEXICON.falseFailureClaimRe                |
 * | emptyReply                     | any (auto minimal)         | —                                                  |
 * | degenerationGuard              | any (auto minimal)         | —                                                  |
 * | replyMustMention / replyMaxOccurrences / replySingleQuestion / replyConfirmsLabels | collective:'skip' (content-contract guards, proven isolated only) |
 *
 * ## SCRIPT CONVENTIONS (verified in signal-mechanics.test.ts)
 *  1. Every turn's script ends with a NON-empty replyToUser (or askUser when asking) — an empty text
 *     never sets the terminal reply and triggers `forced-terminal`.
 *  2. Redrive correction steps are PLAIN `{ text: '…' }` parts (the redrive runs toolChoice:'none').
 *  3. Call searchItem before any createItem; always pass `title` to createItem; never call updateItem
 *     (outside forbidThisTurn's own negative case); setPrimary ids match `itm-\d+`; useMedia only with
 *     existing labels; editMedia only with generated labels; ≤2 createItem per turn (vary titles to
 *     dodge noDuplicateCall); ≤3 createMedia per conversation; listItems `page` ≤ 3.
 *  4. Destructive protocol: deleteItem first WITHOUT `confirmed` (the probe), the SAME turn's reply asks
 *     "are you sure"; `confirmed:true` only in a LATER turn. purgeAll only after an earlier-turn askUser.
 *     At most one destructive SUCCESS per turn. Never pass `force` to deleteItem.
 *  5. Replies: no '?' except confirmation/ask replies (which say "are you sure"); never
 *     deleted/removed/purged unless the destructive action truly succeeded this turn (or the sentence is
 *     an offer/question); never can't/unable-to/failed-to when every call succeeded; never mention a
 *     g###/u### label that was not produced or seeded; no scaffolding markup; no "published to
 *     production"; no repeated lines; no "created/generated the media" claims without a real label.
 */
import type { GuardProof } from '../../src/testing/index.js';
import { BEHAVIOR_PROOFS } from './catalog-behavior.js';
import { RUN_OUTPUT_PROOFS } from './catalog-run-output.js';
import { SPATIAL_INPUT_PROOFS } from './catalog-spatial-input.js';

export const GUARD_PROOFS: GuardProof[] = [
  ...SPATIAL_INPUT_PROOFS,
  ...RUN_OUTPUT_PROOFS,
  ...BEHAVIOR_PROOFS,
];

/** ReplyMutator kinds proven by a dedicated describe in proofs-l1.test.ts. A NEW mutator export in
 *  guards.ts must be added here (the ratchet goes red until it is) AND get its own proof block. */
export const PROVEN_MUTATORS = ['jargonScrub'];
