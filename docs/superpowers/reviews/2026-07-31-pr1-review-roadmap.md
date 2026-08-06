# PR #1 Walkthrough — Review Roadmap

**Started:** 2026-07-31
**Mode:** dialogue. Claude explains one module at a time; Marcos asks questions and
requests adjustments. Each adjustment is ruled **NOW** (fix immediately) or
**BACKLOG** (append to `BACKLOG.md`). Marcos decides; Claude never self-rules.
**Goals:** (a) Marcos learns every implementation detail of looprun;
(b) the review produces concrete improvements.

## Scope under review

```
PR #1  simplification            a957339 .. 34542c7   (merge c31a703)
       36 commits · 154 files · +10,762 / −3,784

follow-on commits already on main (in scope, small)
       5a5e3a1 ab3cdf3 e22df90 779151f   BACKLOG LP gates + attestation design
       917340f 7d1f5cd                   changeset downgrade + release v0.9.0

OUT of scope (different work, later session)
       ba0f1ca 0cf8dfd                   eval cert-range feature
```

Diff weight by area — this is why the modules are ordered the way they are:

```
packages/core     +3048 −2293  ████████████████████  47 files   API + guards + assembled prompt
docs/tutorial     +4255     0  ███████████████████   28 files   the new front door
packages/mastra    +334  −149  ███                   17 files   the facade
packages/server    +184   −20  ██                    10 files
governance         +635     0  ████                   9 files   proof records
packages/eval      +160   −35  █                      7 files
packages/models    +154   −29  █                      6 files
docs (old)            0  −1121 ▼▼▼▼▼▼                 9 files   deleted
```

## Method per module

```
1. Claude posts a visual map of the module (what changed, why, how it fits)
2. Claude walks the 2–4 files that carry the idea, with real code excerpts
3. Marcos asks anything; Claude answers from the code, not from memory
4. Adjustments → Decisions Log below, marked NOW or BACKLOG
5. Module status flips to DONE; next module starts
```

## Status board

| # | Module | What it teaches | Weight | Status |
|---|---|---|---|---|
| M0 | Orientation | package graph, runtime flow, where a turn actually executes | read-only | PENDING |
| M1 | Public API contract | barrel = tutorial contract, `/internal` seam, surface locks, declaration-emit | core +78/−76, internal 100L | PENDING |
| M2 | Guards | 1427-line file → 8 files + `GUARD_CATALOG` as data | 1782 new lines | PENDING |
| M3 | Coherence cut & assembled prompt fold | what was erased, the byte-invariance proof | −428 / +184 | PENDING |
| M4 | Mastra facade | `LoopRunAgent`, agent.ts split, meta mirror | 551→448 +151 | PENDING |
| M5 | Peripheral barrels | models / eval / server / vercel surfaces | 4 packages | PENDING |
| M6 | Tutorial + snippets | 6 chapters, compiled snippet package, generated ch04 | 4255 lines | PENDING |
| M7 | Docs sweep & release plumbing | 9 docs deleted, README, migration notes, clean-before-pack | −1121 / +81 | PENDING |
| M8 | Governance | proof records, MATRIX, ratchet, the record gate | 9 files | PENDING |
| M9 | Open decisions | d5, d6, parked follow-ups → rulings | decisions | PENDING |

Legend: `PENDING` → `IN PROGRESS` → `DONE` (with a one-line outcome).

---

## M0 — Orientation

**Goal:** the map before the territory. No PR content yet.

| Item | Detail |
|---|---|
| Show | 7-package graph, who depends on whom, what each publishes |
| Show | the life of one turn: `AgentSpec` → compile → model call → guards → world → terminal |
| Show | which paths are governed and what "governed" costs you |
| Files | `packages/*/package.json`, `packages/core/src/runtime/turn.ts`, `GOVERNANCE.md` |
| Question to Marcos | which layer do you want the deepest detail on later — core runtime or mastra glue? |

**Outcome:** _(fill on completion)_

---

## M1 — Public API contract

**Goal:** understand the rule that drove the whole PR — *a concept not taught in the
tutorial is internal or deleted* — and the machinery that keeps it true.

| Item | Detail |
|---|---|
| Commits | `5b5e30f` `e6860ec` `f985f18` |
| Files | `packages/core/src/index.ts` (51 taught + 11 riders), `packages/core/src/internal.ts` (100L), `packages/core/package.json` (`./internal` exports entry), `packages/core/test/proofs/surface-lock.test.ts` (133L), `packages/core/test/proofs/declaration-emit.test.ts` (131L) |
| Show | the 265-symbol inventory verdicts: 89 taught / 38 internal / 138 deleted |
| Show | how a surface lock works (TS compiler API over `src`, hardcoded contract array) |
| Show | the type-closure rider rule and the TS2742 failure it prevents |
| Likely improvement topics | `./testing` subpaths still unlocked (~27 symbols); riders list maintenance cost |

**Outcome:** _(fill on completion)_

---

## M2 — Guards

**Goal:** the guard system end to end — categories, hooks, and the catalog that is now
the single vocabulary of record.

| Item | Detail |
|---|---|
| Commits | `08fecd0` `4b59968` `abcd735` `dcc824a` |
| Files | `packages/core/src/guards/{flow,args,world,confirmation,honesty,reply,custom,shared,catalog,index}.ts` |
| Show | the byte-exact split from the old 1427-line `guards.ts` and how it was proven |
| Show | `GUARD_CATALOG`: 30 entries × (name, category, hook, summary, whenToUse, example) |
| Show | the hook axis — `preTool` / `postTool` / reply-time — and what each can veto |
| Show | why `GUARDS.md` was demoted to maintainer internals (dual source of truth) |
| Known weak spot | reply-content guards use word regexes → multilingual fragility |
| Likely improvement topics | `honesty.ts` at 448L; catalog example coverage; regex→lexeme strategy |

**Outcome:** _(fill on completion)_

---

## M3 — Coherence cut & assembled prompt fold

**Goal:** the most aggressive deletion in the PR, and the proof technique that made it safe.

| Item | Detail |
|---|---|
| Commits | `55b8ac5` `d56dc8e` |
| Files | deleted `packages/core/src/coherence.ts` (−428), new `packages/core/src/prompt-fold.ts` (184L), `packages/core/src/assembled-prompt.ts` |
| Show | what `findContradictions` / polarity lexicon did, and the evidence of zero usage |
| Show | the cross-commit byte-invariance proof of the fold (sha256 `f695126…`) |
| Question to Marcos | is the fold a concept the tutorial should teach later, or permanently internal? |

**Outcome:** _(fill on completion)_

---

## M4 — Mastra facade

**Goal:** `LoopRunAgent` as the only teachable entry point, and what it hides.

| Item | Detail |
|---|---|
| Commits | `199c012` `a1f2a41` |
| Files | `packages/mastra/src/agent.ts` (551→448), `agent-construction.ts` (151L), `index.ts` (7 own exports + `export * from '@looprun-ai/core'`), `packages/server/test/meta-mirror.test.ts` |
| Show | why the barrel re-exports core wholesale, and the blind spot that caused (`validateSpec`) |
| Show | the meta-mirror pin: mastra ↔ server mutual assignability |
| Show | `run-conversation.ts` (278L) — the measured loop's actual driver |
| Likely improvement topics | agent.ts still 456L; re-export-everything vs explicit list |

**Outcome:** _(fill on completion)_

---

## M5 — Peripheral barrels

**Goal:** models / eval / server / vercel — what each package is for and what it now exposes.

| Item | Detail |
|---|---|
| Commit | `52fa552` |
| Files | `packages/{models,eval,server}/src/index.ts` (8+2 / 19+9 / 4+3), each package's `test/surface-lock.test.ts` |
| Show | `models`: llama.cpp runtime resolution, pinned decoding, cloud validation deps |
| Show | `eval`: subject layout, lint lanes, cert |
| Show | `server`: OpenAI-compatible surface and `LoopRunResultMeta` |
| Show | `vercel`: currently a versioned throwing stub — decision d6 lives here |
| Likely improvement topics | declaration-emit pins missing for models/eval/server riders |

**Outcome:** _(fill on completion)_

---

## M6 — Tutorial + snippets

**Goal:** the deliverable an external dev actually meets, and the CI machinery that keeps
every code block true.

| Item | Detail |
|---|---|
| Commits | `d33d5e5` `220c881` `62676c3` `c432a43` `2610195` `2b7d725` `abcd735` `e4ca952` `f701f76` `7e4b427` `0d2a66e` `281118d` |
| Files | `docs/tutorial/01..06`, `docs/tutorial/snippets/**` (workspace package `@looprun-internal/tutorial-snippets`), `scripts/gen-guards-chapter.mjs` (215L) |
| Show | chapter-by-chapter arc: concepts → hello world → anatomy → guards → running/eval → advanced |
| Show | the snippet package: typechecked + tested in CI, imports only the `looprun` facades |
| Show | ch04 generation + `--check` drift gate wired into root test and CI |
| Show | the two bugs the tutorial caught in the engine (world factory, `maxCalls` semantics) |
| Likely improvement topics | ch04 routing anchors not CI-checked; chapter length; missing a "recipes" chapter |

**Outcome:** _(fill on completion)_

---

## M7 — Docs sweep & release plumbing

**Goal:** what was deleted and why, plus the packaging fixes.

| Item | Detail |
|---|---|
| Commits | `d0efe3c` `c84fcbf` `771abcf` `0b472c0` `ba6004f` `34542c7` `917340f` |
| Deleted | `overview.md` `getting-started.md` `illustrated-guide.md` `examples.md` `references.md` `guides/{local-models,eval-config,measured-loop,mcp-tools}.md` |
| Show | the deletion rule: grep for citations from **source**, not just from docs (the outline near-miss) |
| Show | README rewrite + 5 package READMEs |
| Show | `scripts/release.mjs` clean-before-build, the anti-escalation gate, and the minor downgrade |
| Show | `docs/superpowers/specs/2026-07-28-migration-notes.md` — what external repos must change |
| Likely improvement topics | looprun-bench and agentspec migrations still not executed |

**Outcome:** _(fill on completion)_

---

## M8 — Governance

**Goal:** how the repo forces evidence, and whether the ceremony is worth its cost.

| Item | Detail |
|---|---|
| Files | `governance/proofs/2026-07-29-*.md` (7 records), `governance/MATRIX.md` (11 records), `check-record-required` gate, ratchet 29/29 kinds |
| Show | the anatomy of a proof record and what makes one vacuous |
| Show | the governed-path list and how a docs-only sweep tripped the gate |
| Question to Marcos | keep the gate as is, tighten it, or scope it down before external contributors arrive? |

**Outcome:** _(fill on completion)_

---

## M9 — Open decisions

Carried in from the PR; each needs a ruling from Marcos.

| ID | Decision | State |
|---|---|---|
| d5 | add `looprun/eval` + `looprun/server` facade subpaths? (tutorial teaches `@looprun-ai/eval\|server` today) | OPEN |
| d6 | fate of `@looprun-ai/vercel` (throwing stub) | effectively decided — BACKLOG lists the seam as an LP launch gate |
| f1 | surface-locks for the two `./testing` subpaths (~27 unlocked symbols) | PARKED |
| f2 | declaration-emit pins for models/eval/server riders | PARKED |
| f3 | `spec.ts` at 547L — split as its own governed task | PARKED |
| f4 | `GOVERNANCE.md:62` stale gloss + PR-template lines 9/11 | PARKED |
| f5 | ch04 routing anchors not checked in CI | PARKED |
| f6 | external migrations: looprun-bench shim, agentspec `synth-fork`/`extract-fork`, `lint-guard-catalog.mjs` reading a dead `dist/guards.d.ts` | PARKED |

---

## Decisions Log

Every adjustment requested during the walkthrough lands here.

| # | Module | Request | Ruling | State |
|---|---|---|---|---|
| — | — | _(none yet)_ | — | — |

---

## Resume protocol

To continue in a new session:

1. Read this file. The Status board says where we stopped.
2. Read the `Outcome` lines of completed modules — they carry what Marcos already knows.
3. Read the Decisions Log for pending NOW items; those come before new modules.
4. Restart the walkthrough at the first `PENDING` module, same method.
5. Diff commands used throughout:
   `git diff a957339 34542c7 -- <path>` and `git show <sha>`.
