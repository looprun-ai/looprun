/** Guard proofs — RUN + OUTPUT dims + custom (see catalog.ts for the collective ruleset + conventions). */
import {
  confirmFirst,
  custom,
  destructiveThrottle,
  maxCalls,
  noActAfterAskSameTurn,
  noDuplicateCall,
  precondition,
  resultInvariant,
} from '../../src/guards.js';
import { FIXTURE_LEXICON, FixtureWorld } from '../../src/testing/index.js';
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
          [{ tool: 'replyToUser', args: { text: 'A new media asset was generated.' } }],
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
          [{ tool: 'replyToUser', args: { text: 'The media quota is exhausted, so a new asset was not generated right now.' } }],
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
          [{ tool: 'replyToUser', args: { text: 'Two items were created — Alpha and Beta.' } }],
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
          [{ tool: 'replyToUser', args: { text: 'Two items were created — Alpha and Beta.' } }],
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
          [{ tool: 'replyToUser', args: { text: 'One item named Alpha was created.' } }],
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

// ── confirmFirst (auto:'base' — arg mechanism on deleteItem, prior-ask on purgeAll) ──
const confirmFirstProof: GuardProof = {
  guard: 'confirmFirst',
  make: () => confirmFirst(),
  hook: 'preTool',
  target: ['deleteItem'],
  auto: 'base',
  specTweaks: {
    destructiveTools: ['deleteItem', 'purgeAll'],
    confirmMechanism: { purgeAll: 'prior-ask' },
    lexicon: { confirmAskRe: FIXTURE_LEXICON.confirmAskRe },
  },
  cases: [
    {
      name: 'arg mechanism: confirming without an earlier probe is denied',
      polarity: 'negative',
      ctx: { tool: 'deleteItem', args: { confirmed: true }, observed: [], turnIndex: 1 },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1' }],
        script: [
          [{ tool: 'deleteItem', args: { id: 'itm-1', confirmed: true } }],
          [{ tool: 'replyToUser', args: { text: 'That deletion still needs your confirmation — are you sure?' } }],
        ],
        expect: 'veto',
        tool: 'deleteItem',
      },
    },
    {
      name: 'arg mechanism: an earlier-turn probe unlocks confirmed execution',
      polarity: 'positive',
      ctx: {
        tool: 'deleteItem',
        args: { confirmed: true },
        observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0 }],
        turnIndex: 1,
      },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1' }, { userText: 'yes, I confirm' }],
        script: [
          [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
          [{ tool: 'replyToUser', args: { text: 'Delete item itm-1 — are you sure?' } }],
          [{ tool: 'deleteItem', args: { id: 'itm-1', confirmed: true } }],
          [{ tool: 'replyToUser', args: { text: 'The item was deleted as requested.' } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'prior-ask mechanism: acting with no earlier ask is denied',
      polarity: 'negative',
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'purge everything' }],
        script: [
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'replyToUser', args: { text: 'Purging everything needs your confirmation first — are you sure?' } }],
        ],
        expect: 'veto',
        tool: 'purgeAll',
      },
    },
    {
      name: 'prior-ask mechanism: an earlier-turn askUser unlocks execution',
      polarity: 'positive',
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'purge everything' }, { userText: 'yes' }],
        script: [
          [{ tool: 'askUser', args: { text: 'This will purge every item — are you sure?' } }],
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'replyToUser', args: { text: 'Every item is gone now, as you confirmed.' } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'a non-destructive tool call is never gated',
      polarity: 'neutral',
      ctx: { tool: 'searchItem', args: {}, observed: [], turnIndex: 0 },
      l1: 'silent',
    },
  ],
};

// ── noActAfterAskSameTurn (deleteItem, purgeAll — never same turn as the ask) ──
const noActAfterAskSameTurnProof: GuardProof = {
  guard: 'noActAfterAskSameTurn',
  make: () => noActAfterAskSameTurn(['deleteItem', 'purgeAll']),
  hook: 'preTool',
  target: ['deleteItem', 'purgeAll'],
  cases: [
    {
      // MEASURED FINDING (2026-07-15, this proof suite's first catch): the deny path CANNOT be
      // scripted at L3 — a same-turn ask→act sequence only exists inside ONE multi-tool step
      // (askUser is a terminal, so the generation stops at that step), and the Mastra backend
      // dispatches a step's tool calls CONCURRENTLY: the destructive call's preTool check can run
      // BEFORE the askUser lands in the observed ledger (probe: deleteItem executed un-vetoed with
      // the ask recorded only afterwards). The guard's deny logic is therefore proven at L1 (pure,
      // deterministic); the concurrent-dispatch ordering gap is a runtime hardening follow-up, not
      // a guard defect.
      // HISTORY (2026-07-15, this proof suite's first catch): a step's tool calls are dispatched
      // CONCURRENTLY, so the destructive call's preTool check used to run BEFORE the same-step
      // askUser landed in the observed ledger — this deny was unreachable at L3. FIXED same day:
      // the runtime records terminal calls in the guard hook's SYNCHRONOUS segment (emission
      // order), so the sibling check sees the ask. The L3 deny below is the regression proof.
      name: 'asking then acting in the very same turn is denied',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        observed: [{ name: 'askUser', args: { text: 'x' }, ok: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1' }],
        script: [
          [
            { tool: 'askUser', args: { text: 'Delete item itm-1 — are you sure?' } },
            { tool: 'deleteItem', args: { id: 'itm-1' } },
          ],
        ],
        expect: 'veto',
        tool: 'deleteItem',
      },
    },
    {
      name: 'asking in one turn and acting in a later turn is allowed',
      polarity: 'positive',
      ctx: {
        tool: 'deleteItem',
        observed: [{ name: 'askUser', args: { text: 'x' }, ok: true, turnIndex: 0 }],
        turnIndex: 1,
      },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1' }, { userText: 'yes' }],
        script: [
          [{ tool: 'askUser', args: { text: 'Delete item itm-1 — are you sure?' } }],
          [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
          [{ tool: 'replyToUser', args: { text: 'The item still requires your confirmation before removal — are you sure?' } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'the guard ignores tools outside its list',
      polarity: 'neutral',
      ctx: {
        tool: 'searchItem',
        observed: [{ name: 'askUser', args: { text: 'x' }, ok: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'silent',
    },
  ],
};

// ── destructiveThrottle (auto:'base' — at most one destructive success per turn) ──
const destructiveThrottleProof: GuardProof = {
  guard: 'destructiveThrottle',
  make: () => destructiveThrottle(['deleteItem', 'purgeAll']),
  hook: 'preTool',
  target: ['deleteItem', 'purgeAll'],
  auto: 'base',
  specTweaks: {
    destructiveTools: ['deleteItem', 'purgeAll'],
    confirmMechanism: { purgeAll: 'prior-ask' },
    lexicon: { confirmAskRe: FIXTURE_LEXICON.confirmAskRe },
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
        turns: [{ userText: 'purge everything' }, { userText: 'yes' }],
        script: [
          [{ tool: 'askUser', args: { text: 'This will purge every item — are you sure?' } }],
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'replyToUser', args: { text: 'Every item is gone now, as agreed.' } }],
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
        turns: [{ userText: 'delete item itm-1 and purge everything' }, { userText: 'yes' }],
        script: [
          [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
          [{ tool: 'askUser', args: { text: 'Delete itm-1 and purge everything — are you sure?' } }],
          [{ tool: 'deleteItem', args: { id: 'itm-1', confirmed: true } }],
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'replyToUser', args: { text: 'Item itm-1 was deleted; the purge can run next turn.' } }],
        ],
        expect: 'veto',
        tool: 'purgeAll',
        turn: 1,
      },
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
          [{ tool: 'replyToUser', args: { text: 'There is 1 item, and the status is normal.' } }],
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
          [{ tool: 'replyToUser', args: { text: 'The status was checked.' } }],
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
          [{ tool: 'replyToUser', args: { text: 'Here are the items on page 2.' } }],
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
          [{ tool: 'replyToUser', args: { text: 'Only the first three pages are available — try a page within that range.' } }],
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

export const RUN_OUTPUT_PROOFS: GuardProof[] = [
  preconditionProof,
  maxCallsProof,
  noDuplicateCallProof,
  confirmFirstProof,
  noActAfterAskSameTurnProof,
  destructiveThrottleProof,
  resultInvariantProof,
  customProof,
];
