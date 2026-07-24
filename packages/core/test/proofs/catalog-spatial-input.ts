/** Guard proofs — SPATIAL + INPUT dims (see catalog.ts for the collective ruleset + script conventions). */
import { argAbsent, argFormat, argRequired, forbidThisTurn, requiresBefore } from '../../src/guards.js';
import { type GuardProof } from '../../src/testing/index.js';

const turn = (userText: string) => ({ userText });

export const SPATIAL_INPUT_PROOFS: GuardProof[] = [
  // ── requiresBefore (spatial) — createItem needs searchItem to have run first ─────────────────────────
  {
    guard: 'requiresBefore',
    make: () => requiresBefore(['searchItem']),
    hook: 'preTool',
    target: ['createItem'],
    cases: [
      {
        name: 'searchItem already ran this conversation',
        polarity: 'positive',
        ctx: { observed: [{ name: 'searchItem', args: { query: 'widget' }, ok: true, turnIndex: 0 }] },
        l1: 'silent',
        l3: {
          preset: 'seeded-media',
          turns: [turn('add a new item')],
          script: [
            [{ tool: 'searchItem', args: { query: 'widget' } }],
            [{ tool: 'createItem', args: { title: 'Item One' } }],
            [{ tool: 'replyToUser', args: { text: 'The item was created.' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'no searchItem has ever run',
        polarity: 'negative',
        ctx: { observed: [] },
        l1: 'fires',
        l3: {
          preset: 'seeded-media',
          turns: [turn('add a new item')],
          script: [
            [{ tool: 'createItem', args: { title: 'A' } }],
            [{ tool: 'replyToUser', args: { text: 'The item request was noted.' } }],
          ],
          expect: 'veto',
          tool: 'createItem',
        },
      },
      {
        name: 'searchItem satisfied in an EARLIER turn (cross-turn, not same-turn)',
        polarity: 'neutral',
        ctx: { observed: [{ name: 'searchItem', args: { query: 'widget' }, ok: true, turnIndex: 0 }], turnIndex: 2 },
        l1: 'silent',
      },
    ],
  },

  // ── forbidThisTurn (spatial) — updateItem is disabled outright ──────────────────────────────────────
  // NOTE (conflict, reported per task instructions): forbidThisTurn.check ignores ctx entirely
  // (`check: () => reason`) and unconditionally fires — there is NO ctx that can honestly produce
  // l1:'silent'. The 'positive' case below is therefore l3-only (no ctx craft to fabricate a fake silent
  // verdict); the ratchet's "has both L1 verdict classes" check will stay red for this one kind until the
  // orchestrator adjusts it for always-fire guards (per the task brief).
  {
    guard: 'forbidThisTurn',
    make: () => forbidThisTurn('updateItem is disabled this turn — use createItem or ask the user for the change instead.'),
    hook: 'preTool',
    target: ['updateItem'],
    cases: [
      {
        name: 'the model never attempts updateItem (uses createItem instead)',
        polarity: 'positive',
        l1: 'fires', // honest: check() always fires if invoked — this case simply never invokes it.
        l3: {
          preset: 'seeded-media',
          turns: [turn('add a new item')],
          script: [
            [{ tool: 'searchItem', args: { query: 'widget' } }],
            [{ tool: 'createItem', args: { title: 'Item One' } }],
            [{ tool: 'replyToUser', args: { text: 'The item was created.' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'the model attempts updateItem',
        polarity: 'negative',
        ctx: { tool: 'updateItem', args: { id: 'itm-001', title: 'Updated title' } },
        l1: 'fires',
        l3: {
          preset: 'seeded-media',
          turns: [turn('change the item')],
          script: [
            [{ tool: 'updateItem', args: { id: 'itm-001', title: 'Updated title' } }],
            [{ tool: 'replyToUser', args: { text: 'The update request was noted.' } }],
          ],
          expect: 'veto',
          tool: 'updateItem',
        },
      },
      {
        name: 'check() ignores ctx entirely — any crafted ctx still fires',
        polarity: 'neutral',
        ctx: { tool: 'updateItem', args: {} },
        l1: 'fires',
      },
    ],
  },

  // ── argRequired (input) — createItem needs a "title" ─────────────────────────────────────────────────
  {
    guard: 'argRequired',
    make: () => argRequired('title'),
    hook: 'preTool',
    target: ['createItem'],
    cases: [
      {
        name: 'title is present',
        polarity: 'positive',
        ctx: { args: { title: 'Widget' } },
        l1: 'silent',
        l3: {
          preset: 'seeded-media',
          turns: [turn('add a new item')],
          script: [
            [{ tool: 'searchItem', args: { query: 'widget' } }],
            [{ tool: 'createItem', args: { title: 'Item One' } }],
            [{ tool: 'replyToUser', args: { text: 'The item was created.' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'title is missing',
        polarity: 'negative',
        ctx: { args: {} },
        l1: 'fires',
        l3: {
          preset: 'seeded-media',
          turns: [turn('add a new item')],
          script: [
            [{ tool: 'searchItem', args: { query: 'widget' } }],
            [{ tool: 'createItem', args: {} }],
            [{ tool: 'replyToUser', args: { text: 'The item request was noted.' } }],
          ],
          expect: 'veto',
          tool: 'createItem',
        },
      },
      {
        name: 'an irrelevant extra arg beside a present title',
        polarity: 'neutral',
        ctx: { args: { title: 'Gizmo', notes: 'internal' } },
        l1: 'silent',
      },
    ],
  },

  // ── argAbsent (input) — deleteItem may never carry "force" ───────────────────────────────────────────
  {
    guard: 'argAbsent',
    make: () => argAbsent('force'),
    hook: 'preTool',
    target: ['deleteItem'],
    cases: [
      {
        name: 'no force arg on the probe',
        polarity: 'positive',
        ctx: { args: { id: 'p001' } },
        l1: 'silent',
        l3: {
          preset: 'seeded-media',
          turns: [turn('delete the item')],
          script: [
            [{ tool: 'deleteItem', args: { id: 'p001' } }],
            [{ tool: 'replyToUser', args: { text: 'Are you sure you want to delete this item?' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'force:true is passed',
        polarity: 'negative',
        ctx: { args: { id: 'p001', force: true } },
        l1: 'fires',
        l3: {
          preset: 'seeded-media',
          turns: [turn('delete the item')],
          script: [
            [{ tool: 'deleteItem', args: { id: 'p001', force: true } }],
            [{ tool: 'replyToUser', args: { text: 'The item request was noted.' } }],
          ],
          expect: 'veto',
          tool: 'deleteItem',
        },
      },
      {
        name: 'force:null is present but not a real value',
        polarity: 'neutral',
        ctx: { args: { id: 'p001', force: null } },
        l1: 'silent',
      },
    ],
  },

  // ── argFormat (input) — setPrimary id must match ^itm-\d+$ ───────────────────────────────────────────
  {
    guard: 'argFormat',
    make: () => argFormat('id', '^itm-\\d+$'),
    hook: 'preTool',
    target: ['setPrimary'],
    cases: [
      {
        name: 'id matches the pattern',
        polarity: 'positive',
        ctx: { args: { id: 'itm-42' } },
        l1: 'silent',
        l3: {
          preset: 'seeded-media',
          turns: [turn('make it the primary item')],
          script: [
            [{ tool: 'setPrimary', args: { id: 'itm-7' } }],
            [{ tool: 'replyToUser', args: { text: 'The item was set as primary.' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'id is malformed',
        polarity: 'negative',
        ctx: { args: { id: 'p001' } },
        l1: 'fires',
        l3: {
          preset: 'seeded-media',
          turns: [turn('make it the primary item')],
          script: [
            [{ tool: 'setPrimary', args: { id: 'p001' } }],
            [{ tool: 'replyToUser', args: { text: 'The primary item request was noted.' } }],
          ],
          expect: 'veto',
          tool: 'setPrimary',
        },
      },
      {
        name: 'id is absent — left to argRequired, not this guard',
        polarity: 'neutral',
        ctx: { args: {} },
        l1: 'silent',
      },
    ],
  },
];
