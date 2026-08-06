/** Guard proofs — RUN + OUTPUT dims + custom (see catalog.ts for the collective ruleset + conventions). */
import {
  valueFromUser,
  confirmFirst,
  custom,
  destructiveThrottle,
  maxCalls,
  noDuplicateCall,
  precondition,
  resultInvariant,
} from '../../src/guards/index.js';
import { FixtureWorld } from '../../src/testing/index.js';
import type { GuardProof } from '../../src/testing/index.js';

// ── precondition (createMedia — gated on remaining media quota) ──────────────
const preconditionProof: GuardProof = {
  guard: 'precondition',
  make: () =>
    precondition(
      (w) => (w as any).quotaRemaining() > 0,
      'The media quota is exhausted — do not generate more media; explain the limit instead.',
      'only while media quota remains',
    ),
  hook: 'preTool',
  target: ['createMedia'],
  cases: [
    {
      name: 'quota remaining allows generation',
      polarity: 'positive',
      ctx: {},
      l1: 'silent',
      l3: {
        preset: 'seeded-media',
        turns: [{ userText: 'create an image' }],
        script: [
          [{ tool: 'createMedia', args: { prompt: 'a mountain at dawn' } }],
          [{ tool: 'respond', args: { message: 'A new media asset was generated.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'quota exhausted blocks generation',
      polarity: 'negative',
      ctx: { world: new FixtureWorld('quota-exhausted') },
      l1: 'fires',
      l3: {
        preset: 'quota-exhausted',
        turns: [{ userText: 'create an image' }],
        script: [
          [{ tool: 'createMedia', args: { prompt: 'a mountain at dawn' } }],
          [{ tool: 'respond', args: { message: 'The media quota is exhausted, so a new asset was not generated right now.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'createMedia',
      },
    },
    {
      name: 'check reads world state only, independent of the tool under evaluation',
      polarity: 'neutral',
      ctx: { tool: 'searchItem', args: { query: 'x' }, world: new FixtureWorld('seeded-media') },
      l1: 'silent',
    },
  ],
};

// ── maxCalls (createItem — at most 2 per turn; the canonical proof pins the DEFAULT 'turn' scope.
//    The 'conversation' scope is proven at the check level in proofs-l1.test.ts) ─────────────────────
const maxCallsProof: GuardProof = {
  guard: 'maxCalls',
  make: () =>
    maxCalls('createItem', 2, 'You already created 2 items this turn — that is the limit; reply to the user instead of creating another.'),
  hook: 'preTool',
  target: ['createItem'],
  cases: [
    {
      name: 'turn scope: one prior call this turn stays under the limit',
      polarity: 'positive',
      ctx: {
        tool: 'createItem',
        args: { title: 'Beta' },
        observed: [{ name: 'createItem', args: { title: 'Alpha' }, ok: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'create two items' }],
        script: [
          [{ tool: 'searchItem', args: { query: 'items' } }],
          [{ tool: 'createItem', args: { title: 'Alpha' } }],
          [{ tool: 'createItem', args: { title: 'Beta' } }],
          [{ tool: 'respond', args: { message: 'Two items were created — Alpha and Beta.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'turn scope: two prior calls this turn hit the limit',
      polarity: 'negative',
      ctx: {
        tool: 'createItem',
        args: { title: 'Gamma' },
        observed: [
          { name: 'createItem', args: { title: 'Alpha' }, ok: true, turnIndex: 0 },
          { name: 'createItem', args: { title: 'Beta' }, ok: true, turnIndex: 0 },
        ],
        turnIndex: 0,
      },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'create three items' }],
        script: [
          [{ tool: 'searchItem', args: { query: 'items' } }],
          [{ tool: 'createItem', args: { title: 'Alpha' } }],
          [{ tool: 'createItem', args: { title: 'Beta' } }],
          [{ tool: 'createItem', args: { title: 'Gamma' } }],
          [{ tool: 'respond', args: { message: 'Two items were created — Alpha and Beta.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'createItem',
      },
    },
    {
      name: 'turn scope: two prior calls in an EARLIER turn do NOT count (the turnIndex filter)',
      polarity: 'neutral',
      ctx: {
        tool: 'createItem',
        args: { title: 'Gamma' },
        observed: [
          { name: 'createItem', args: { title: 'Alpha' }, ok: true, turnIndex: 0 },
          { name: 'createItem', args: { title: 'Beta' }, ok: true, turnIndex: 0 },
        ],
        turnIndex: 1,
      },
      l1: 'silent',
    },
  ],
};

// ── noDuplicateCall (auto:'minimal' — always installed by AgentSpecBase) ─────
const noDuplicateCallProof: GuardProof = {
  guard: 'noDuplicateCall',
  make: () => noDuplicateCall(),
  hook: 'preTool',
  target: 'any',
  auto: 'minimal',
  cases: [
    {
      name: 'a different title is not a duplicate',
      polarity: 'positive',
      ctx: {
        tool: 'createItem',
        args: { title: 'Beta' },
        observed: [{ name: 'createItem', args: { title: 'Alpha' }, ok: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'silent',
    },
    {
      name: 'repeating the exact same successful call this turn is denied',
      polarity: 'negative',
      ctx: {
        tool: 'createItem',
        args: { title: 'Alpha' },
        observed: [{ name: 'createItem', args: { title: 'Alpha' }, ok: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'create an item named Alpha' }],
        script: [
          [{ tool: 'searchItem', args: { query: 'items' } }],
          [{ tool: 'createItem', args: { title: 'Alpha' } }],
          [{ tool: 'createItem', args: { title: 'Alpha' } }],
          [{ tool: 'respond', args: { message: 'One item named Alpha was created.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'createItem',
      },
    },
    {
      name: 'the same call in an earlier turn is not a same-turn duplicate',
      polarity: 'neutral',
      ctx: {
        tool: 'createItem',
        args: { title: 'Alpha' },
        observed: [{ name: 'createItem', args: { title: 'Alpha' }, ok: true, turnIndex: 0 }],
        turnIndex: 1,
      },
      l1: 'silent',
    },
  ],
};

/**
 * A tool that is destructive on one branch and protective on another: moving an item to the bin is
 * reversible and asks nothing, while erasing it is the act the token licenses. The predicate reads the
 * acting call's own arguments and nothing else — a call with no `soft` flag is the erasing branch.
 */
const DELETE_IS_DESTRUCTIVE = { deleteItem: (args: Record<string, unknown>) => args.soft !== true };

// ── confirmFirst (auto:'base' — deleteItem simulations its record, purgeAll declares a label) ──
const confirmFirstProof: GuardProof = {
  guard: 'confirmFirst',
  // The licence is a token the ENGINE issued for a record and the USER typed back. Nothing the agent
  // emits is admitted, so the guard takes no options and reads only `ctx.consent`.
  make: () => confirmFirst({ when: DELETE_IS_DESTRUCTIVE }),
  hook: 'preTool',
  target: ['deleteItem'],
  auto: 'base',
  specTweaks: {
    destructiveTools: ['deleteItem', 'purgeAll'],
    confirmMechanism: { purgeAll: 'prior-ask' },
    // purgeAll acts on no identifiable record, so its question is built from this label.
    destructiveLabels: { purgeAll: 'delete every item' },
    destructiveWhen: DELETE_IS_DESTRUCTIVE,
  },
  cases: [
    {
      name: 'acting with no consent is denied',
      polarity: 'negative',
      ctx: { tool: 'deleteItem', args: { id: 'itm-1', confirmed: true }, consent: [], turnIndex: 1 },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1' }],
        script: [
          [{ tool: 'deleteItem', args: { id: 'itm-1', confirmed: true } }],
          [{ tool: 'respond', args: { message: 'That deletion still needs your confirmation.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'deleteItem',
      },
    },
    {
      name: 'the token the user typed for THIS record unlocks execution',
      polarity: 'positive',
      ctx: {
        tool: 'deleteItem',
        args: { id: 'itm-1', confirmed: true },
        consent: [{ tool: 'deleteItem', subject: 'itm-1', meaning: 'itm-1', token: 'CONFIRM ITM-1', issuedTurn: 0, consumedTurn: 1 }],
        turnIndex: 1,
      },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1' }, { userText: 'CONFIRM itm-1' }],
        script: [
          [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
          [{ tool: 'respond', args: { message: 'That one needs your confirmation.', did: [{ op: 'cancel', target: 'itm-1', outcome: 'pending_confirmation' }] } }],
          [{ tool: 'deleteItem', args: { id: 'itm-1', confirmed: true } }],
          [{ tool: 'respond', args: { message: 'The item was deleted as requested.', did: [{ op: 'cancel', target: 'itm-1', outcome: 'success' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'a consent for another record does not unlock this one',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        args: { id: 'itm-2', confirmed: true },
        consent: [{ tool: 'deleteItem', subject: 'itm-1', meaning: 'itm-1', token: 'CONFIRM ITM-1', issuedTurn: 0, consumedTurn: 1 }],
        turnIndex: 1,
      },
      l1: 'fires',
    },
    {
      name: 'a prior-turn reply that merely asks a question unlocks nothing',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        args: { id: 'itm-1', confirmed: true },
        consent: [],
        history: [
          { turnIndex: 0, userText: 'delete itm-1', reply: 'Delete item itm-1 — are you sure?', toolCalls: [], did: [{ op: 'ask' }], attemptedCalls: [], guardEvents: [] },
        ],
        turnIndex: 1,
      },
      l1: 'fires',
    },
    {
      name: 'the tool\'s own earlier successful run unlocks nothing',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        args: { id: 'itm-1', confirmed: true },
        consent: [],
        observed: [{ name: 'deleteItem', args: { id: 'itm-1', confirmed: true }, ok: true, turnIndex: 0, tookEffect: true }],
        turnIndex: 1,
      },
      l1: 'fires',
    },
    {
      // The SIMULATION is how the world raises the question, so it runs freely; only the acting call is gated.
      name: 'the simulation call is never gated — it is how the question gets asked',
      polarity: 'neutral',
      ctx: { tool: 'deleteItem', args: { id: 'itm-1' }, consent: [], turnIndex: 1 },
      l1: 'silent',
    },
    {
      // The protective branch of a listed tool is an act the world carries out with no question raised.
      // Gating it would deny a call no consent could ever license.
      name: 'the protective branch of a predicated tool runs with no consent at all',
      polarity: 'positive',
      ctx: { tool: 'deleteItem', args: { id: 'itm-1', soft: true, confirmed: true }, consent: [], turnIndex: 1 },
      l1: 'silent',
    },
    {
      name: 'the destructive branch of the same tool is gated exactly as an unconditional one',
      polarity: 'negative',
      ctx: { tool: 'deleteItem', args: { id: 'itm-1', soft: false, confirmed: true }, consent: [], turnIndex: 1 },
      l1: 'fires',
    },
    {
      name: 'a recordless act: running it with no consent is denied',
      polarity: 'negative',
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'purge everything' }],
        script: [
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'respond', args: { message: 'Purging everything needs your confirmation first.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'purgeAll',
      },
    },
    {
      name: 'a recordless act: the label token the user typed unlocks execution',
      polarity: 'positive',
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'purge everything' }, { userText: 'CONFIRM DELETE-EVERY' }],
        script: [
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'respond', args: { message: 'That needs your confirmation.', did: [{ op: 'inform' }] } }],
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'respond', args: { message: 'Every item was purged.', did: [{ op: 'purge', outcome: 'success' }] } }],
        ],
        expect: 'pass',
      },
    },
  ],
};

// ── destructiveThrottle (auto:'base' — at most one destructive success per turn) ──
const destructiveThrottleProof: GuardProof = {
  guard: 'destructiveThrottle',
  make: () => destructiveThrottle(['deleteItem', 'purgeAll'], { flagless: ['purgeAll'], when: DELETE_IS_DESTRUCTIVE }),
  hook: 'preTool',
  target: ['deleteItem', 'purgeAll'],
  auto: 'base',
  specTweaks: {
    destructiveTools: ['deleteItem', 'purgeAll'],
    confirmMechanism: { purgeAll: 'prior-ask' },
    destructiveLabels: { purgeAll: 'delete every item' },
    destructiveWhen: DELETE_IS_DESTRUCTIVE,
  },
  cases: [
    {
      name: 'a single destructive success this turn is allowed',
      polarity: 'positive',
      ctx: {
        tool: 'purgeAll',
        observed: [{ name: 'deleteItem', args: { id: 'itm-1', confirmed: true }, ok: true, turnIndex: 0 }],
        turnIndex: 1,
      },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'purge everything' }, { userText: 'CONFIRM DELETE-EVERY' }],
        script: [
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'respond', args: { message: 'That one needs your confirmation.', did: [{ op: 'inform' }] } }],
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'respond', args: { message: 'Every item is gone now, as agreed.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'a second destructive call the same turn is throttled',
      polarity: 'negative',
      ctx: {
        tool: 'purgeAll',
        observed: [{ name: 'deleteItem', args: { id: 'itm-1', confirmed: true }, ok: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1 and purge everything' }, { userText: 'CONFIRM itm-1 and CONFIRM DELETE-EVERY' }],
        script: [
          [{ tool: 'deleteItem', args: { id: 'itm-1' } }, { tool: 'purgeAll', args: {} }],
          [{ tool: 'respond', args: { message: 'Both of those need your confirmation.', did: [{ op: 'inform' }] } }],
          [{ tool: 'deleteItem', args: { id: 'itm-1', confirmed: true } }],
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'respond', args: { message: 'Item itm-1 was deleted; the purge can run next turn.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'purgeAll',
        turn: 1,
      },
    },
    {
      // The cap is measured in DESTRUCTIVE acts: a protective call neither consumes the turn's single
      // act nor is stopped by one, so three reversible deletions in a turn are three legitimate calls.
      name: 'a protective call is neither capped by nor counted against the turn',
      polarity: 'positive',
      ctx: {
        tool: 'deleteItem',
        args: { id: 'itm-2', soft: true, confirmed: true },
        observed: [{ name: 'deleteItem', args: { id: 'itm-1', soft: true, confirmed: true }, ok: true, tookEffect: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'silent',
    },
    {
      name: 'a destructive call is still capped by a prior destructive act in the same turn',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        args: { id: 'itm-2', confirmed: true },
        observed: [{ name: 'deleteItem', args: { id: 'itm-1', confirmed: true }, ok: true, tookEffect: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'fires',
    },
    {
      name: 'the guard ignores tools outside its list',
      polarity: 'neutral',
      ctx: {
        tool: 'searchItem',
        observed: [{ name: 'deleteItem', args: { id: 'itm-1', confirmed: true }, ok: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'silent',
    },
  ],
};

// ── resultInvariant (postTool — reportStatus must show a non-zero count) ─────
const resultInvariantProof: GuardProof = {
  guard: 'resultInvariant',
  make: () =>
    resultInvariant(
      (r) => ((r as any).count ?? 0) > 0,
      'The status shows no items — report the discrepancy instead of a routine summary.',
    ),
  hook: 'postTool',
  target: ['reportStatus'],
  cases: [
    {
      name: 'a non-zero count satisfies the invariant',
      polarity: 'positive',
      ctx: { result: { success: true, status: 'ok', count: 2 } },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'check the status' }],
        script: [
          [{ tool: 'searchItem', args: { query: 'items' } }],
          [{ tool: 'createItem', args: { title: 'Alpha' } }],
          [{ tool: 'reportStatus', args: {} }],
          [{ tool: 'respond', args: { message: 'There is 1 item, and the status is normal.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'a zero count violates the invariant',
      polarity: 'negative',
      ctx: { result: { success: true, status: 'ok', count: 0 } },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'check the status' }],
        script: [
          [{ tool: 'reportStatus', args: {} }],
          [{ tool: 'respond', args: { message: 'The status was checked.', did: [{ op: 'inform' }] } }],
          [{ text: 'The status was checked — there are no items yet, which does not match expectations.' }],
        ],
        expect: 'redrive',
        tool: 'reportStatus',
      },
    },
    {
      name: 'no result yet leaves the invariant silent',
      polarity: 'neutral',
      ctx: { result: undefined },
      l1: 'silent',
    },
  ],
};

// ── custom (listItems — the agent-ruleset escape hatch: page must stay ≤ 3) ──
const customProof: GuardProof = {
  guard: 'custom',
  make: () =>
    custom({
      kind: 'custom',
      dim: 'run',
      check: (ctx) =>
        ((ctx.args.page as number | undefined) ?? 1) <= 3 ? null : 'Page is out of range — list only the first three pages.',
      prose: () => 'list only the first three pages',
    }),
  hook: 'preTool',
  target: ['listItems'],
  cases: [
    {
      name: 'a page within range is allowed',
      polarity: 'positive',
      ctx: { tool: 'listItems', args: { page: 2 } },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'list page 2 of items' }],
        script: [
          [{ tool: 'listItems', args: { page: 2 } }],
          [{ tool: 'respond', args: { message: 'Here are the items on page 2.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'a page past the third is denied',
      polarity: 'negative',
      ctx: { tool: 'listItems', args: { page: 5 } },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'list page 5 of items' }],
        script: [
          [{ tool: 'listItems', args: { page: 5 } }],
          [{ tool: 'respond', args: { message: 'Only the first three pages are available — try a page within that range.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'listItems',
      },
    },
    {
      name: 'an absent page defaults to page 1, within range',
      polarity: 'neutral',
      ctx: { tool: 'listItems', args: {} },
      l1: 'silent',
    },
  ],
};

// ── valueFromUser (structural — a value recorded only after an earlier-turn ask) ──────────────
// Gated arg = the NON-schema `condition` on createItem (survives via the tool schema's passthrough): only
// the scripts here carry it, so the guard stays inert on every other collective createItem scenario. The
// L3 scripts call searchItem first (the collective installs requiresBefore(['searchItem']) on createItem)
// and always pass `title` (argRequired) so the ONLY signal under test is valueFromUser itself.
const valueFromUserProof: GuardProof = {
  guard: 'valueFromUser',
  make: () => valueFromUser({ arg: 'condition' }),
  hook: 'preTool',
  target: ['createItem'],
  cases: [
    {
      name: 'the gated value is one the user said, on an earlier turn',
      polarity: 'positive',
      ctx: {
        args: { condition: 'good' },
        history: [{ turnIndex: 1, userText: 'the condition is good', reply: 'Noted.', toolCalls: [], did: [{ op: 'inform' }], attemptedCalls: [], guardEvents: [] }],
        turnIndex: 2,
      },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'add an item, but ask me its condition first' }, { userText: 'the condition is good' }],
        script: [
          [{ tool: 'searchItem', args: { query: 'items' } }],
          [{ tool: 'respond', args: { message: 'What condition is the item in?', did: [{ op: 'ask' }] } }],
          [{ tool: 'createItem', args: { title: 'Alpha', condition: 'good' } }],
          [{ tool: 'respond', args: { message: 'Item Alpha has been created with the condition you provided.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'the gated value is one the user never said',
      polarity: 'negative',
      ctx: { args: { condition: 'good' }, userText: 'add item Alpha', observed: [], turnIndex: 2 },
      l1: 'fires',
      l3: {
        preset: 'empty',
        // The user never says what condition the item is in, so the agent supplying one is the defect.
        turns: [{ userText: 'add item Alpha' }],
        script: [
          [{ tool: 'searchItem', args: { query: 'items' } }],
          [{ tool: 'createItem', args: { title: 'Alpha', condition: 'good' } }],
          [{ tool: 'respond', args: { message: 'I need the item’s condition confirmed before I record it — what condition is it in?', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'createItem',
      },
    },
    {
      name: "the gated value is absent — not this guard's business",
      polarity: 'neutral',
      ctx: { args: {}, observed: [], turnIndex: 2 },
      l1: 'silent',
    },
  ],
};

export const RUN_OUTPUT_PROOFS: GuardProof[] = [
  preconditionProof,
  maxCallsProof,
  noDuplicateCallProof,
  confirmFirstProof,
  destructiveThrottleProof,
  resultInvariantProof,
  customProof,
  valueFromUserProof,
];
