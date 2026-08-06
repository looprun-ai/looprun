# Plain names — design

Date: 2026-08-06 · Status: design, not yet built · Scope: every repo, no exception

Six concepts carry names written for the people who built the engine. This renames them
everywhere — source, types, tests, docs, guard text, CLI output, the skill, generated subjects.
Nothing keeps the old name, and nothing anywhere says what a name used to be.

## The names

| now | becomes | what it is |
|---|---|---|
| `ledger` | `conversationRecord` | what happened this conversation: the calls, what they returned, whether they changed anything, which confirmation requests are open and which were answered |
| `probe` | `dryRun` | the call that asks what would happen and changes nothing |
| `preview` | `wouldChange` | the field inside a dry run's answer describing what the act would do |
| `trunk` | `systemPrompt` | the assembled prompt an agent reads: voice, rules, tool rules, current state |
| `challenge` | `confirmationRequest` | the question the runtime opens for one act on one record |
| `challenge.token` | `confirmationCode` | the word the user types back to answer it |

`arm` and `band` stay: both already read plainly in the measurement docs where they live.

## Why not the obvious alternatives

**`ledger` → `conversationHistory` collides.** `GuardCtx.history` already exists and is a different
thing: the prior turns' messages. Two names built on "history", one holding messages and one holding
effects, rebuilds the confusion this rename exists to remove. `conversationRecord` sits beside
`history` without competing with it.

**`trunk` → `fixedPrompt` is inaccurate.** It is re-rendered every turn with the world's current
state, so nothing about it is fixed. `spec.surface.systemPrompt` already carries the assembled
result; naming the renderer `renderSystemPrompt` closes the gap between the thing and its builder.

**`challenge` → `keyword` names half of it.** The concept is a question plus the word that answers
it. One name for both leaves the question unnamed, which is the half a reader has to understand
first.

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
3. **Public types and exported functions** — `Ledger`, `issueChallenge`, `renderScopedSpecTrunk`,
   `probe()`, the `preview` key of a world result, `challengeToken`, `challengeMatchesCall`.
4. **Internal source** — variables, comments, test names.
5. **CLI output** — `looprun-eval` messages that name any of the six.
6. **The `agentspec` skill** — references, templates, lint rule names and messages.
7. **Generated subjects** — the world helper `probe()`, the `preview` key, every spec comment.

## Two rules this rename obeys

**No compatibility alias.** Pre-1.0 carries zero retro-compatibility: the old name is deleted, not
deprecated. An alias would keep both names alive in search results and in every reader's vocabulary,
which is the cost this change exists to remove.

**No name is explained by what it replaced.** No comment, doc, changelog entry or commit body says
"formerly the ledger" or "renamed from probe". A reader meeting `conversationRecord` learns what it
is, not what it was. The changelog states the new vocabulary and the breaking surface; it does not
narrate the change.

## What makes it verifiable

The rename is complete when a search for each old name over every repo returns nothing:

```
ledger · probe · preview · trunk · challenge     →  0 hits, case-insensitive, all repos
```

That is one command and it is the acceptance test. A rename that leaves the word in a comment, a
test title or an error string has not happened.

## Order of work

The engine first, because everything else quotes it. Then the skill, whose references teach the
names to every future subject. Then the bench, which is a generated artefact and can be swept
mechanically or regenerated.

Each repo lands as one commit — a partial rename is worse than none, since a reader then meets both
vocabularies in the same file.
