# Phase 6A — the swap

**STATUS: CLOSED.** Every task below is paid; the gate is green repo-wide.

**Design:** `docs/superpowers/specs/2026-08-18-to-be-phases-3-6-build-design.md` §6.
**Goal:** `packages/next/<n>` becomes `packages/<n>`, the previous engine is deleted, the
gates go repo-wide, and R11 is paid in full — README, tutorial lesson by lesson,
governance, the source headers that state the law.

**Gate:** `pnpm -r build` · `pnpm -r typecheck` · `pnpm -r test` green repo-wide ·
`node tests/plain-names.test.mjs` and `node tests/guard-priority.test.mjs` green repo-wide ·
the rename-register gate walking the whole `packages/` tree · bench pins resolve ·
the `agentspec` freeze stamp live.

---

## Global constraints

| constraint | value |
|---|---|
| package names | `@looprun-ai/{core,mastra,models,server,eval}` + the umbrella `looprun` |
| version | `0.20.0` on every moved package, matching the monorepo; the swap ships a minor changeset |
| publishability | every moved package builds `dist` via `tsconfig.build.json` and exports `dist` — the umbrella cannot re-export TypeScript source |
| compatibility | none. No shim, no alias, no deprecated re-export |
| language | English in every byte written to a file |
| documentation voice | AS-IS: what the system IS, with a concrete example; never what it was |

---

## The four scope rulings this plan takes

| # | the fork | the ruling |
|---|---|---|
| 1 | `examples/**` is authored against the deleted engine | `examples/hermes-sim` leaves the workspace carrying a FROZEN stamp (its own phase is last, by standing ruling); the six README-only examples are deleted |
| 2 | `scripts/proofs/**` + `governance/MATRIX.md` + `governance/proofs/**` tally a suite shape the new engine does not use | the apparatus is retired; `governance/GOVERNANCE.md` states the evidence that exists now — 12 proofs, 4 structural lints, 6 facade gates, the certified subject |
| 3 | `scripts/gen-guards-chapter.mjs` renders tutorial 04 from `GUARD_CATALOG` on `@looprun-ai/core/internal` — the new catalog carries no metadata and `internal` is a retired identifier | the generator and its generated snippet are deleted; lesson 04 is hand-written from the catalog table of `docs/superpowers/specs/2026-08-19-authoring-lessons.md` §1 |
| 4 | `looprun-eval` ships `campaign resume`, which §1 of the build design forbids | the eval CLI is deleted; the eval surface is verbs over a run dir, which is how the phase-5 measurement ran |

---

## Task 1 — the move

**Files:** every package directory; `pnpm-workspace.yaml`; root `package.json`.

- [x] Delete `packages/{core,eval,mastra,models,server,vercel}` — the previous engine.
- [x] `git mv packages/next/<n> packages/<n>` for core · eval · mastra · models · server.
- [x] Each moved `package.json`: name `@looprun-ai/<n>`, version `0.20.0`, drop `private`,
      exports point at `dist`, add `build`/`clean` scripts and `files: ["dist"]`, and
      restore the published metadata block (description, keywords, license, repository,
      homepage, bugs) from the deleted package of the same name.
- [x] Add `tsconfig.build.json` per moved package (the shape the deleted packages used:
      `noEmit:false`, `declaration`, `outDir: dist`, `rootDir: src`, excludes `test`).
- [x] Rewrite every `@looprun-ai/next-<n>` specifier to `@looprun-ai/<n>` across sources,
      tests, fixtures and configs.
- [x] `packages/looprun`: umbrella re-pointed at core · mastra · models; the `./vercel`
      export and `src/vercel.ts` deleted.
- [x] `pnpm-workspace.yaml`: drop `packages/next/*`.
- [x] `pnpm install`, then `pnpm -r build && pnpm -r typecheck && pnpm -r test`.

## Task 2 — the gates, repo-wide

**Files:** `packages/core/test/lint/walk.ts`, `tests/plain-names.test.mjs`,
`tests/guard-priority.test.mjs`, `tests/no-bench-drift.test.mjs`, `.github/workflows/ci.yml`.

- [x] `walk.ts`: `TREE_ROOT` becomes the repository's `packages/` root, so the rename
      register bans a retired identifier everywhere, not only in the moved tree.
- [x] `tests/plain-names.test.mjs`: every `ALLOW` row naming `packages/next/**` or a
      deleted path is re-pointed or removed; the gate runs over the whole repo.
- [x] `tests/guard-priority.test.mjs`: same sweep.
- [x] `tests/no-bench-drift.test.mjs`: `SCOPES` re-listed against the surfaces that exist.
- [x] CI: the steps that ran the retired apparatus are removed; the triple gate and the
      three root gates run.

## Task 3 — retire what the new engine does not have

- [x] Delete `scripts/proofs/**`, `governance/MATRIX.md`, `governance/proofs/**`,
      `governance/.artifacts`, and the root scripts that drive them.
- [x] Delete `scripts/gen-guards-chapter.mjs` and
      `docs/tutorial/snippets/04-guards-examples.generated.ts`.
- [x] Rewrite `governance/GOVERNANCE.md`: the evidence is the 12 engine proofs, the 4
      structural lints (layer rule, name gate, no network, purity), the 6 facade gates,
      the three root gates, and the certified subject with its seal.
- [x] Delete `packages/eval/bin/**` and its `bin` entry.

## Task 4 — R11, the documentation

**Source material:** the blueprint's §2 ladder (18 steps), §3 two cards, §4 surface cards,
§5.2 catalog; and `docs/superpowers/specs/2026-08-19-authoring-lessons.md`.

- [x] `README.md` — the hello world of §2 verbatim, the two cards, what installs itself.
- [x] `docs/tutorial/01-concepts.md` … `06-advanced.md` — the ladder, in order, one
      concept per lesson, every code block backed by a compiling snippet.
- [x] `docs/tutorial/snippets/**` — rewritten against the new facade; `pnpm -C
      docs/tutorial/snippets typecheck` green.
- [x] Source headers that state the law: the no-external-model law at the judging seam
      (`Judge`, `buildJudgeInputs`), the two-card contract at `cards.ts`, the rehearsal at
      the consent desk.
- [x] `CONTRIBUTING.md` — the gates a change must pass, as they now exist.

## Task 5 — the examples

- [x] `examples/hermes-sim`: removed from `pnpm-workspace.yaml`, `package.json` renamed to
      `package.frozen.json`, README carrying the stamp: authored against the previous
      engine, regenerated in its own phase.
- [x] The six README-only examples are KEPT: each is a seed for the skill — a purpose
      sentence and a tool surface — and none of them references the engine at all.

## Task 6 — the freeze and the pins

- [x] `agentspec`: a one-line FREEZE commit — "FROZEN — being regenerated for the new
      engine; do not author against this".
- [x] `agentspec-bench`: pins updated to the final package names; the Atlas subject's
      imports resolve; `pnpm -C packages/eval test` reaches the subject.
- [x] A changeset describing the swap.
