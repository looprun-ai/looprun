# The live house — a routed house over the host's own tools

Date: 2026-09-10 · Status: BUILT on branch `microtest-live-house`, awaiting the word to merge and
release · Version: 0.22.0 (minor)

## 1 · The measurement

A product that binds the engine to its own tools in process has a `LiveWorldCard` and a
`LoopRunConfig` with a `live` map — one desk at a time. It has no door for a **house** of desks
over that surface: `RoutedAgent.fromSubject` takes a `DeclaredWorld` and builds it, and the
helpers a house needs (`descriptionsOf`, `summariesOf`, `defaultOf`, the front of house, the
router seat) are module-private. A product wanting six desks over its tools would have to copy the
engine's own front-of-house text, or mark a `default` desk it does not have.

Two further defects, both reproduced in `packages/mastra/test/routed-live.test.ts` on the branch:

| defect | how it shows |
|---|---|
| a surface the gate refuses rejects in desks no turn awaits | three desks constructed over a drifted surface: one refusal is caught by the turn that awaited it; the other two are unhandled rejections, and a Node process with the default policy exits |
| a pinned turn has no public door to one desk of a house | the house's `desks` are private; a host that pins a turn (a product gate, an exam driver) has to cast |

What the branch measures, all green (`packages/mastra/test/routed-live.test.ts`,
`packages/mastra/test/routed-live-consent.test.ts`, 9 tests; the mastra suite 82/82; typecheck
clean):

| claim | test |
|---|---|
| two desks seated by name, the front of house exported | `seats two desks, exposes each by name, and exports the front of house` |
| a lone desk is itself | `is the lone desk itself when the subject has one` |
| the seal minted from the card alone is accepted when the card carries every schema | `accepts the seal minted from the card alone…` |
| a live schema that drifts from the card refuses construction | `refuses construction when the live schema drifts from the card` |
| a wrong seal refuses | `refuses a wrong seal` |
| the engine's front of house assembles over a live card | `assembles the engine's own front of house over the live card` |
| a drifted surface is one caught error at the door | `settles every desk at the door…` |
| a pinned desk reads through the live tool and closes with the finish it owes | `a pinned desk reads through the live tool…` |
| a destructive act is held before the live tool runs, and runs on the code with the model's own args | `routed-live-consent.test.ts` |

## 2 · The implementation

`packages/mastra/src/routed-agent.ts` — the live sibling of `fromSubject`, a desk accessor, the
door:

```ts
export interface RoutedLiveSubjectCfg {
  readonly specs: Readonly<Record<string, AgentSpec>>;
  readonly contract?: DomainContract;
  readonly world: LiveWorldCard;
  readonly live: Readonly<Record<string, LiveTool>>;
  readonly seal?: string;
  readonly model: LoopRunModel;
  readonly providerOptions?: ProviderOptions;
}

static fromLiveSubject(cfg: RoutedLiveSubjectCfg,
                       portFactory?: (params: LlmParams) => ModelPort): RoutedAgent | LoopRunAgent
  // one desk: the LoopRunAgent itself (a default alone refuses, as in fromSubject);
  // several: every desk built with the same { world, live, seal }, teammates composed from the
  // others' descriptions, the fallback = the marked default or the engine's front of house,
  // the router seated at temperature 0.

desk(name: string): LoopRunAgent          // a desk of the house by name; an unknown name throws
async settle(): Promise<void>             // every desk and the fallback awaited once
```

`packages/mastra/src/loop-run-agent.ts`:

```ts
async settle(): Promise<void> { await this.ready; }   // the assembled engine, or the gate's CardError
```

`packages/mastra/src/index.ts` exports `frontOfHouse` and the `RoutedLiveSubjectCfg` type.

## 3 · The documentation

`docs/tutorial/06-running-and-measuring.md`, "Worlds that are not fixtures": the `liveWorld`
example carries the required `host`; a `LoopRunAgent` over the host's tools shows the `live` map
with a tool's name, description, schema, `execute` and `attests`; the paragraph states the
reconciliation (a missing name or a drifted schema refuses construction) and the house door
(`fromLiveSubject`, `settle()`, `desk(name)`).

## 4 · The skill (same session as the engine)

`references/engine-seams.md` gains §8, the live house: the same seams, the surface gate at
construction, the answer law of the live port (a read is done; a write is done only when its tool
attests; `isError` is the tool's own no), the hold before the port on a destructive act.

## 5 · Acceptance

`pnpm -r clean && pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm gates` green on the
branch; the merge to `main` and `pnpm release-minor` on the owner's word.
