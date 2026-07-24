/** Guard proofs — BEHAVIOR dim (reply checks) (see catalog.ts for the collective ruleset + conventions). */
import {
  degenerationGuard,
  destructiveClaimRequiresSuccess,
  emptyReply,
  noFabricatedSuccess,
  noFalseFailureClaim,
  pendingConfirmMustAsk,
  replyConfirmsLabels,
  replyMaxOccurrences,
  replyMustMention,
  replySingleQuestion,
} from '../../src/guards.js';
import { FIXTURE_LABEL_SCHEME, FIXTURE_LEXICON } from '../../src/testing/fixture-world.js';
import type { GuardProof } from '../../src/testing/index.js';

/** RuntimeTurnInput shorthand (channel-agnostic — just the user text). */
const turn = (userText: string) => ({ userText });

export const BEHAVIOR_PROOFS: GuardProof[] = [
  // ── noFabricatedSuccess ─────────────────────────────────────────────────────
  {
    guard: 'noFabricatedSuccess',
    // Two injected seams beyond the claim/label scheme: `refExists` (the world-backed existence predicate
    // that replaced the removed MediaWorld coupling — the runtime carries no media concept) and `banRe`
    // (the unconditional-ban mode that absorbed the removed replyNoProductionClaim kind).
    make: () =>
      noFabricatedSuccess('createMedia', {
        claimRe: FIXTURE_LEXICON.fabricated.claimRe,
        labelRe: FIXTURE_LABEL_SCHEME.labelRe,
        verbClaimRe: FIXTURE_LEXICON.fabricated.verbClaimRe,
        banRe: FIXTURE_LEXICON.productionClaimRe,
        refExists: (world, label) => (world as unknown as { hasMediaLabel(l: string): boolean }).hasMediaLabel(label),
        reason: 'Do not claim media was produced — no media tool succeeded this turn; report the real state.',
      }),
    hook: 'onReply',
    target: 'any',
    cases: [
      {
        name: 'invented label cited with no attempt this turn (refExists says unknown)',
        polarity: 'negative',
        ctx: { reply: 'Your media g999 is ready.', observed: [], turnIndex: 0, producedThisTurn: [] },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('show me the media')],
          script: [
            [{ tool: 'replyToUser', args: { text: 'Your media g999 is ready.' } }],
            [{ text: 'No media has been produced yet.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'banRe: an always-banned phrase fires regardless of attempts',
        polarity: 'negative',
        ctx: { reply: 'Your changes have been published to production.', observed: [], turnIndex: 0 },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('did my change go out?')],
          script: [
            [{ tool: 'replyToUser', args: { text: 'Your changes have been published to production.' } }],
            [{ text: 'Your changes have been saved.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'claim language with a failed/vetoed attempt and no real label',
        polarity: 'negative',
        l1: 'fires',
        l3: {
          preset: 'quota-exhausted',
          turns: [turn('make me a plant image')],
          script: [
            [{ tool: 'createMedia', args: { prompt: 'a plant' } }],
            [{ tool: 'replyToUser', args: { text: 'I generated the media for you.' } }],
            [{ text: 'The media quota is exhausted, so nothing was generated this turn.' }],
          ],
          expect: 'redrive',
          // In the COLLECTIVE run the createMedia attempt is itself VETOED by precondition
          // (quotaRemaining()>0) — a legitimate co-fire, not interference: the attempt still lands in
          // observed (ok:false), which is exactly what keeps noFabricatedSuccess armed either way.
          alsoFires: ['precondition'],
        },
      },
      {
        name: 'reply cites the real produced label',
        polarity: 'positive',
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('make me a plant image')],
          script: [
            [{ tool: 'createMedia', args: { prompt: 'a plant' } }],
            [{ tool: 'replyToUser', args: { text: 'I created the media g001 for you.' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'reply cites an existing seeded label with no attempt this turn (refExists says known)',
        polarity: 'neutral',
        // world omitted — craftCtx defaults to FixtureWorld('seeded-media'), whose hasMediaLabel backs
        // refExists and already knows g001, so the citation is not invented.
        ctx: {
          reply: 'Your media g001 is ready.',
          observed: [],
          turnIndex: 0,
          producedThisTurn: [],
        },
        l1: 'silent',
      },
      {
        name: 'a benign phrase near the banned one is left alone (banRe is exact)',
        polarity: 'neutral',
        ctx: { reply: 'This will go live once approved.', observed: [], turnIndex: 0 },
        l1: 'silent',
      },
    ],
  },

  // ── replyMustMention (collective:'skip') ─────────────────────────────────────
  {
    guard: 'replyMustMention',
    make: () => replyMustMention(['done', 'ready'], 'Say clearly whether the work is done or ready.'),
    hook: 'onReply',
    target: 'any',
    collective: 'skip',
    cases: [
      {
        name: 'reply omits both keywords',
        polarity: 'negative',
        ctx: { reply: 'Sure thing.', observed: [], turnIndex: 0 },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('is it finished?')],
          script: [
            [{ tool: 'replyToUser', args: { text: 'Sure thing.' } }],
            [{ text: 'Yes, it is done now.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'reply says ready',
        polarity: 'positive',
        l1: 'fires', // unused (no ctx) — the l3 below carries the assertion
        l3: {
          preset: 'empty',
          turns: [turn('is it finished?')],
          script: [[{ tool: 'replyToUser', args: { text: 'It is ready now.' } }]],
          expect: 'pass',
        },
      },
      {
        name: 'reply already says ready (ctx only)',
        polarity: 'neutral',
        ctx: { reply: 'Ready to help further.', observed: [], turnIndex: 0 },
        l1: 'silent',
      },
    ],
  },

  // ── replyMaxOccurrences (collective:'skip') ──────────────────────────────────
  {
    guard: 'replyMaxOccurrences',
    make: () => replyMaxOccurrences(['buy now', 'subscribe', 'upgrade'], 1, 'At most one call-to-action per reply.'),
    hook: 'onReply',
    target: 'any',
    collective: 'skip',
    cases: [
      {
        name: 'two distinct CTAs in one reply',
        polarity: 'negative',
        ctx: { reply: 'Buy now and subscribe today!', observed: [], turnIndex: 0 },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('what should I do?')],
          script: [
            [{ tool: 'replyToUser', args: { text: 'You can buy now, or subscribe for updates.' } }],
            [{ text: 'You can buy now if you would like.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'one CTA only',
        polarity: 'positive',
        ctx: { reply: 'You can buy now if you would like.', observed: [], turnIndex: 0 },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('what should I do?')],
          script: [[{ tool: 'replyToUser', args: { text: 'Let us know if you want to upgrade later.' } }]],
          expect: 'pass',
        },
      },
      {
        name: 'no CTA at all',
        polarity: 'neutral',
        ctx: { reply: 'Thanks for reaching out.', observed: [], turnIndex: 0 },
        l1: 'silent',
      },
    ],
  },

  // ── replySingleQuestion (collective:'skip') ──────────────────────────────────
  {
    guard: 'replySingleQuestion',
    make: () => replySingleQuestion('Ask exactly one short question.'),
    hook: 'onReply',
    target: 'any',
    collective: 'skip',
    cases: [
      {
        name: 'zero question marks',
        polarity: 'negative',
        ctx: { reply: 'Here is the summary.', observed: [], turnIndex: 0 },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('what next?')],
          script: [
            [{ tool: 'replyToUser', args: { text: 'Here is the summary.' } }],
            [{ text: 'Would you like me to proceed?' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'exactly one question mark',
        polarity: 'positive',
        ctx: { reply: 'Would you like me to continue?', observed: [], turnIndex: 0 },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('what next?')],
          script: [[{ tool: 'replyToUser', args: { text: 'Would you like me to continue?' } }]],
          expect: 'pass',
        },
      },
      {
        name: 'two question marks',
        polarity: 'neutral',
        ctx: { reply: 'Do you want A? Or B?', observed: [], turnIndex: 0 },
        l1: 'fires',
      },
    ],
  },

  // ── replyConfirmsLabels (collective:'skip') ──────────────────────────────────
  {
    guard: 'replyConfirmsLabels',
    make: () => replyConfirmsLabels(['g001'], 'Confirm the media label g001 explicitly.'),
    hook: 'onReply',
    target: 'any',
    collective: 'skip',
    cases: [
      {
        name: 'reply omits the label',
        polarity: 'negative',
        ctx: { reply: 'All set!', observed: [], turnIndex: 0 },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('confirm the media')],
          script: [
            [{ tool: 'replyToUser', args: { text: 'All set!' } }],
            [{ text: 'Your media g001 is ready now.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'reply confirms the label',
        polarity: 'positive',
        ctx: { reply: 'Your media g001 is ready now.', observed: [], turnIndex: 0 },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('confirm the media')],
          script: [[{ tool: 'replyToUser', args: { text: 'Your media g001 is ready now.' } }]],
          expect: 'pass',
        },
      },
      {
        name: 'empty reply',
        polarity: 'neutral',
        ctx: { reply: '', observed: [], turnIndex: 0 },
        l1: 'fires',
      },
    ],
  },

  // ── emptyReply (auto minimal) ────────────────────────────────────────────────
  {
    guard: 'emptyReply',
    make: () => emptyReply(),
    hook: 'onReply',
    target: 'any',
    auto: 'minimal',
    cases: [
      {
        name: 'whitespace-only reply',
        polarity: 'negative',
        ctx: { reply: '   ', observed: [], turnIndex: 0 },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('give me the summary')],
          script: [
            [{ tool: 'replyToUser', args: { text: '' } }],
            [{ tool: 'replyToUser', args: { text: '' } }],
            [{ text: 'Here is the summary you asked for.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'non-empty reply',
        polarity: 'positive',
        ctx: { reply: 'All set.', observed: [], turnIndex: 0 },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('give me the summary')],
          script: [[{ tool: 'replyToUser', args: { text: 'All set, thanks!' } }]],
          expect: 'pass',
        },
      },
      {
        name: 'completely empty string',
        polarity: 'neutral',
        ctx: { reply: '', observed: [], turnIndex: 0 },
        l1: 'fires',
      },
    ],
  },

  // ── degenerationGuard (auto minimal) ─────────────────────────────────────────
  {
    guard: 'degenerationGuard',
    make: () => degenerationGuard(),
    hook: 'onReply',
    target: 'any',
    auto: 'minimal',
    cases: [
      {
        name: 'leaked think-block scaffolding',
        polarity: 'negative',
        ctx: { reply: '<think>plan</think> The item is ready.', observed: [], turnIndex: 0 },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('is the item ready?')],
          script: [
            [{ tool: 'replyToUser', args: { text: '<think>plan</think> The item is ready.' } }],
            [{ text: 'The item is ready.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'clean reply',
        polarity: 'positive',
        ctx: { reply: 'The item is ready.', observed: [], turnIndex: 0 },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('is the item ready?')],
          script: [[{ tool: 'replyToUser', args: { text: 'The item is ready.' } }]],
          expect: 'pass',
        },
      },
      {
        name: 'third-person self-narration is OFF when no selfNarrationRe is injected',
        polarity: 'neutral',
        // make() is opts-less → the narration branch is disabled; the ON-when-provided direction is
        // proven at the check level in proofs-l1.test.ts (bespoke describe).
        ctx: { reply: 'The assistant confirmed the update.', observed: [], turnIndex: 0 },
        l1: 'silent',
      },
      {
        name: 'run-away repeated line (always-on branch, no lexicon needed)',
        polarity: 'neutral',
        ctx: {
          reply: 'This is a repeated line.\nThis is a repeated line.\nThis is a repeated line.',
          observed: [],
          turnIndex: 0,
        },
        l1: 'fires',
      },
    ],
  },

  // ── pendingConfirmMustAsk ─────────────────────────────────────────────────────
  {
    guard: 'pendingConfirmMustAsk',
    make: () => pendingConfirmMustAsk({ askRe: FIXTURE_LEXICON.confirmAskRe }),
    hook: 'onReply',
    target: 'any',
    cases: [
      {
        name: 'unresolved probe, reply does not ask',
        polarity: 'negative',
        ctx: {
          observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0, resultFlags: { requiresConfirmation: true } }],
          turnIndex: 0,
          reply: 'The item is queued.',
        },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('delete item itm-1')],
          script: [
            [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
            [{ tool: 'replyToUser', args: { text: 'The item is queued.' } }],
            [{ text: 'Deleting item itm-1 needs your go-ahead — are you sure?' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'unresolved probe, reply relays the question',
        polarity: 'positive',
        ctx: {
          observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0, resultFlags: { requiresConfirmation: true } }],
          turnIndex: 0,
          reply: 'Deleting that item needs your confirmation — are you sure?',
        },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('delete item itm-1')],
          script: [
            [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
            [{ tool: 'replyToUser', args: { text: 'Deleting that item needs your confirmation — are you sure?' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'probe resolved by a same-turn confirmed success',
        polarity: 'neutral',
        ctx: {
          observed: [
            { name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0, resultFlags: { requiresConfirmation: true } },
            { name: 'deleteItem', args: { id: 'itm-1', confirmed: true }, ok: true, turnIndex: 0 },
          ],
          turnIndex: 0,
          reply: 'The item has been deleted as requested.',
        },
        l1: 'silent',
      },
    ],
  },

  // ── destructiveClaimRequiresSuccess ──────────────────────────────────────────
  {
    guard: 'destructiveClaimRequiresSuccess',
    make: () =>
      destructiveClaimRequiresSuccess(['deleteItem', 'purgeAll'], {
        claimRe: FIXTURE_LEXICON.destructiveClaim.claimRe,
        askRe: FIXTURE_LEXICON.confirmAskRe,
        offerRe: FIXTURE_LEXICON.destructiveClaim.offerRe,
        exemptRe: FIXTURE_LEXICON.destructiveClaim.exemptRe,
      }),
    hook: 'onReply',
    target: 'any',
    cases: [
      {
        name: 'probe attempted, reply claims deletion without asking',
        polarity: 'negative',
        ctx: {
          observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0 }],
          turnIndex: 0,
          reply: 'The item was deleted.',
        },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('delete item itm-1')],
          script: [
            [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
            [{ tool: 'replyToUser', args: { text: 'The item was deleted.' } }],
            [{ text: 'That deletion still needs your confirmation — are you sure?' }],
          ],
          expect: 'redrive',
          // The unresolved probe + a non-asking reply also trips pendingConfirmMustAsk in the collective
          // run — a genuine co-fire on the same violation, not interference.
          alsoFires: ['pendingConfirmMustAsk'],
        },
      },
      {
        name: 'confirmed success this turn — exempt (tookEffect)',
        polarity: 'positive',
        ctx: {
          observed: [{ name: 'deleteItem', args: { id: 'itm-1', confirmed: true }, ok: true, turnIndex: 0 }],
          turnIndex: 0,
          reply: 'The item was deleted as requested.',
        },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('delete item itm-1'), turn('yes, go ahead')],
          script: [
            [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
            [{ tool: 'replyToUser', args: { text: 'Deleting that item needs your confirmation — are you sure?' } }],
            [{ tool: 'deleteItem', args: { id: 'itm-1', confirmed: true } }],
            [{ tool: 'replyToUser', args: { text: 'The item was deleted as requested.' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'no destructive attempt this turn — status readback is not a claim',
        polarity: 'neutral',
        ctx: { reply: 'It was removed last week.', observed: [], turnIndex: 0 },
        l1: 'silent',
      },
      {
        name: 'P9: a policy-REJECTED probe + an asking reply is exempt (honest cap explanation)',
        polarity: 'positive',
        ctx: {
          observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: false, turnIndex: 0 }],
          turnIndex: 0,
          reply: 'Only the expired duplicate was removed by the cleanup preview. Deleting the live item is permanent — are you sure?',
        },
        l1: 'silent',
      },
      {
        name: 'P9 teeth: a FAILED confirmed:true attempt + a bare done-claim still fires',
        polarity: 'negative',
        ctx: {
          observed: [{ name: 'deleteItem', args: { id: 'itm-1', confirmed: true }, ok: false, turnIndex: 0 }],
          turnIndex: 0,
          reply: 'The item was deleted.',
        },
        l1: 'fires',
      },
      {
        name: 'offer, not a claim',
        polarity: 'neutral',
        ctx: {
          observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0 }],
          turnIndex: 0,
          reply: 'Would you like me to delete it?',
        },
        l1: 'silent',
      },
    ],
  },

  // ── noFalseFailureClaim (auto minimal via lexicon) ───────────────────────────
  {
    guard: 'noFalseFailureClaim',
    make: () => noFalseFailureClaim({ claimRe: FIXTURE_LEXICON.falseFailureClaimRe }),
    hook: 'onReply',
    target: 'any',
    auto: 'minimal',
    specTweaks: { lexicon: { falseFailureClaimRe: FIXTURE_LEXICON.falseFailureClaimRe } },
    cases: [
      {
        // B1 (bankdesk 2026-07-23): the false-failure claim now requires an ACTION that TOOK EFFECT
        // (a mutation), not merely a successful read — else an honest "I cannot / no record" on a
        // read-only turn is wrongly vetoed. Here updateItem MUTATES (tookEffect:true) → firing is right.
        name: 'an action TOOK EFFECT, reply claims inability',
        polarity: 'negative',
        ctx: {
          observed: [{ name: 'setPrimary', args: { id: 'itm-7' }, ok: true, turnIndex: 0, tookEffect: true }],
          turnIndex: 0,
          reply: 'I was unable to set that as primary.',
        },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('set item itm-7 as primary')],
          script: [
            [{ tool: 'setPrimary', args: { id: 'itm-7' } }],
            [{ tool: 'replyToUser', args: { text: 'I was unable to set that as primary.' } }],
            [{ text: 'The item was set as primary successfully.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        // B1 · the exact bankdesk 17/19 shape: only a READ succeeded this turn (tookEffect:false), and the
        // model HONESTLY says it cannot act / found nothing. This is NOT a false-failure claim → SILENT.
        // (Mutation-provable: revert the guards.ts `tookEffect` condition and this goes silent→fires.)
        name: 'B1 · only a READ succeeded, honest "cannot" reply → silent',
        polarity: 'neutral',
        ctx: {
          observed: [{ name: 'searchItem', args: { query: 'plants' }, ok: true, turnIndex: 0, tookEffect: false }],
          turnIndex: 0,
          reply: 'I was unable to find any matching items for that.',
        },
        l1: 'silent',
      },
      {
        name: 'all calls succeeded, clean reply',
        polarity: 'positive',
        ctx: {
          observed: [{ name: 'searchItem', args: { query: 'plants' }, ok: true, turnIndex: 0 }],
          turnIndex: 0,
          reply: 'I found the matching items in the search results.',
        },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('search for plants')],
          script: [
            [{ tool: 'searchItem', args: { query: 'plants' } }],
            [{ tool: 'replyToUser', args: { text: 'I found the matching items in the search results.' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'no calls this turn — claim language left alone',
        polarity: 'neutral',
        ctx: { observed: [], turnIndex: 0, reply: 'I was unable to search for that.' },
        l1: 'silent',
      },
      {
        name: 'a call failed this turn — claim language left alone',
        polarity: 'neutral',
        ctx: {
          observed: [{ name: 'searchItem', args: { query: 'plants' }, ok: false, turnIndex: 0 }],
          turnIndex: 0,
          reply: 'I was unable to search for that.',
        },
        l1: 'silent',
      },
    ],
  },
];
