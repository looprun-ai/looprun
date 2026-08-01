/**
 * GENERATED — do not edit. `pnpm docs:guards` renders this from `GUARD_CATALOG`
 * (`packages/core/src/guards/catalog.ts`); `--check` fails on drift.
 *
 * WHY IT EXISTS: chapter 04 §5 fences every one of these strings verbatim. Compiling them here
 * is what makes the chapter's claim true — a catalog example that does not typecheck against the
 * published `looprun` facade fails `pnpm -C docs/tutorial/snippets typecheck`, and therefore CI.
 *
 * Nothing imports this module. It is a compile-time assertion, not a runtime artifact.
 */
import {
  argAbsent,
  argFormat,
  argRequired,
  askedEarlier,
  confirmFirst,
  confirmedNeedsEarlierProbe,
  consentRequired,
  custom,
  degenerationGuard,
  destructiveClaimRequiresSuccess,
  destructiveThrottle,
  emptyReply,
  forbidThisTurn,
  jargonScrub,
  maxCalls,
  minimalDisclosure,
  noActAfterAskSameTurn,
  noCompetitorClaim,
  noDuplicateCall,
  noFabricatedSuccess,
  noFalseFailureClaim,
  noInstructionFromData,
  noOutOfSurfaceActionClaim,
  noUngroundedRegulatedFigure,
  pendingConfirmMustAsk,
  precondition,
  replyConfirmsLabels,
  replyMaxOccurrences,
  replyMustMention,
  replySingleQuestion,
  requiresBefore,
  resultInvariant,
} from 'looprun';
import type { Guard, ReplyMutator } from 'looprun';

/** The 32 examples of chapter 04 §5, in catalog order. */
export const CATALOG_EXAMPLES: ReadonlyArray<Guard | ReplyMutator> = [
  /* requiresBefore                  */ requiresBefore(['findBooking']),
  /* forbidThisTurn                  */ forbidThisTurn('Do not reschedule while a cancellation is pending — resolve that first.'),
  /* maxCalls                        */ maxCalls('sendEmail', 1, 'You already emailed this person.', { scope: 'conversation' }),
  /* noDuplicateCall                 */ noDuplicateCall(),
  /* argRequired                     */ argRequired('bookingId'),
  /* argAbsent                       */ argAbsent('customerEmail'),
  /* argFormat                       */ argFormat('bookingId', '^BK-\\d{6}$'),
  /* precondition                    */ precondition((world) => world.accountActive === true, 'This account is closed — you cannot act on it.', 'act on an account only while it is open'),
  /* resultInvariant                 */ resultInvariant((result) => Array.isArray(result) && result.length > 0, 'The search returned nothing — say so instead of summarising it.', 'report an empty result as empty'),
  /* consentRequired                 */ consentRequired({ tools: ['storeProfile'], consentOk: (world) => world.consentOnRecord === true, reason: 'No consent on record — ask for it before storing anything.' }),
  /* confirmFirst                    */ confirmFirst('confirmed'),
  /* noActAfterAskSameTurn           */ noActAfterAskSameTurn(['cancelBooking']),
  /* destructiveThrottle             */ destructiveThrottle(['cancelBooking', 'refundOrder']),
  /* pendingConfirmMustAsk           */ pendingConfirmMustAsk({ askRe: /shall I|do you want me to/i }),
  /* noFabricatedSuccess             */ noFabricatedSuccess('generateReport', { reason: 'No report was generated this turn — do not say one was.', claimRe: /report is ready/i }),
  /* destructiveClaimRequiresSuccess */ destructiveClaimRequiresSuccess(['cancelBooking'], { claimRe: /cancelled/i, askRe: /shall I cancel/i, offerRe: /would you like/i }),
  /* noFalseFailureClaim             */ noFalseFailureClaim({ claimRe: /failed to|something went wrong/i }),
  /* noOutOfSurfaceActionClaim       */ noOutOfSurfaceActionClaim({ actionClaims: [{ claimRe: /refund (?:has been )?issued/i, tool: 'issueRefund' }], surface: ['findBooking'] }),
  /* noUngroundedRegulatedFigure     */ noUngroundedRegulatedFigure({ regulatedRe: /\b\d+\s?mg\b/i, allowFromToolResults: true }),
  /* noCompetitorClaim               */ noCompetitorClaim({ competitorRe: /\bAcme\b/i, comparativeRe: /\b(?:better|cheaper|faster) than\b/i }),
  /* replyMustMention                */ replyMustMention(['support@example.com'], 'Give the support address so the person can follow up.'),
  /* replyMaxOccurrences             */ replyMaxOccurrences(['book now', 'call us', 'subscribe'], 1, 'One ask per reply — drop the extra calls-to-action.'),
  /* replySingleQuestion             */ replySingleQuestion('Ask exactly one question so the person can answer it.'),
  /* replyConfirmsLabels             */ replyConfirmsLabels(['BK-100234'], 'Name the booking you acted on so the person can check it.'),
  /* emptyReply                      */ emptyReply(),
  /* degenerationGuard               */ degenerationGuard({ selfNarrationRe: /the assistant (?:then )?(?:called|checked)/i }),
  /* minimalDisclosure               */ minimalDisclosure({ piiFields: ['phone', 'email'], entityIdRe: /\bCU-\d{5}\b/, maxEntities: 1 }),
  /* noInstructionFromData           */ noInstructionFromData({ tools: ['cancelBooking'], instructionRe: /please cancel|delete all/i }),
  /* jargonScrub                     */ jargonScrub({ CANC_PEND: 'waiting to be cancelled' }),
  /* askedEarlier                    */ askedEarlier({ tool: 'completeMaintenance', arg: 'condition' }),
  /* confirmedNeedsEarlierProbe      */ confirmedNeedsEarlierProbe({ tools: ['chargeDeposit'] }),
  /* custom                          */ custom({ kind: 'imageQuotaLeft', dim: 'run', check: (ctx) => (ctx.world.imageQuotaRemaining > 0 ? null : 'No image quota left this month — say so instead of generating.'), prose: () => 'generate an image only while quota remains' }),
];
