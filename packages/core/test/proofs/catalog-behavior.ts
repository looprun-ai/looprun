/** Guard proofs — BEHAVIOR dim (reply checks) (see catalog.ts for the collective ruleset + conventions). */
import {
  degenerationGuard,
  emptyReply,
  llmCheck,
  pendingConfirmMustAsk,
  replyMaxOccurrences,
  replyMentions,
  replySingleQuestion,
} from '../../src/guards/index.js';
import type { Adjudicator } from '../../src/rules.js';
import type { GuardProof } from '../../src/testing/index.js';

/** TurnInput shorthand (channel-agnostic — just the user text). */
const turn = (userText: string) => ({ userText });

/** Scripted adjudicators for the llmCheck proof — a host seam standing in for a real model. Deterministic
 *  so the proof is reproducible: DENY reads the reply for the un-authorised claim; ALLOW never objects;
 *  THROWS proves the failMode path. */
const DENY_ADJ: Adjudicator = async (_rubric, ctx) => ({
  violation: (ctx.reply ?? '').includes('cancelled the other')
    ? 'The user authorised one cancellation; this reply claims a SECOND the user never licensed.'
    : null,
});
const ALLOW_ADJ: Adjudicator = async () => ({ violation: null });

export const BEHAVIOR_PROOFS: GuardProof[] = [
  // NOTE (no-regex law, 2026-08-02): the former regex-param honesty proofs — noFabricatedSuccess,
  // destructiveClaimRequiresSuccess, noFalseFailureClaim — are gone with their guards. Those jobs are
  // TEXT judgment, now expressed as `llmCheck` rubrics (proven below), whose scripted adjudicator stands
  // in for a real model.

  // ── replyMentions — default all-of (the former replyConfirmsLabels) (collective:'skip') ──────────
  // The anyTerm:true (at-least-one) mode + case-insensitivity are proven in reply-mentions.test.ts;
  // this proof exercises the DEFAULT all-of mode (every term required, empty reply denied).
  {
    guard: 'replyMentions',
    make: () => replyMentions({ terms: ['g001'] }, 'Confirm the media label g001 explicitly.'),
    hook: 'onReply',
    target: 'any',
    collective: 'skip',
    cases: [
      {
        name: 'reply omits the required term',
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
        name: 'reply names the required term',
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
        name: 'third-person self-narration is NOT gated here (that text judgment is llmCheck\'s job now)',
        polarity: 'neutral',
        // The no-regex law retired the selfNarrationRe branch: degenerationGuard is a param-free
        // artifact-shape lint (template tokens / repetition), so plain narrative prose passes.
        ctx: { reply: 'The assistant confirmed the update.', observed: [], turnIndex: 0 },
        l1: 'silent',
      },
      {
        name: 'run-away repeated line (always-on branch)',
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
    // STRUCTURAL relay (no-regex law): the pending question must be put via an `askUser` call this turn —
    // no reply-text regex. make() is opts-less.
    make: () => pendingConfirmMustAsk(),
    hook: 'onReply',
    target: 'any',
    cases: [
      {
        name: 'unresolved probe, no askUser this turn',
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
            [{ tool: 'askUser', args: { text: 'Deleting item itm-1 needs your go-ahead — are you sure?' } }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'unresolved probe, an askUser relays the question this turn',
        polarity: 'positive',
        ctx: {
          observed: [
            { name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0, resultFlags: { requiresConfirmation: true } },
            { name: 'askUser', args: { text: 'Deleting that item needs your confirmation — are you sure?' }, ok: true, turnIndex: 0 },
          ],
          turnIndex: 0,
          reply: 'Deleting that item needs your confirmation — are you sure?',
        },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('delete item itm-1')],
          script: [
            [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
            [{ tool: 'askUser', args: { text: 'Deleting that item needs your confirmation — are you sure?' } }],
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

  // ── llmCheck (collective:'skip' — the rubric+adjudicator are agent-specific) ──────────────────────
  {
    guard: 'llmCheck',
    // The case-35 shape: "did the operator's yes license THIS act?" — a two-acts-one-yes judgement that
    // structure alone (observed calls) cannot make. failMode default 'open'.
    make: () => llmCheck({ rubric: "Did the user, in an earlier turn, explicitly authorise THIS exact action — not merely a related one?" }),
    hook: 'onReply',
    target: 'any',
    // Like the content-contract reply guards: an llmCheck's rubric + host adjudicator are bound to ONE
    // agent's contract; installing it collective-wide over arbitrary scenarios (with one shared scripted
    // adjudicator) is a category error, not an interference finding. Fully proven ISOLATED (L1 + L3).
    collective: 'skip',
    cases: [
      {
        name: 'adjudicator returns a violation → fires (verdict is the deny)',
        polarity: 'negative',
        ctx: { reply: 'Done — I also cancelled the other booking for you.', adjudicator: DENY_ADJ, turnIndex: 0, observed: [] },
        l1: 'fires',
        l3: {
          preset: 'empty',
          turns: [turn('cancel my 3pm booking')],
          script: [
            [{ tool: 'replyToUser', args: { text: 'Done — I also cancelled the other booking for you.' } }],
            [{ text: 'I only cancelled the 3pm booking you asked about; nothing else was touched.' }],
          ],
          adjudicator: DENY_ADJ,
          expect: 'redrive',
        },
      },
      {
        name: 'adjudicator returns null → silent (allow)',
        polarity: 'positive',
        ctx: { reply: 'Done — your 3pm booking is cancelled.', adjudicator: ALLOW_ADJ, turnIndex: 0, observed: [] },
        l1: 'silent',
        l3: {
          preset: 'empty',
          turns: [turn('cancel my 3pm booking')],
          script: [[{ tool: 'replyToUser', args: { text: 'Done — your 3pm booking is cancelled.' } }]],
          adjudicator: ALLOW_ADJ,
          expect: 'pass',
        },
      },
      {
        name: 'failMode open: an UNREACHABLE adjudicator (throws) allows → silent',
        polarity: 'neutral',
        // The guard from make() is failMode 'open'; a throwing adjudicator means "could not verify" and,
        // open, that allows. (The 'closed' direction is proven at the check level in proofs-l1.test.ts.)
        ctx: { reply: 'anything', adjudicator: (async () => { throw new Error('adjudicator offline'); }) as Adjudicator, turnIndex: 0, observed: [] },
        l1: 'silent',
      },
    ],
  },
];
