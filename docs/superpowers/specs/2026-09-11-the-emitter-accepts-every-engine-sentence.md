# The emitter accepts every sentence the engine speaks

## 1 · The measurement

The engine speaks eight sentences of its own and lets a contract's `wording.sentence` override each
(`packages/core/src/contract/vocabulary.ts`, `EngineSentenceKey`). The emitter checked a declared
override against a list of its own that named seven — `nothingOwed` was not on it — and refused
the declaration:

```
contract.wording.sentence declares 'nothingOwed', and the engine's sentence table carries
approvalInstruction, exhaustionClosure, unknownStatus, questionExpired, questionSuperseded,
questionDeclined, deniedByGuard — an override on any other key reaches nobody
```

So every subject authored through the emitter left the nothing-owed closure to the English
default, whatever its declaration wished. On the Criaty product's live ladder the owner read
"Nothing here reaches what was asked, and nothing changed." on the second turn of the two voice
cases (`yntelli/yntelli/evals/reports/rung3-c2`, `12-clear-voice`, `11-update-voice`); the blind
author of `criaty-c2` had declared seven sentences in Portuguese and could not declare the eighth.

## 2 · The implementation

`packages/core/src/cards/wordings.ts` exports the keys the engine reads, from the table it reads
them from:

```ts
export const ENGINE_STATUS_KEYS: readonly (Status | Reason)[] = Object.keys(STATUS_PACK) as (Status | Reason)[];
export const ENGINE_SENTENCE_KEYS: readonly EngineSentenceKey[] = Object.keys(SENTENCE_PACK) as EngineSentenceKey[];
```

`packages/emit/src/write-cards.ts:870-873` reads them instead of keeping a list of its own:

```ts
const WORDING_KEYS: Readonly<Record<string, readonly string[]>> = {
  status: ENGINE_STATUS_KEYS,
  sentence: ENGINE_SENTENCE_KEYS
};
```

One table, two readers. Emit suite 178/178, core suite green, build clean, root gates clean; the
amended `criaty-c2` declares `nothingOwed` in Portuguese, emits, and its gate is green. The
measured build is the branch `microtest-unicode-terms`.

## 3 · The documentation

The law lives beside the tables in `wordings.ts` and in the emitter's `WORDING_KEYS` comment.
Checked and found not to list the keys: `README.md`, `governance/GOVERNANCE.md`, `docs/tutorial/01..06`.

## 4 · The skill

`agentspec/skill/references/norms.md` names "the six status words and the eight engine sentences"
— the count was already the engine's; nothing to change. The bench subject that measures it is
`agentspec-bench/subjects/criaty-c2` (branch `criaty-c2-amend`).
