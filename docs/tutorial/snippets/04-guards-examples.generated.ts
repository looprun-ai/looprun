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
  claimCoversRubric,
  claimIsComplete,
  claimIsGrounded,
  confirmFirst,
  consentRequired,
  custom,
  degenerationGuard,
  destructiveThrottle,
  forbidThisTurn,
  jargonScrub,
  llmCheck,
  maxCalls,
  noActAfterAskSameTurn,
  noDuplicateCall,
  pendingConfirmMustAsk,
  precondition,
  requiresBefore,
  resultInvariant,
} from 'looprun';
import type { Guard, ReplyMutator } from 'looprun';

/** The 22 examples of chapter 04 §5, in catalog order. */
export const CATALOG_EXAMPLES: ReadonlyArray<Guard | ReplyMutator> = [
  /* requiresBefore        */ requiresBefore(['findBooking']),
  /* forbidThisTurn        */ forbidThisTurn('Do not reschedule while a cancellation is pending — resolve that first.'),
  /* maxCalls              */ maxCalls('sendEmail', 1, 'You already emailed this person.', { scope: 'conversation' }),
  /* noDuplicateCall       */ noDuplicateCall(),
  /* argRequired           */ argRequired('bookingId'),
  /* argAbsent             */ argAbsent('customerEmail'),
  /* argFormat             */ argFormat('bookingId', '^BK-\\d{6}$'),
  /* precondition          */ precondition((world) => world.accountActive === true, 'This account is closed — you cannot act on it.', 'act on an account only while it is open'),
  /* resultInvariant       */ resultInvariant((result) => Array.isArray(result) && result.length > 0, 'The search returned nothing — say so instead of summarising it.', 'report an empty result as empty'),
  /* consentRequired       */ consentRequired({ tools: ['storeProfile'], consentOk: (world) => world.consentOnRecord === true, reason: 'No consent on record — ask for it before storing anything.' }),
  /* confirmFirst          */ confirmFirst('confirmed'),
  /* noActAfterAskSameTurn */ noActAfterAskSameTurn(['cancelBooking']),
  /* destructiveThrottle   */ destructiveThrottle(['cancelBooking', 'refundOrder']),
  /* pendingConfirmMustAsk */ pendingConfirmMustAsk(),
  /* claimIsGrounded       */ claimIsGrounded({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } }),
  /* claimIsComplete       */ claimIsComplete({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } }),
  /* claimCoversRubric     */ claimCoversRubric({ targets: ['BK-100234'], outcome: 'success' }, 'Account for the booking you were asked about.'),
  /* degenerationGuard     */ degenerationGuard(),
  /* jargonScrub           */ jargonScrub({ CANC_PEND: 'waiting to be cancelled' }),
  /* askedEarlier          */ askedEarlier({ tool: 'completeMaintenance', arg: 'condition' }),
  /* llmCheck              */ llmCheck({ rubric: 'Did the user, in an earlier turn, explicitly authorise THIS exact action?', failMode: 'closed' }),
  /* custom                */ custom({ kind: 'imageQuotaLeft', dim: 'run', check: (ctx) => (ctx.world.imageQuotaRemaining > 0 ? null : 'No image quota left this month — say so instead of generating.'), prose: () => 'generate an image only while quota remains' }),
];
