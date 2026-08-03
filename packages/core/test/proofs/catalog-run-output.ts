/** Guard proofs — RUN + OUTPUT dims + custom (see catalog.ts for the collective ruleset + conventions). */
import {
  askedEarlier,
  confirmFirst,
  custom,
  destructiveThrottle,
  maxCalls,
  noActAfterAskSameTurn,
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

// ── confirmFirst (auto:'base' — via:'either' on deleteItem, via:'ask' on flag-less purgeAll) ──
const confirmFirstProof: GuardProof = {
  guard: 'confirmFirst',
  // STRUCTURAL (no-regex law): via:'either' accepts a matching prior-turn same-tool probe (record-bound)
  // or a prior-turn ask as the go-ahead — no reply-text regex. Recency-bounded (default within:1).
  make: () => confirmFirst(),
  hook: 'preTool',
  target: ['deleteItem'],
  auto: 'base',
  specTweaks: {
    destructiveTools: ['deleteItem', 'purgeAll'],
    confirmMechanism: { purgeAll: 'prior-ask' },
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
          [{ tool: 'respond', args: { message: 'That deletion still needs your confirmation — are you sure?', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'deleteItem',
      },
    },
    {
      name: 'via:either — a matching earlier-turn probe (same RECORD) unlocks confirmed execution',
      polarity: 'positive',
      ctx: {
        tool: 'deleteItem',
        args: { id: 'itm-1', confirmed: true },
        observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0 }],
        turnIndex: 1,
      },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1' }, { userText: 'yes, I confirm' }],
        script: [
          [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
          [{ tool: 'respond', args: { message: 'Delete item itm-1 — are you sure?', did: [{ op: 'ask' }] } }],
          [{ tool: 'deleteItem', args: { id: 'itm-1', confirmed: true } }],
          [{ tool: 'respond', args: { message: 'The item was deleted as requested.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      // no-regex law: a prior-turn PROSE confirmation-ask no longer unlocks (that text judgment is
      // retired); the go-ahead must be a structural same-tool probe or an ask intention. A
      // respond WITHOUT asked is just prose, so this now DENIES.
      name: 'arg mechanism: a prior-turn prose confirmation-ask does NOT unlock (structural only)',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        args: { confirmed: true },
        observed: [
          { name: 'respond', args: { message: 'Deleting item itm-1 is permanent — are you sure?', did: [{ op: 'inform' }] }, ok: true, turnIndex: 0 },
        ],
        turnIndex: 1,
      },
      l1: 'fires',
    },
    {
      name: 'arg mechanism: a prior-turn ask intention counts as the probe',
      polarity: 'positive',
      ctx: {
        tool: 'deleteItem',
        args: { confirmed: true },
        observed: [
          { name: 'respond', args: { message: 'Delete item itm-1 — are you sure?', did: [{ op: 'ask' }] }, ok: true, turnIndex: 0 },
        ],
        turnIndex: 1,
      },
      l1: 'silent',
    },
    {
      name: 'arg mechanism (P9): a SAME-turn ask does not unlock — the one-shot stays vetoed',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        args: { confirmed: true },
        observed: [
          { name: 'respond', args: { message: 'Are you sure?', did: [{ op: 'ask' }] }, ok: true, turnIndex: 1 },
        ],
        turnIndex: 1,
      },
      l1: 'fires',
    },
    {
      name: 'arg mechanism (P9): a prior-turn reply that is NOT a confirmation-ask does not unlock',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        args: { confirmed: true },
        observed: [
          { name: 'respond', args: { message: 'Here is the item detail you asked for.', did: [{ op: 'inform' }] }, ok: true, turnIndex: 0 },
        ],
        turnIndex: 1,
      },
      l1: 'fires',
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
          [{ tool: 'respond', args: { message: 'Purging everything needs your confirmation first — are you sure?', did: [{ op: 'inform' }] } }],
        ],
        expect: 'veto',
        tool: 'purgeAll',
      },
    },
    {
      name: 'prior-ask mechanism: an earlier-turn ask unlocks execution',
      polarity: 'positive',
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'purge everything' }, { userText: 'yes' }],
        script: [
          [{ tool: 'respond', args: { message: 'This will purge every item — are you sure?', did: [{ op: 'ask' }] } }],
          [{ tool: 'purgeAll', args: {} }],
          [{ tool: 'respond', args: { message: 'Every item is gone now, as you confirmed.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      // Absorbed from the deleted confirmedNeedsEarlierProbe: the probe is RECORD-bound (args-subset),
      // so a preview of a DIFFERENT record does not license this confirm.
      name: 'via:either (record-bound): an earlier probe of a DIFFERENT record does not unlock',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        args: { id: 'itm-2', confirmed: true },
        observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0 }],
        turnIndex: 1,
      },
      l1: 'fires',
    },
    {
      // RECENCY LAW (default within:1): a probe two turns back is stale and does not license today's confirm.
      name: 'recency: a probe at distance 2 does NOT unlock (default within:1)',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        args: { id: 'itm-1', confirmed: true },
        observed: [{ name: 'deleteItem', args: { id: 'itm-1' }, ok: true, turnIndex: 0 }],
        turnIndex: 2,
      },
      l1: 'fires',
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
      // The same-turn ask→act sequence only
      // exists inside ONE multi-tool step (the ask rides the terminal), and the AI SDK dispatches a
      // step's tool calls CONCURRENTLY (Promise.all) — the destructive call's preTool check used to
      // run BEFORE the ask landed in the observed ledger, so this deny was unreachable at L3.
      // FIXED same day: the runtime now records terminal calls in beforeToolCall's SYNCHRONOUS
      // segment (emission order), so the sibling check sees the ask. The L3 deny below is the
      // regression proof for that fix.
      name: 'asking then acting in the very same turn is denied',
      polarity: 'negative',
      ctx: {
        tool: 'deleteItem',
        observed: [{ name: 'respond', args: { message: 'x', did: [{ op: 'ask' }] }, ok: true, turnIndex: 0 }],
        turnIndex: 0,
      },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1' }],
        script: [
          [
            { tool: 'respond', args: { message: 'Delete item itm-1 — are you sure?', did: [{ op: 'ask' }] } },
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
        observed: [{ name: 'respond', args: { message: 'x', did: [{ op: 'ask' }] }, ok: true, turnIndex: 0 }],
        turnIndex: 1,
      },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'delete item itm-1' }, { userText: 'yes' }],
        script: [
          [{ tool: 'respond', args: { message: 'Delete item itm-1 — are you sure?', did: [{ op: 'ask' }] } }],
          [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
          [{ tool: 'respond', args: { message: 'The item still requires your confirmation before removal — are you sure?', did: [{ op: 'ask' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'the guard ignores tools outside its list',
      polarity: 'neutral',
      ctx: {
        tool: 'searchItem',
        observed: [{ name: 'respond', args: { message: 'x', did: [{ op: 'ask' }] }, ok: true, turnIndex: 0 }],
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
          [{ tool: 'respond', args: { message: 'This will purge every item — are you sure?', did: [{ op: 'ask' }] } }],
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
        turns: [{ userText: 'delete item itm-1 and purge everything' }, { userText: 'yes' }],
        script: [
          [{ tool: 'deleteItem', args: { id: 'itm-1' } }],
          [{ tool: 'respond', args: { message: 'Delete itm-1 and purge everything — are you sure?', did: [{ op: 'ask' }] } }],
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

// ── askedEarlier (structural — a value recorded only after an earlier-turn ask) ──────────────
// Gated arg = the NON-schema `condition` on createItem (survives via the tool schema's passthrough): only
// the scripts here carry it, so the guard stays inert on every other collective createItem scenario. The
// L3 scripts call searchItem first (the collective installs requiresBefore(['searchItem']) on createItem)
// and always pass `title` (argRequired) so the ONLY signal under test is askedEarlier itself.
const askedEarlierProof: GuardProof = {
  guard: 'askedEarlier',
  make: () => askedEarlier({ tool: 'createItem', arg: 'condition' }),
  hook: 'preTool',
  target: ['createItem'],
  cases: [
    {
      name: 'the gated value is present and an ask succeeded in an EARLIER turn (distance 1)',
      polarity: 'positive',
      ctx: {
        args: { condition: 'good' },
        observed: [{ name: 'respond', args: { message: 'q?', did: [{ op: 'ask' }] }, ok: true, turnIndex: 1 }],
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
      name: 'the gated value is present but no earlier-turn ask exists',
      polarity: 'negative',
      ctx: { args: { condition: 'good' }, observed: [], turnIndex: 2 },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'add item Alpha in good condition' }],
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

// NOTE (2026-08-02): the former `confirmedNeedsEarlierProbe` proof is GONE — the kind was absorbed into
// the unified `confirmFirst` (`via:'probe'`). Its distinctive scenarios (record-bound probe matching +
// the recency bound) live on as L1 cases inside `confirmFirstProof` above; none was dropped.

export const RUN_OUTPUT_PROOFS: GuardProof[] = [
  preconditionProof,
  maxCallsProof,
  noDuplicateCallProof,
  confirmFirstProof,
  noActAfterAskSameTurnProof,
  destructiveThrottleProof,
  resultInvariantProof,
  customProof,
  askedEarlierProof,
];
