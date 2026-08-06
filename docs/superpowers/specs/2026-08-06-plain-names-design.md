# Plain names — design

Date: 2026-08-06 · Status: design, not yet built · Scope: every repo, no exception

Seven concepts carry names written for the people who built the engine. This renames them
everywhere — source, types, tests, docs, guard text, CLI output, the skill, generated subjects.
Nothing keeps the old name, and nothing anywhere says what a name used to be.

## The names

| now | becomes | what it is |
|---|---|---|
| `ledger` | `actionHistory` | what was done this conversation: the calls, what they returned, whether they changed anything, which confirmation requests are open and which were answered |
| `probe` | `simulate` | the helper a world uses to answer "I did nothing — here is what would happen" |
| `preview` | `simulationResult` | the field inside that answer holding the record, the consequences and the properties of the act |
| `trunk` | `systemPrompt` | the assembled prompt an agent reads: voice, rules, tool rules, current state |
| `challenge` | `confirmationRequest` | the request the runtime opens for one act on one record, carrying the code that answers it |
| `arm` | `variant` | one side of a comparison: `governed` or `ungoverned` |
| `band` | `range` | the spread across K repetitions of one case set |

## Why not the obvious alternatives

**`conversationHistory` collides.** `GuardCtx.history` already exists and holds the prior turns'
messages. Two names built on "history", one for messages and one for effects, rebuilds the confusion
this rename exists to remove. `actionHistory` sits beside `history` and the pair reads apart:
messages against actions.

**`dryRun` is trade vocabulary.** It reads as nothing to someone who has not met it. `simulate` is
the word a person outside the codebase already uses — *simulate the cancellation and tell me what
happens* — and it needs no gloss.

**`simResult` abbreviates.** An abbreviation is jargon in miniature, which is what this rename
removes. Six characters buy a name nobody has to decode.

**`newData` and `expectedData` mislead.** Nothing was created and nothing was stored:
`dispatchVoided: false` does not mean a dispatch was voided and returned false, it means no dispatch
would be voided if the act ran. A name suggesting data was produced is the most expensive
misreading available at this point in the flow, because it is exactly what the confirmation exists to
prevent. `simulationResult` pairs with `simulate`, and the pair states its own tense.

**`fixedPrompt` is inaccurate.** The prompt is re-rendered every turn with the world's current state
— today's date, whether the workspace is frozen, how many bookings are live. `spec.surface.systemPrompt`
already carries the assembled result; naming the renderer `renderSystemPrompt` closes the gap between
the thing and its builder.

**`securityQuestion` names a different, established thing.** A security question is knowledge-based
authentication — a first pet, a mother's maiden name. This is a one-time code for one act on one
record, the shape of an SMS confirmation. A reader meeting `securityQuestion` looks for a personal
question and finds none.

**`keyword` names half of it.** The concept is a request plus the code that answers it. One name for
both leaves the request unnamed, which is the half a reader has to understand first.

## The rename, concretely

```
looprun            ~1,450 occurrences across ~150 files
agentspec skill      ~130
agentspec-bench    ~1,260   (a generated subject, regenerated or swept)
                   ───────
                   ~2,840
```

Surfaces, in the order a reader meets them:

1. **Guard text a user reads** — deny reasons, guard prose, the confirmation question itself.
2. **`packages/core/GUARDS.md`** and the tutorial chapters.
3. **Public types and exported functions** — `Ledger`, `issueChallenge`, `issueChallengeForVeto`,
   `challengeToken`, `challengeMatchesCall`, `renderScopedSpecTrunk`, `renderTrunkBlocks`, the
   `probe()` helper a generated world ships, and the `preview` key of a world result.
4. **Internal source** — variables, comments, test names.
5. **CLI output** — `looprun-eval` messages that name any of the seven.
6. **The `agentspec` skill** — references, templates, lint rule names and messages.
7. **Generated subjects** — the world helper `probe()`, the `preview` key, every spec comment.
8. **Measurement artefacts** — `arm` and `band` in run summaries, certification records and the
   campaign runner's output.

## Two rules this rename obeys

**No compatibility alias.** Pre-1.0 carries zero retro-compatibility: the old name is deleted, not
deprecated. An alias would keep both names alive in search results and in every reader's vocabulary,
which is the cost this change exists to remove.

**No name is explained by what it replaced.** No comment, doc, changelog entry or commit body says
"formerly the ledger" or "renamed from probe". A reader meeting `actionHistory` learns what it
is, not what it was. The changelog states the new vocabulary and the breaking surface; it does not
narrate the change.

## What makes it verifiable

The rename is complete when a search for each old name over every repo returns nothing:

```
ledger · probe · preview · trunk · challenge · arm · band   →  0 hits, case-insensitive, all repos
```

That is one command and it is the acceptance test. A rename that leaves the word in a comment, a
test title or an error string has not happened.

## Order of work

The engine first, because everything else quotes it. Then the skill, whose references teach the
names to every future subject. Then the bench, which is a generated artefact and can be swept
mechanically or regenerated.

Each repo lands as one commit — a partial rename is worse than none, since a reader then meets both
vocabularies in the same file.
