# Plain names — design

Date: 2026-08-06 · Status: design, not yet built

Seven concepts carry names written for the people who built the engine. This renames them across
every live surface — source, types, tests, docs, guard text, CLI output, the skill, generated
subjects, measurement tooling. Nothing keeps the old name, and nothing anywhere says what a name
used to be.

## The names

| now | becomes | what it is |
|---|---|---|
| `ledger` | `actionHistory` | what was done this conversation: the calls, what they returned, whether they changed anything, which approval requests are open and which were answered |
| `probe` | `simulate` | the helper a world uses to answer "I did nothing — here is what would happen" |
| `preview` | `simulationResult` | the field inside that answer holding the record, the consequences and the properties of the act |
| `trunk` | `assembledPrompt` | the prompt an agent reads, assembled from the domain's shared blocks and this agent's own |
| `challenge` | `approvalRequest` | the request the runtime opens for one act on one record, carrying the code that answers it |
| `arm` | `variant` | one side of a comparison: `governed` or `ungoverned` |
| `band` | `range` | the spread across K repetitions of one case set |

Two of the seven are not a whole word's worth of change. `probe` names three different things and only
two of them are this concept; `trunk` names a law whose meaning dies with the metaphor. Both are
settled below, under **Where a word means more than one thing**.

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

**`systemPrompt` is taken.** `spec.surface.systemPrompt` is an optional function an author writes,
producing ONE block. The assembled prompt contains it:

```
spec.surface.systemPrompt?(world, uploads) → string     one block an author writes
                    │
                    └── rendered INTO ──┐
                                        ▼
renderScopedSpecTrunk(world, spec, uploads, domain) → string
   voice · scope precedence · core rules · tool rules · behavior · state mapping
```

Giving both the same name is the `conversationHistory` failure again. `assembledPrompt` states the
one thing a reader must know: it is not written, it is assembled. `spec.surface.systemPrompt` keeps
its name and meaning.

**`domainPrompt` names the wrong scope.** The renderer takes a per-agent `AgentSpec` and a shared
`DomainContract` and returns a per-agent string. Two agents of one domain get two different strings:

```
DomainContract "hermes"      voice · coreInvariants · languageClause      byte-identical
       │
       ├── spec 'inbox-triage'   persona: "…email assistant: summarize, clean up and answer…"
       └── spec 'calendar'       persona: "…calendar assistant: manage their events…"
                                          ▲
                          different output from the same domain
```

The domain is one input, not the scope of the output — and `DomainContract` already owns the word,
so a reader meeting `domainPrompt` looks for the shared blocks and finds the whole assembly. The
shared byte-identical prefix stays unnamed; nothing today needs to refer to it.

**`confirmationRequest` saturates a namespace that is already full.** `packages/core/src` holds
eight distinct `confirm*` names across 150 uses — `confirmed`, `confirm`, `confirmFirst`,
`confirmation`, `confirmMechanism`, `confirmArg`, `confirmFirstPriorAsk`, `confirmAskRe` — plus the
world-result fields `requiresConfirmation` and `confirmationPrompt` and the guard file
`guards/confirmation.ts`. Adding six more would put fourteen `confirm*` names in one reader's way,
which is the `conversationHistory` failure at four times the scale. `approvalRequest` is orthogonal
to `confirmFirst` (the guard that demands one) and to `consentRequired` (the guard that reads a
standing world flag), and it says what happens: the user **approves** the act.

**`securityQuestion` names a different, established thing.** A security question is knowledge-based
authentication — a first pet, a mother's maiden name. This is a one-time code for one act on one
record, the shape of an SMS confirmation. A reader meeting `securityQuestion` looks for a personal
question and finds none.

**`keyword` names half of it.** The concept is a request plus the code that answers it. One name for
both leaves the request unnamed, which is the half a reader has to understand first.

## Where a word means more than one thing

A rename that swaps every occurrence of a word swaps the ones that meant something else too. Three
words carry a second meaning, and each is settled here rather than left to the sweep.

### `probe` names a measuring instrument as well as a helper

```
①  the world helper that asks without acting          probe()            →  simulate()
②  a write that ran ok and took no effect             "(a probe)"        →  "(a simulation)"
③  AN OFFLINE MEASURING INSTRUMENT                    the margin probe   →  stays `probe`
                                                      packages/eval/probes/
```

Sense ③ is an experiment someone runs to measure the engine, not a world answering a question:

```
runtime/prompt.ts:9
  The offline instruments (the margin probe and its fork replays) need those exact bytes

pnpm -C packages/eval probe:lie-check       runs packages/eval/probes/lie-check-portability.mjs
docs/analysis/2026-08-04-lie-check-model-portability.md      "the same probe, the same cells"
```

*The margin simulate* is not a phrase. A probe is ordinary English for an instrument that measures
something from outside, and that is exactly what these are. `probe` survives in sense ③ — the
directory `packages/eval/probes/`, the script `probe:lie-check`, and the prose that names them — and
the gate allowlists those paths with that reason.

### `trunk` names a law whose meaning is the metaphor

`trunk` is a tree: one shared stem, one branch per agent. The law is named after the stem.

```
BEFORE   spec.ts:155
         per-agent divergence as late as possible so the domain's agents share a maximal
         static TRUNK prefix (trunk-static law)

WRONG    …share a maximal static ASSEMBLEDPROMPT prefix (assembledPrompt-static law)
                                  ▲
         the assembled prompt is the per-agent WHOLE; the trunk was the shared PART
```

Substituting the word inverts what the law says. The law takes a name of its own, describing what it
protects rather than what the metaphor called it:

```
trunk-static law   →   shared-prefix law
  "the domain's agents share a maximal static prompt prefix (shared-prefix law)"
```

18 occurrences across 12 files, including `packages/core/GUARDS.md` and the three generated
`contract.ts` files of `examples/hermes-sim`. The shared prefix itself stays unnamed as a value —
only the law has a name.

### `ledger` is the right word inside an accounting domain

A subject repo's world is a business, and a business may keep a ledger:

```
accounting/WORLD-MODEL.md:7
  Firm (invented, neutral): LedgerLine Accounting. Currency: USD. Locale: English.

blind sweep  →  "ActionHistoryLine Accounting"
```

The rename retires an ENGINE name. A domain's own vocabulary is content, not engine vocabulary, and
is not touched: `LedgerLine` is the invented firm's name and `ledger` in a bookkeeping sentence is
the book it keeps. The gate allowlists a domain repo's world and persona files by path, and the
sweep over those repos is manual rather than scripted.

## The identifier map

Every exported name, file name and literal value that carries one of the seven. This list is the
rename's unit of work.

**`@looprun-ai/core` — exported surface**

| now | becomes |
|---|---|
| `TurnLedger` | `TurnActionHistory` |
| `createLedger` | `createActionHistory` |
| `deriveClaimsFromLedger` | `deriveClaimsFromActionHistory` |
| `Challenge` | `ApprovalRequest` |
| `challengeToken` | `approvalCode` |
| `challengeMatchesCall` | `approvalMatchesCall` |
| `issueChallengeForVeto` | `issueApprovalForVeto` |
| `closeChallengesFor` | `closeApprovalsFor` |
| `consumeChallenges` | `consumeApprovals` |
| `renderScopedSpecTrunk` | `renderAssembledPrompt` |
| `renderTrunkBlocks` | `renderPromptBlocks` |
| `foldTrunk` | `foldPrompt` |
| `checkTrunkStatic` | `checkPromptStatic` |
| `TrunkBlock` · `TrunkRow` · `TrunkLine` | `PromptBlock` · `PromptRow` · `PromptLine` |
| `TrunkPolarity` | `PromptPolarity` |
| `TrunkRenderOptions` | `PromptRenderOptions` |

**`@looprun-ai/eval` — exported surface**

| now | becomes |
|---|---|
| `CertBand` | `CertRange` |
| `CertBandOptions` | `CertRangeOptions` |
| `buildCertBand` | `buildCertRange` |
| `renderCertBandMd` | `renderCertRangeMd` |

**Fields, literals and generated keys**

| now | becomes | where |
|---|---|---|
| `ledger` (parameter and field) | `actionHistory` | throughout `core` |
| `challenges` · `challengesIssuedThisTurn` | `approvals` · `approvalsIssuedThisTurn` | `TurnActionHistory` |
| `arm` (variable, CLI label, JSON key) | `variant` | `eval` run summaries and certification records |
| `probe()` | `simulate()` | the world helper a generated subject ships |
| `preview` (world-result key) | `simulationResult` | `defineWorld`, every generated subject |
| `previewOf(...)` | `simulationResultOf(...)` | `world/define-world.ts` |
| `outcome: 'preview'` | `outcome: 'simulated'` | the audit outcome union in `world/types.ts` |
| `cert-band.json` · `CERT-BAND.md` | `cert-range.json` · `CERT-RANGE.md` | certification output |
| `jargonScrub({ '(beta)': 'preview' })` | `jargonScrub({ '(beta)': 'early access' })` | test fixture data; the map is arbitrary and the word goes |

**File names**

```
packages/core/src/trunk.ts                  →  assembled-prompt.ts
packages/core/src/trunk-fold.ts             →  prompt-fold.ts
packages/core/src/runtime/ledger.ts         →  action-history.ts
packages/core/src/runtime/challenge.ts      →  approval-request.ts
packages/core/test/challenge.test.ts        →  approval-request.test.ts
packages/core/test/challenge-render.test.ts →  approval-render.test.ts
packages/core/test/challenge-ledger.test.ts →  approval-action-history.test.ts
packages/core/test/claims-ledger.test.ts    →  claims-action-history.test.ts
packages/core/test/trunk-stability.test.ts  →  prompt-stability.test.ts
packages/core/test/proofs/trunk-provenance.test.ts → prompt-provenance.test.ts
```

**Not renamed.** `ARMED_SEAMS` and every `armed` / `arming` / `disarmed` is about a seam being
armed, not about a comparison variant. `spec.surface.systemPrompt` keeps its name.

## The prose the rename rewrites

`preview` names two things: the field, and the two-step ritual's first call. Both go.

```
BEFORE   05-running-and-eval.md:214
         A tool named in `destructiveTools` is promised a two-step ritual: preview first —
         which is what makes the second call meaningful

AFTER    A tool named in `destructiveTools` is promised a two-step ritual: simulate first —
         which is what makes the second call meaningful

BEFORE   04-guards.md:357   a tool with no preview form is denied, and the denial raises the question
AFTER                       a tool with no simulate form is denied, and the denial raises the question
```

`ledger.ts:144` and `turn.ts:136` carry the same phrase in comments and both change with it. The
ritual has one name end to end: **simulate first, then act**.

## The rename, concretely

Measured with `grep -rniE "\b<word>"` over `.ts` `.md` `.json` `.mjs` `.js`, excluding
`node_modules` and `dist`:

```
repo               renamed   measurement records
──────────────────────────────────────────────────
looprun              4,243            —
agentspec              285            —
looprun-bench        1,174        4,381
agentspec-bench        657            —
accounting             107            —
lawfirm                102            —
homeservices            77            —
looprun.ai               9            —
──────────────────────────────────────────────────
                     6,654        4,381
```

**Dated design records, plans and proof records are renamed like everything else.** A spec under
`docs/superpowers/specs/`, a plan under `docs/superpowers/plans/`, a proof under
`governance/proofs/` — each is prose someone reads to understand the system, so each carries the
vocabulary the system uses. Their file names change with their contents:

```
governance/proofs/2026-07-29-trunk-fold-coherence-cut.md
  →  2026-07-29-prompt-fold-coherence-cut.md
docs/superpowers/plans/2026-08-05-consent-by-challenge.md
  →  2026-08-05-consent-by-approval.md
docs/superpowers/plans/2026-07-31-prose-only-ungoverned-arm.md
  →  2026-07-31-prose-only-ungoverned-variant.md
docs/superpowers/specs/2026-08-05-consent-by-challenge-design.md
  →  2026-08-05-consent-by-approval-design.md
docs/superpowers/specs/2026-07-31-prose-only-ungoverned-arm-design.md
  →  2026-07-31-prose-only-ungoverned-variant-design.md
```

**One measurement record is excluded, and only one.** A result file under
`benchmarks/atlas/v0.6.0/results/` is a number taken on a date, not prose anyone reads for
vocabulary; editing its words after the fact makes it disagree with the run that wrote it. Those
files are excluded from the search by path and nothing else is.

**This design document is the last file to go.** It is the only place that has to name both
vocabularies at once, and it stops being true the moment the rename lands. The final commit of step
1 deletes it and the plan derived from it, so no file left in the tree says what a name used to be.

Surfaces, in the order a reader meets them:

1. **Guard text a user reads** — deny reasons, guard prose, the confirmation question itself.
2. **`packages/core/GUARDS.md`** and the tutorial chapters.
3. **Public types and exported functions** — the identifier map above.
4. **Internal source** — variables, comments, test names, file names.
5. **CLI output** — `looprun-eval` messages that name any of the seven.
6. **The `agentspec` skill** — references, templates, lint rule names and messages.
7. **Generated subjects** — the world helper, the world-result key, every spec comment.
8. **Measurement artefacts** — `variant` and `range` in run summaries, certification records and the
   campaign runner's output.

## Two rules this rename obeys

**No compatibility alias.** Pre-1.0 carries zero retro-compatibility: the old name is deleted, not
deprecated. An alias would keep both names alive in search results and in every reader's vocabulary,
which is the cost this change exists to remove.

**No name is explained by what it replaced.** No comment, doc or commit body says "formerly the
ledger" or "renamed from probe". A reader meeting `actionHistory` learns what it is, not what it was.

**The changelog is the one exception, and it is not an exception at all.** A release note is a dated
record, and the record of a breaking rename IS the pair of names:

```
Breaking, @looprun-ai/core: TurnLedger → TurnActionHistory, createLedger → createActionHistory,
Challenge → ApprovalRequest, renderScopedSpecTrunk → renderAssembledPrompt.
```

Without that line a consumer on the old version has no migration to follow. And because every
entry is dated, an OLD entry keeps the names its release shipped: a v0.7.0 note describing an
`assembledPrompt` would name an API that release did not have. `CHANGELOG.md` is therefore read by
the gate the way a benchmark result is — not at all.

## What makes it verifiable

`tests/plain-names.test.mjs`, run over every repo, exits non-zero on any hit:

```
STEMS      ledger  probe  preview  trunk  challenge          any suffix
NARROW     arms?   bands?                                    exact word only
```

`arm` and `band` are matched as whole words with no suffix, because `armed`, `arming`, `disarmed`,
`warm`, `harm`, `alarm`, `bandwidth` and `abandon` are ordinary English this rename does not touch.

```
EXCLUDED PATHS
  **/benchmarks/**/results/**        a number taken on a date, not prose
  node_modules/  dist/

ALLOWLIST — each entry carries the sense it protects, in the script
  docs/benchmarks.md               "Gemini 3.1 Pro Preview"      a product name
  packages/eval/probes/**          probe                          an offline instrument
  packages/eval/package.json       "probe:lie-check"              the instrument's script
  packages/core/src/runtime/prompt.ts       "margin probe"        the instrument, named in prose
  packages/mastra/test/prompt-identity.test.ts  "margin probe"    the same instrument
  docs/analysis/2026-08-04-lie-check-model-portability.md  probe  the instrument's own report
  <domain repo>/WORLD-MODEL.md · persona and world files   ledger  a business's own vocabulary
```

Every allowlist entry names both a path and the word it protects, so allowing `probe` in the
instrument's report does not also allow `ledger` there. The script is the acceptance test: a rename
that leaves the word in a comment, a test title or an error string has not happened.

**The two laws whose names change.** A law named after a retired word takes a name of its own rather
than a substitution, because the metaphor is what its name meant:

```
trunk-static law   →   shared-prefix law     the domain's agents share a maximal static prefix
trunk-warm law     →   prefix-warm law       N distinct prefixes stay cached across agent switches
```

`armed-seam law` keeps its name — `armed` is ordinary English and no rename touches it. The gate
cannot tell a law's name from any other prose, so these two are carried explicitly by the task that
renames `trunk`.

## Order of work

The engine first, because everything else quotes it. Then the skill, whose references teach the
names to every future subject. Then the four generated subjects and the two benches, which quote
both.

```
1  looprun          engine, tests, docs, CLI, governance/MATRIX.md
2  agentspec        references, templates, lint rules and messages
3  agentspec-bench · looprun-bench     live source, subjects, tooling
4  accounting · lawfirm · homeservices · looprun.ai    generated specs
```

Each repo lands as one commit — a partial rename is worse than none, since a reader then meets both
vocabularies in the same file. `tests/plain-names.test.mjs` ships in step 1 and runs against
every repo from then on.
