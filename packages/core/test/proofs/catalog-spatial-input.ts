/** Guard proofs — SPATIAL + INPUT dims (see catalog.ts for the collective ruleset + script conventions). */
import { argAbsent, argFormat, argRequired, forbidThisTurn, labelExists, labelProvenance, requiresBefore } from '../../src/guards.js';
import { FIXTURE_LABEL_SCHEME, FixtureWorld, type GuardProof } from '../../src/testing/index.js';

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
  // NOTE: forbidThisTurn.check ignores ctx entirely (`check: () => reason`) and unconditionally fires —
  // there is NO ctx that can honestly produce l1:'silent'. The 'positive' case below is therefore
  // l3-only (no ctx craft to fabricate a fake silent verdict); the ratchet treats always-fire kinds
  // specially (ctx-independence via ≥2 fires cases + an L3 pass case proving target scoping).
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

  // ── labelExists (input) — useMedia label must be a real Recent Media label ───────────────────────────
  {
    guard: 'labelExists',
    make: () => labelExists('label'),
    hook: 'preTool',
    target: ['useMedia'],
    cases: [
      {
        name: 'label is a seeded generated label',
        polarity: 'positive',
        ctx: { args: { label: 'g001' } },
        l1: 'silent',
        l3: {
          preset: 'seeded-media',
          turns: [turn('use that image')],
          script: [
            [{ tool: 'useMedia', args: { label: 'g001' } }],
            [{ tool: 'replyToUser', args: { text: 'The media was attached.' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'label does not exist in Recent Media',
        polarity: 'negative',
        ctx: { args: { label: 'g999' } },
        l1: 'fires',
        l3: {
          preset: 'seeded-media',
          turns: [turn('use that image')],
          script: [
            [{ tool: 'useMedia', args: { label: 'g999' } }],
            [{ tool: 'replyToUser', args: { text: 'The media request was noted.' } }],
          ],
          expect: 'veto',
          tool: 'useMedia',
        },
      },
      {
        name: 'label given in object form ({label: "..."}) still resolves to a seeded upload',
        polarity: 'neutral',
        ctx: { args: { label: { label: 'u900' } } },
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

  // ── labelProvenance (input) — editMedia label must be GENERATED, never an uploaded label ────────────
  {
    guard: 'labelProvenance',
    make: () => labelProvenance('label', 'generated', { uploadRe: FIXTURE_LABEL_SCHEME.uploadRe, labelNoun: FIXTURE_LABEL_SCHEME.labelNoun }),
    hook: 'preTool',
    target: ['editMedia'],
    cases: [
      {
        name: 'label is a generated label',
        polarity: 'positive',
        ctx: { args: { label: 'g001' } },
        l1: 'silent',
        l3: {
          preset: 'seeded-media',
          turns: [turn('edit that image')],
          script: [
            [{ tool: 'editMedia', args: { label: 'g001', instruction: 'Add a border.' } }],
            [{ tool: 'replyToUser', args: { text: 'The media was edited.' } }],
          ],
          expect: 'pass',
        },
      },
      {
        name: 'label is an uploaded label, not generated',
        polarity: 'negative',
        ctx: { args: { label: 'u900' } },
        l1: 'fires',
        l3: {
          preset: 'seeded-media',
          turns: [turn('edit that image')],
          script: [
            [{ tool: 'editMedia', args: { label: 'u900', instruction: 'Brighten it slightly.' } }],
            [{ tool: 'replyToUser', args: { text: 'The media edit request was noted.' } }],
          ],
          expect: 'veto',
          tool: 'editMedia',
        },
      },
      {
        name: 'label given in object form ({label: "..."}) still resolves to a generated label',
        polarity: 'neutral',
        ctx: { args: { label: { label: 'g005' } } },
        l1: 'silent',
      },
    ],
  },
];
