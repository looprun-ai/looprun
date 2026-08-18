# TO-BE Phase 4a Implementation Plan — eval's static half + the Atlas subject port

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/next/eval`'s static half (targets · SubjectLoader · Validator · lints) and the Atlas subject ported to the TO-BE vocabulary in `agentspec-bench/subjects/atlas-next`, gated by validate + static lints green — zero spend, no model touched.

**Architecture:** Spec §3 of `docs/superpowers/specs/2026-08-18-to-be-phases-3-6-build-design.md`. A TO-BE subject is a DIRECTORY of TS data modules + `ask/targets.json`; SubjectLoader dynamic-imports it; Validator replays world laws on fresh instances; the port is meaning-preserving with a living mapping table.

**Tech Stack:** TypeScript ESM, vitest; `@looprun-ai/next-eval` depends on next-core + next-mastra (it constructs agents in 4b; the static half needs core only — the dep lands now to keep one manifest).

## Global Constraints

- Everything written is English; AS-IS voice; plain-names count stays exactly 130 in looprun.
- No file calls a third-party model API; validate/lints are zero-spend by construction.
- Branch `to-be-phase-4a` in looprun; bench work lands in `agentspec-bench` on its own commits; the OLD atlas subject stays untouched.
- Triple gate green after every task; `pnpm -C` with absolute paths.

## The subject directory format (fixed here, consumed by every later phase)

```
 subjects/atlas-next/
   subject.ts        exports { spec | specs, contract, world, preset? } — data + the
                     declared world (custom executors are code, so the module is TS)
   cases.ts          exports { cases: readonly ExamCase[] }
   ask/targets.json  the R4·ASK surface — the ONLY model names in the subject
   MAPPING.md        the living old→new table; every PORT-bin fix updates it
```

Multi-agent subjects export `specs: Readonly<Record<string, AgentSpec>>`; a case names its
desk via `agent:` (defaulting to the single spec).

`ExamCase` (contract leaf, defined in Task 2):

```typescript
interface ExamCase {
  readonly id: string;
  readonly split: 'fix' | 'held-out';
  readonly agent?: string;
  readonly red?: string;                       // attack class, when the case is a red probe row
  readonly turns: readonly (string
    | { readonly approve: { readonly tool: string; readonly args?: Readonly<Record<string, Json>> } }
    | { readonly decline: true })[];
  readonly rubric: string;                     // what the in-session judge reads
}
```

---

### Task 1: eval scaffold + targets.ts
**Files:** `packages/next/eval/{package.json,tsconfig.json,eslint.config.js}`, `src/targets.ts`, `test/targets.test.ts`
- [ ] Scaffold copies the mastra package convention (deps: next-core, next-mastra workspace).
- [ ] RED: `loadTargets(path)` parses `{ targets: [{ id?, provider, model, keyEnv|apiKeyEnv, tier?, brakes? }] }` into `ModelTarget[]` + declared extras; a target with no declared provider FAILS loud; nothing is inferred from id spelling; a malformed file throws with the path named.
- [ ] Implement (~80 lines, zod schema); gate; commit.

### Task 2: ExamCase in the leaf + SubjectLoader
**Files:** core `src/contract/vocabulary.ts` (+ExamCase, +Subject), eval `src/subject-loader.ts`, `test/subject-loader.test.ts`, fixture `test/fixtures/mini-subject/`
- [ ] RED against a mini-subject fixture dir (the phase-3 booking world as a subject): load returns { spec(s), contract, world, cases, targets }; structural preflight (a case naming an unknown agent, a missing export, an empty cases list → loud CardError); `provenance()` maps each `@looprun-ai/next-*` package to its resolved build; the byte-identical prompt proof compiles the cards once per PRESET and compares promptParts bytes.
- [ ] Implement (~150 lines); gate; commit.

### Task 3: Validator
**Files:** eval `src/validator.ts`, `test/validator.test.ts`
- [ ] RED: on the mini-subject → zero findings. Planted defects each produce ONE named blocking finding: a case turn approving a tool that is not destructive-or-consented; a disclosure binding whose read cannot accept the held target (SLOT_UNDERIVABLE surfaced through CardCheck); a world preset whose patch names a missing record (world law replay on a FRESH build per preset); a spec naming an off-surface tool.
- [ ] Implement (~200 lines: schema+references walk, CardCheck/AgentFactory dry compile per agent, WorldBuilder build per preset, case-turn walk); findings aggregate, every finding blocks; gate; commit.

### Task 4: lints.ts
**Files:** eval `src/lints.ts`, `test/lints.test.ts`
- [ ] RED: purity(subjectDir) — a regex literal outside the four catalog homes in subject code = finding; proseResidue(compiled) — a spec guard sentence restating an installed deterministic guard = finding; nameGate(root) — retired identifiers with an EMPTY allowlist over the subject dir; census(guards, dumps) — DEFINED with its real key (`installedBecause` + a dump that fires the guard) and proven against synthetic dumps.
- [ ] Implement (~200 lines, AST walk reusing the core lint approach); gate; commit.

### Task 5: the Atlas port — `agentspec-bench/subjects/atlas-next`
The source of truth: `subjects/atlas/{norms,gen,evals,ask}`. Meaning never changes; every
non-obvious translation lands as a MAPPING.md row. Sub-tasks, each committed in the bench repo:
- [ ] **5a — the world card:** `gen/world.ts` (2471 lines) → one `world()` card: records blocks from the world model, reads/writes/destructive entries with form/entity/label/target/simulation from `gen/tools.json`, gates from the world's own refusal conditions, custom executors carried over as `CustomExecutor` functions. `ATLAS_WRITE_TOOLS`-style derived lists die — the card's blocks ARE the list.
- [ ] **5b — the cards:** `norms/contract.ts` → DomainContract (voice, coreInvariants → guards as sentences, limits, secrets/masked, disclosure); each desk dir (`billing,claims,fieldops,rentals,workspace` + fleet) → one AgentSpec (persona, lane tools, per-desk guards). The change-gate narrowing trick in `atlas-agent.ts` dies: the TO-BE factory filters bindings to the lane by construction.
- [ ] **5c — the cases:** `evals/cases.ts` → `cases.ts` ExamCase rows: turns verbatim, the typed approve/decline replacing any scripted code extraction, split fix/held-out preserved from the campaign config, rubric = the case's existing judge text. Case 72 ported byte-for-byte in meaning (the tripwire).
- [ ] **5d — ask/targets.json** copied (gemini-3.1-flash-lite, keyEnv) + `MAPPING.md` written with every rule applied in 5a–5c.

### Task 6: the 4a gate
- [ ] `validate(subjects/atlas-next)` → zero findings; static lints green (purity, prose-residue, name gate, byte-identical prompt across presets); looprun triple gates green; plain-names 130.
- [ ] Merge `to-be-phase-4a` → main (looprun) and commit the subject in the bench repo. Record deviations.

## Deviations

| planned | built | why |
|---|---|---|
| _(filled during execution)_ | | |
