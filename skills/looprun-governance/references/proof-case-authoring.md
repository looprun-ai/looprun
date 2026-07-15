# Authoring a GuardProof

A **GuardProof** is a small, deterministic description of one guard: how to install it, and the cases
that prove it. It runs at two levels — **L1** (the pure `check()` over a crafted `GuardCtx`) and **L3**
(the guard installed on a real governed turn driven by a scripted fake LLM) — plus a **collective**
level (the guard beside the full guard set). The types come from `@looprun-ai/core/testing` (fixture
world + proof types + spec builders) and `@looprun-ai/mastra/testing` (the scripted fake LLM + the loop
runner). The living catalog is `packages/core/test/proofs/catalog-*.ts` — read a few entries there
before authoring; they are the ground truth for these conventions.

## The type shape (the real one — see `packages/core/src/testing/proof.ts`)

```ts
import { argRequired } from '@looprun-ai/core';
import type { GuardProof } from '@looprun-ai/core/testing';

export const argRequiredProof: GuardProof = {
  guard: 'argRequired',          // the kind under proof — MUST equal the guards.ts export name (ratchet key)
  make: () => argRequired('title'), // install the exact instance the proof exercises
  hook: 'preTool',               // 'onInput' | 'preTool' | 'postTool' | 'onReply'
  target: ['createItem'],        // the tool(s) this instance is scoped to, or 'any'
  // auto?: 'minimal' | 'base'   — ONLY for constructor-auto-installed kinds (noDuplicateCall,
  //   degenerationGuard, emptyReply, noFalseFailureClaim, confirmFirst, destructiveThrottle): the spec
  //   builders then rely on the auto instance instead of addGuard. make() is still required.
  // specTweaks?: Partial<AgentSpecConfig> — extra spec config the auto layer needs, e.g.
  //   { destructiveTools: [...], confirmMechanism: {...}, lexicon: {...} }.
  // collective?: 'skip'         — ONLY for content-contract reply guards (replyMustMention,
  //   replySingleQuestion, replyConfirmsLabels, replyMaxOccurrences): they bind one agent's specific
  //   reply contract and would fire on every unrelated reply in the super-agent by construction.
  cases: [
    {
      name: 'title is present',
      polarity: 'positive',                          // the compliant path — the guard MUST allow
      ctx: { args: { title: 'Widget' } },            // L1: crafted Partial<GuardCtx>
      l1: 'silent',                                  // check(ctx) returns null
      l3: {                                          // optional full-loop case
        preset: 'seeded-media',                      // FixtureWorld preset
        turns: [{ userText: 'add a new item' }],
        script: [
          [{ tool: 'searchItem', args: { query: 'widget' } }],
          [{ tool: 'createItem', args: { title: 'Item One' } }],
          [{ tool: 'replyToUser', args: { text: 'The item was created.' } }],
        ],
        expect: 'pass',                              // zero recovery events
      },
    },
    {
      name: 'title is missing',
      polarity: 'negative',                          // the violation — the guard MUST catch it
      ctx: { args: {} },
      l1: 'fires',                                   // check(ctx) returns the correction string
      l3: {
        preset: 'seeded-media',
        turns: [{ userText: 'add a new item' }],
        script: [
          [{ tool: 'searchItem', args: { query: 'widget' } }],
          [{ tool: 'createItem', args: {} }],
          [{ tool: 'replyToUser', args: { text: 'The item request was noted.' } }],
        ],
        expect: 'veto',                              // 'veto' | 'redrive' | 'refusal' | 'pass'
        tool: 'createItem',                          // the tool named in the veto tag
      },
    },
    {
      name: 'an irrelevant extra arg beside a present title',
      polarity: 'neutral',                           // the look-alike — must be left alone
      ctx: { args: { title: 'Gizmo', notes: 'internal' } },
      l1: 'silent',
    },
  ],
};
```

`cases` is a flat array; each case carries its own `polarity`, its L1 verdict (`'fires' | 'silent'`),
and optionally an `l3` loop block. A case with no `ctx` is L3-only (skipped at L1).

## Polarity semantics

| polarity | meaning | typical L1 | typical L3 |
|---|---|---|---|
| **positive** | the compliant flow the guard MUST allow | `silent` | `expect: 'pass'` |
| **negative** | the violation the guard MUST catch | `fires` | `veto` / `redrive` / `refusal` |
| **neutral** | the look-alike that must be left alone (status talk, unrelated tool, resolved probe) | `silent` | — |

The neutral case is where most guard regressions (false-fires) are actually caught.

## L1 — crafting the `GuardCtx`

An L1 case is a `Partial<GuardCtx>` in, a verdict out. `craftCtx` fills the defaults (empty `args`, a
fresh `FixtureWorld('seeded-media')`, empty `observed`, `turnIndex: 0`). The firewall holds: a `check()`
reads only `args`, `tool`, `world`, `observed`, `turnIndex`, `reply`, `producedThisTurn`,
`attachmentsThisTurn`, `result`, `notes` — **never user text**. Observed calls are
`{ name, args, ok, turnIndex, resultFlags? }`; reply guards need `reply` set; postTool guards need
`result`; world-keyed guards can pass `world: new FixtureWorld('quota-exhausted')` etc.

## L3 — scripted-loop cases

An L3 case installs the guard on a real governed turn (`buildIsolatedSpec`) and drives it with the
**scripted fake LLM**: each script step is one model invocation — an array of `{tool, args}` tool-call
parts or `{text}` parts. You assert the observable **signal tag** in the turn's recovery events:

| effect | signal tag | hook |
|---|---|---|
| a vetoed tool call | `dim:kind:tool` (e.g. `input:argRequired:createItem`) | preTool |
| a reply redrive | `redrive:kind` | onReply |
| a post-tool report (joins the redrive) | `output:kind:tool` | postTool |
| an input refusal (turn tripwired) | `onInput:kind` | onInput |
| a clean pass | zero recovery events | — |

Script conventions (verified in `packages/mastra/test/proofs/signal-mechanics.test.ts` — violate them
and the loop will not close the way you expect):

- **End every turn with a NON-empty terminal reply** (`replyToUser`/`askUser`) — an empty text never
  sets the terminal reply and triggers the `forced-terminal` fallback first.
- **A redrive correction step is a plain `{text}` part**, never a tool call — the redrive is a
  NO-TOOLS re-generation.
- **A preTool veto costs no extra model step** — the vetoed call returns a failure result and the same
  generation continues with your next scripted step.
- **A step's tool calls are dispatched CONCURRENTLY** — never rely on within-step ordering (this is why
  the same-step ask-then-act deny is proven at L1 only).
- **Respect the collective ruleset** (the table in `packages/core/test/proofs/catalog.ts`): in the
  collective run every other guard is live, so a script must satisfy every rule except the one its own
  negative case violates — search before create, titles on createItem, the destructive confirm
  protocol, clean reply wording, and so on.

## Collective non-interference

The collective lane builds ONE super-agent carrying every proof's guard (`buildCollectiveSpec`) and
replays each loop case against it: a negative case must still surface ITS guard's tag, and no guard
outside the whitelist (the guard under proof + the always-on auto layer) may fire; a pass case must
stay byte-clean. When two guards *genuinely* co-fire on the same violation (e.g. a destructive claim
that is also a pending, un-relayed confirmation), declare the partner kind in that **l3 case's
`alsoFires`** — it extends the whitelist for that case only, declared instead of surprising.

## Coverage obligation

Every guard export needs a proof with **all three polarities**, **both L1 verdict classes** (a ctx'd
`fires` and a ctx'd `silent` — always-fire kinds like `forbidThisTurn` instead prove ctx-independence
with ≥2 fires + an L3 pass), and **≥1 L3 loop case**. The ratchet (`proof completeness · <kind>`)
computes this from the proofs themselves — see [`ratchet.md`](ratchet.md). Scaffold a fresh stub with
`node skills/looprun-governance/scripts/scaffold-proof-cases.mjs <kind>`.
