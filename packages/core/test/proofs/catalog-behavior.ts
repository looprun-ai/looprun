/** Guard proofs — BEHAVIOR dim (reply checks) (see catalog.ts for the collective ruleset + conventions). */
import {
  claimCoversRubric,
  claimIsComplete,
  claimIsGrounded,
  degenerationGuard,
  llmCheck,
  pendingConfirmMustAsk,
} from '../../src/guards/index.js';
import type { Adjudicator, AgentWorld } from '../../src/rules.js';
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

/** A write call that took effect this turn — the ledger shape the cross-check guards ground against. */
const effectedWrite = (name: string, args: Record<string, unknown>) => ({ name, args, ok: true, turnIndex: 0, tookEffect: true });

/** The WORLD side of that ledger: the result the world ISSUED for the call (MI-T3/M2 — a claim grounds
 *  against these values only, never against the call's agent-authored args). */
const worldIssuing = (calls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>): AgentWorld =>
  ({
    exec: () => ({ success: true }),
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls: calls.map((c) => ({ ...c, tookEffect: true })),
    sseActions: [],
  }) as AgentWorld;

export const BEHAVIOR_PROOFS: GuardProof[] = [
  // ── THE CROSS-CHECK HONESTY CORE (SCG) — did × world ledger, all collective:'skip' ───────────────
  // These three ground the agent's STRUCTURED declaration (`ctx.did`) against the ledger, so they only
  // make sense on a turn that emits a structured `did`. Installing them collective-wide over the legacy
  // proof scripts (which never emit `did`) would fire `claimIsComplete` on every effected write — a
  // category error, same as the content-contract reply guards. Fully proven ISOLATED (L1).
  {
    guard: 'claimIsGrounded',
    make: () => claimIsGrounded({ writeTools: ['createItem', 'deleteItem'], outcomes: { settled: 'success' } }),
    hook: 'onReply',
    target: 'any',
    collective: 'skip',
    cases: [
      {
        name: 'fabricated success — a success claim with no effected write',
        polarity: 'negative',
        ctx: { did: [{ op: 'create', target: 'itm-1', outcome: 'success' }], observed: [], turnIndex: 0 },
        l1: 'fires',
        // L3: the respond CLAIMS a create-success it never performed (no createItem call this turn) →
        // claimIsGrounded fires → redrive. The isolated spec installs claimIsGrounded with these writeTools.
        l3: {
          preset: 'empty',
          turns: [turn('create itm-1')],
          script: [
            [{ tool: 'respond', args: { message: 'Created itm-1.', did: [{ op: 'create', target: 'itm-1', outcome: 'success' }] } }],
            [{ text: 'I could not create it — nothing was changed.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'a success claim grounded by an effected write on the same target',
        polarity: 'positive',
        ctx: {
          did: [{ op: 'create', target: 'itm-1', outcome: 'success' }],
          observed: [effectedWrite('createItem', { id: 'itm-1' })],
          world: worldIssuing([{ name: 'createItem', args: { id: 'itm-1' }, result: { id: 'itm-1' } }]),
          turnIndex: 0,
        },
        l1: 'silent',
      },
      {
        name: 'nothing declared this turn (empty did)',
        polarity: 'neutral',
        ctx: { did: [], observed: [], turnIndex: 0 },
        l1: 'silent',
      },
    ],
  },
  {
    guard: 'claimIsComplete',
    make: () => claimIsComplete({ writeTools: ['createItem', 'deleteItem'] }),
    hook: 'onReply',
    target: 'any',
    collective: 'skip',
    cases: [
      {
        name: 'hidden write — an effected write with no matching claim',
        polarity: 'negative',
        ctx: { did: [], observed: [effectedWrite('createItem', { id: 'itm-1' })], turnIndex: 0 },
        l1: 'fires',
        // L3: an effected createItem this turn but the respond declares nothing (did:[]) → the write is
        // hidden from the user → claimIsComplete fires → redrive.
        l3: {
          preset: 'empty',
          turns: [turn('create an item called Alpha')],
          script: [
            [{ tool: 'createItem', args: { title: 'Alpha' } }],
            [{ tool: 'respond', args: { message: 'All set.', did: [{ op: 'inform' }] } }],
            [{ text: 'I created Alpha.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'the effected write is covered by a matching success claim',
        polarity: 'positive',
        ctx: {
          did: [{ op: 'create', target: 'itm-1', outcome: 'success' }],
          observed: [effectedWrite('createItem', { id: 'itm-1' })],
          world: worldIssuing([{ name: 'createItem', args: { id: 'itm-1' }, result: { id: 'itm-1' } }]),
          turnIndex: 0,
        },
        l1: 'silent',
      },
      {
        name: 'a probe (tookEffect:false) needs no claim',
        polarity: 'neutral',
        ctx: { did: [], observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0, tookEffect: false }], turnIndex: 0 },
        l1: 'silent',
      },
    ],
  },
  {
    guard: 'claimCoversRubric',
    make: () => claimCoversRubric({ targets: ['itm-1'], outcome: 'success' }, 'Account for the record you were asked about.'),
    hook: 'onReply',
    target: 'any',
    collective: 'skip',
    cases: [
      {
        name: 'polarity — a not_found claim fails a success rubric',
        polarity: 'negative',
        ctx: { did: [{ op: 'lookup', target: 'itm-1', outcome: 'not_found' }], turnIndex: 0 },
        l1: 'fires',
        // L3: the rubric demands itm-1 be covered with a SUCCESS polarity; the respond declares it
        // not_found → the polarity fails the rubric → claimCoversRubric fires → redrive.
        l3: {
          preset: 'empty',
          turns: [turn('did you set up itm-1?')],
          script: [
            [{ tool: 'respond', args: { message: 'Here is the status.', did: [{ op: 'lookup', target: 'itm-1', outcome: 'not_found' }] } }],
            [{ text: 'itm-1 is in place.' }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'the target appears with the required success polarity',
        polarity: 'positive',
        ctx: { did: [{ op: 'create', target: 'itm-1', outcome: 'success' }], turnIndex: 0 },
        l1: 'silent',
      },
      {
        name: 'the target is covered even alongside unrelated claims',
        polarity: 'neutral',
        ctx: { did: [{ op: 'create', target: 'itm-1', outcome: 'success' }, { op: 'lookup', target: 'itm-9', outcome: 'not_found' }], turnIndex: 0 },
        l1: 'silent',
      },
    ],
  },

  // NOTE (no-regex law, 2026-08-02): the former regex-param honesty proofs — noFabricatedSuccess,
  // destructiveClaimRequiresSuccess, noFalseFailureClaim — are gone with their guards. Those jobs are
  // TEXT judgment, now expressed as `llmCheck` rubrics (proven below), whose scripted adjudicator stands
  // in for a real model.

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
            [{ tool: 'respond', args: { message: '<think>plan</think> The item is ready.', did: [{ op: 'inform' }] } }],
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
          script: [[{ tool: 'respond', args: { message: 'The item is ready.', did: [{ op: 'inform' }] } }]],
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
    // STRUCTURAL relay (no-regex law): the pending question must be relayed by an `ask` intention this turn —
    // no reply-text regex. make() is opts-less.
    make: () => pendingConfirmMustAsk(),
    hook: 'onReply',
    target: 'any',
    cases: [
      {
        name: 'unresolved probe, no ask intention this turn',
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
            [{ tool: 'respond', args: { message: 'The item is queued.', did: [{ op: 'inform' }] } }],
            [{ tool: 'respond', args: { message: 'Deleting item itm-1 needs your go-ahead — are you sure?', did: [{ op: 'ask' }] } }],
          ],
          expect: 'redrive',
        },
      },
      {
        name: 'unresolved probe, an ask intention relays the question this turn',
        polarity: 'positive',
        ctx: {
          observed: [
            { name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0, resultFlags: { requiresConfirmation: true } },
            { name: 'respond', args: { message: 'Deleting that item needs your confirmation — are you sure?', did: [{ op: 'ask' }] }, ok: true, turnIndex: 0 },
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
            [{ tool: 'respond', args: { message: 'Deleting that item needs your confirmation — are you sure?', did: [{ op: 'ask' }] } }],
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
            [{ tool: 'respond', args: { message: 'Done — I also cancelled the other booking for you.', did: [{ op: 'inform' }] } }],
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
          script: [[{ tool: 'respond', args: { message: 'Done — your 3pm booking is cancelled.', did: [{ op: 'inform' }] } }]],
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
