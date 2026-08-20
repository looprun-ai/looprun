# Apply the Review Resolution to Blueprint v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amend `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md` so it states the
design of `docs/superpowers/specs/2026-08-17-review-to-be-resolution-design.md` (THE SPEC
below), pass the amended blueprint through the §11 adversarial verification, and stamp the
`REVIEW-TO-BE.md` rows.

**Architecture:** Documentation-only. One editing pass over the single blueprint file,
section-grouped into tasks that mirror THE SPEC's §10 application map; each task ends with
a scoped dead-name check; a global sweep simulates the name gate by hand; a 3-judge
adversarial workflow verifies the result before the final commit. No engine code — the
engine build stays behind `docs/superpowers/refactoring.md` phase 1.

**Tech Stack:** Markdown, git, grep; the Workflow tool for the verification judges.

## Global Constraints

- Every byte written to a file is ENGLISH (chat replies may be Portuguese).
- AS-IS voice: the blueprint states what the design IS — no "was/previously/no longer",
  no citing measurements or tests as evidence. The ONE exception is the rename register
  section, which is a dictionary of old → new by design.
- THE SPEC (`2026-08-17-review-to-be-resolution-design.md`) is the content authority; where
  this plan and THE SPEC disagree, THE SPEC wins.
- The GOLDEN RULE outranks style: every authoring-surface name must read to a six-year-old.
- THE MOTHER RULE: never duplicate functionality — no amendment may reintroduce a second
  mechanism for a settled job.
- Case 72 is THE TRIPWIRE: the §13.2 row "MUST NOT MOVE" stays verbatim.
- The blueprint stays ONE file; no section is split out.
- Dead names (THE SPEC §9 register, both columns' old names) may appear ONLY inside the
  blueprint's rename-register section. Anywhere else = task failure.
- Engine-internal names proposed by this plan (not user-reviewed): `SurfaceGate`
  (ex-IntakeGate), `factsFromWorld` (ex-intakeFromWorld), `SurfaceFacts`/`ToolFact`
  (ex-CertifiedIntake/IntakeTool, engine-internal only). The Task 11 golden-rule judge
  validates them; a failed name gets renamed there.
- Line numbers cited in tasks are PRE-AMENDMENT anchors; earlier tasks shift later
  ranges — locate by section heading, not by line, once editing has started.

---

### Task 1: Baseline commit + §1 thesis + §3 cards

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md:19-46` (§1), `:96-227` (§3)

**Interfaces:**
- Produces: the `Guard` shape (`name`, `rule`, `tool`, `on` REQUIRED 4-phase, `deny(ctx)`,
  `judgeQuery`, `judgePolicy`), `LlmParams`, card fields `guards`/`rewrites` — every later
  task uses exactly these names.

- [ ] **Step 1: Commit the pre-amendment v3 as the diffable baseline**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): blueprint v3 baseline, pre-resolution"
```

- [ ] **Step 2: Amend §1 (thesis)**

In lines 19–46: replace "the pipeline-generated, gate-approved certified intake in Path B"
with "the `mcpWorld` card's own data blocks for a live surface (§4)"; replace the §11
pointer sentence "ONE rule field name (`rules`), ONE rule shape (`Rule`)" wording with
"ONE guard field name (`guards`), ONE guard shape (`Guard`)". Keep the desk paragraph.

- [ ] **Step 3: Replace §3 with the SPEC §2 card shapes**

Replace the §3 code block (`AgentSpec`, `DomainContract`, `Rule`, `Disclose`, `Wording`,
`Limits`, `Sampling`) with THE SPEC §2 blocks verbatim (`AgentSpec` with
`guards`/`llmParams`, `DomainContract` with `guards`/`rewrites`, `Guard`, the phase table,
the four ctx interfaces, `LlmParams`). Keep `Disclose`, `Wording` (engine sentences +
status words only), `Limits` as they are, updating any `Rule`/`say` mention inside their
doc comments. Rewrite the "Where checks … live" table to say `guards`, and the rule-home
question over `spec.guards` / `contract.guards`.

- [ ] **Step 4: Scoped dead-name check**

Run: `sed -n '19,240p' docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md | grep -nE "\bRule\b|\bsay\b|Sampling|sampling|\bfails\b|'call'|CallView|ReplyView|\brules\b"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): v3 §1+§3 — the Guard shape, four phases, LlmParams"
```

---

### Task 2: §4 — the surface (world / mcpWorld / liveWorld)

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md:229-303` (§4)

**Interfaces:**
- Consumes: Guard/card names from Task 1.
- Produces: `world()` · `mcpWorld()` · `liveWorld()`; config
  `{ spec, contract, world, model }`; certification embedded in the generated module;
  NO `intake`/`toolDefs`/`volatile` anywhere.

- [ ] **Step 1: Replace §4 with THE SPEC §3**

Replace the whole §4 (the `IntakeTool` block, Path A/B/B-sugar wirings) with THE SPEC §3:
the two side-by-side factories (code verbatim from THE SPEC), the four bullets
(sibling factories · deny-by-default · gate = code review of the generated `mcpWorld`
module with embedded certification · `proxy` both forms, `volatile` deleted), and the
`liveWorld({ tools, …blocks })` sibling line. State the internal compiled table once:
"the engine compiles the blocks into an internal fact table (`SurfaceFacts`, one
`ToolFact` row per tool) — no authoring name exists for it."

- [ ] **Step 2: Amend §5.4 (`world.ts`) to home the new cards**

In the §5.4 `world.ts` entry: beside `WorldCard` and `world(card)`, add `McpWorldCard` /
`mcpWorld(card)` and `LiveWorldCard` / `liveWorld(card)` — remote entries carry
`label`/`target`/`secrets`/`proxy`/`simulation`/`does`, no action forms, no `records`;
`factsFromWorld` derives the same internal `SurfaceFacts` from all three card kinds.
`WorldBuilder`/`WorldGates`/`PatchDesk` stay untouched.

- [ ] **Step 3: Scoped dead-name check**

Run: `sed -n '229,320p' docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md | grep -nE "intake|IntakeTool|toolDefs|volatile|certification:"`
Expected: hits only for the embedded-certification sentence (`certification` as a word may
appear; the config key `certification:` may not).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): v3 §4+§5.4 — world/mcpWorld/liveWorld, intake concept removed"
```

---

### Task 3: §5.1 — the contract leaf vocabulary

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md:323-490` (§5.1)

**Interfaces:**
- Produces: `InputCtx`/`CallCtx`/`ResultCtx`/`ReplyCtx` (each with `userText`; Call/Result
  with `state`), `InstalledGuard` (`home: 'spec' | 'contract' | 'engine'`, `kind`,
  `judgePolicy`), `Rewrite`; `Verdict` keeps `owe` and `restate`.

- [ ] **Step 1: Amend the `vocabulary.ts` block**

- Replace `CallView`/`ReplyView` with the four ctx interfaces from THE SPEC §2, including
  the `state` note (frozen snapshot where a RecordsPort exists; a state predicate on a
  stateless surface is a construction error).
- Delete the comment "views carry acts and model output only — never user text"; replace
  with: "every ctx carries the user's text as a string for EXACT-LITERAL search — a guard
  never interprets it (R6.5)."
- Replace `InstalledRule` with `InstalledGuard` exactly as THE SPEC §7 defines it.
- Add `export interface Rewrite` — `{ name: string; apply(text: string): string }` with
  the doc comment "a rewrite rewrites the outgoing reply; it never decides (§5.2 factories:
  purgePattern · maskPattern · swapTerms)".
- In `Question`, keep the masked display call; note the sibling-question law's home is
  ConsentDesk (§5.3).
- Update `StepInput.sampling` → `llmParams: LlmParams`; rename the `Sampling` interface to
  `LlmParams` (one home, re-exported for authors).

- [ ] **Step 2: Scoped dead-name check**

Run: `sed -n '323,495p' docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md | grep -nE "CallView|ReplyView|InstalledRule|Sampling|'agent'|'domain'|IntakeTool|CertifiedIntake"`
Expected: no output (the `ToolFact`/`SurfaceFacts` internal names replace the intake types).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): v3 §5.1 — ctx types with userText, InstalledGuard, Rewrite"
```

---

### Task 4: §5.2 — AgentFactory and the catalog

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md:492-577` (§5.2)

**Interfaces:**
- Consumes: `Guard`, ctx types, `SurfaceFacts`.
- Produces: `AgentFactory.governed(cfg)` / `AgentFactory.ungoverned(cfg)`;
  `SurfaceGate`; the 20-species catalog + 3 rewrites; `CardCheck` codes incl.
  `GUARD_BOTH_DENY_AND_JUDGE`.

- [ ] **Step 1: Rewrite the catalog entry**

Replace the `catalog.ts` paragraph with THE SPEC §5: the species table (8 deterministic +
4 judged + 2 schema-auto + 2 destructive-auto + 4 floor), the factory signatures block
(THE SPEC §5.1 verbatim: `onlyAfter` with derived remedy, `maxCalls` with scope+reason,
`argAbsent`, `precondition` with `tool | [tools]` — DOCUMENT the set form prominently —,
`checkResult` with the predicate, `mustAccountFor({ records, status })`, `valueFromUser`,
`blockPattern`), the judged-factory table (THE SPEC §5.2 with the four questions), and the
rewrites trio (THE SPEC §6). State the two laws beside the table: "nothing judged installs
itself" and "regex exists only inside blockPattern/purgePattern/maskPattern".

- [ ] **Step 2: Rename the compile classes**

`Compiler` → `AgentFactory` with `governed(cfg)` / `ungoverned(cfg)` (THE SPEC §8);
delete the `controlCompile` paragraph — replace with: "`AgentFactory.ungoverned` is the
one birthplace of the ungoverned build: enforcement disarmed, prompt parts byte-identical;
`UngovernedAgent` (§5.5) is its only public door." `IntakeGate` → `SurfaceGate` (same
three checks over the `mcpWorld`/`liveWorld` card); `intakeFromWorld` → `factsFromWorld`.
In `CardCheck`, rename `RULE_BOTH_DENY_AND_JUDGE` → `GUARD_BOTH_DENY_AND_JUDGE`, add
`GUARD_PHASE_MISSING` (on omitted) and `GUARD_JUDGE_PHASE` (judgeQuery with on ≠ 'reply').
The auto-install list in `AgentFactory`: consent (`confirmFirst`) + `maxDestructive` +
the floor four — and NOT the judged questions (declared only).

- [ ] **Step 3: Scoped dead-name check**

Run: `sed -n '492,600p' docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md | grep -nE "Compiler|controlCompile|IntakeGate|intakeFromWorld|readFirst|neverCall|resultInvariant|consentRequired|RULE_BOTH"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): v3 §5.2 — AgentFactory, the 20-species catalog, rewrites"
```

---

### Task 5: §5.3 run/ + §8 mechanism homes

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md:579-896` (§5.3), `:1435-1447` (§8)

**Interfaces:**
- Consumes: everything above.
- Produces: `Rulebook.guards()`, ConsentDesk sibling-question + (tool, target) closure
  laws, `HonestyCheck` structural lie floor, `Judge` running declared judged guards,
  `DeliveryWriter` running rewrites after the masker.

- [ ] **Step 1: Amend the run/ classes**

- `Engine.rules()` → `guards()` (and the R1.5 comment).
- `Rulebook`: `rules()` → `guards()`; "judged rules" → "declared judged guards".
- `ConsentDesk`: replace the `keyWithout(volatile)` dedupe sentence with THE SPEC §4 laws:
  identical re-proposal → the SAME question and code; a differing re-proposal → a SIBLING
  question, the earlier stays open, every delivery reprints every open code; on licensed
  execution EVERY open question of the same (tool, target) closes, target-less closes by
  tool; a same-turn re-proposal for an executed (tool, target) → `restate` with the real
  result. Delete `keyWithout` from the `CanonicalCall` listing in §5.1 if still present
  (it is — remove the method there too).
- `Judge`: "the ONLY model-judged escape … deterministic denies never see user text" →
  "guards read the user's text only as literals; MEANING is judged here, on the session's
  own seat (R6.5)". `fails` → `judgePolicy`; UNREADABLE priced by `judgePolicy`.
- `HonestyCheck`: name the structural lie floor as the always-on half; `lieCheck()` is the
  declared judged half (points at §5.2).
- `DeliveryWriter`: add "runs the contract's `rewrites` (purge · mask · swap) AFTER the
  masker, over already-approved text".
- `PromptWriter`/`StepInput`: `sampling` → `llmParams`.

- [ ] **Step 2: Amend §8 (mechanism homes R5.1–R5.8)**

Row R5.1: the consent laws of THE SPEC §4 (sibling questions, (tool, target) closure).
Row R5.2: `catalog.readFirst` → "`catalog.onlyAfter` (read prerequisite → the `owe`
verdict)". Row R5.6: `spec.rules`→`spec.guards` wording; "judged" = declared factories +
hand `judgeQuery`. Update any `say`/`Rule` word in the eight rows.

- [ ] **Step 3: Scoped dead-name check**

Run: `sed -n '579,900p;1435,1450p' docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md | grep -nE "keyWithout|volatile|\brules\(\)|readFirst|\bsay\b|\bfails\b|sampling"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): v3 §5.3+§8 — consent without volatile, guards(), rewrites in delivery"
```

---

### Task 6: §5.5–§5.8 facades/eval + §6 layers + §7 diagram

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md:962-1325` (§5.5–5.8), `:1328-1365` (§6), `:1369-1431` (§7)

**Interfaces:**
- Produces: `UngovernedAgent` (public), `ControlStrip` deleted, lints per the new laws.

- [ ] **Step 1: Amend §5.5 (mastra)**

`LoopRunConfig` = `{ spec, contract?, world, model }` (world | mcpWorld | liveWorld card;
`tools`/`mcp`/`intake`/`certification` keys deleted). Add the `UngovernedAgent` class
beside `LoopRunAgent` (THE SPEC §8): same closed config, byte-identical prompt,
enforcement disarmed, `guards()` prints the same census (the class name is what states
the disarming — no extra field). `rules()` → `guards()` in the listing.

- [ ] **Step 2: Amend §5.8 (eval)**

Delete the `ControlStrip` entry — `ExamRunner` constructs `UngovernedAgent` directly for
the `ungoverned` variant; the variant vocabulary is `'governed' | 'ungoverned'`
everywhere. `lints.ts`: the name gate points at the amended register (§11); the purity
lint allows regex ONLY inside `blockPattern`/`purgePattern`/`maskPattern` sources; the
census keys on `installedBecause` unchanged.

- [ ] **Step 3: Amend §6 + §7**

§6: remove the `controlCompile` deep-path exception line (no deep path exists); L2 line
names `AgentFactory · SurfaceGate · catalog · Wordings · factsFromWorld`. §7 diagram:
`Rulebook.checkCall` labels unchanged except band names; step 5 mentions
`Judge.run(declared judged guards …)`; the delivery step adds "rewrites".

- [ ] **Step 4: Scoped dead-name check**

Run: `sed -n '962,1431p' docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md | grep -nE "ControlStrip|controlCompile|control\b|intake|certification:|toolDefs|rules\(\)"`
Expected: no output (`'ungoverned'` replaces the variant word everywhere).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): v3 §5.5-§7 — UngovernedAgent public, ControlStrip deleted, one config"
```

---

### Task 7: §2 hello world + the ladder

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md:48-93` (§2), `:1593-1601` (§12)

- [ ] **Step 1: Amend §2**

The hello-world code keeps its shape (world + spec + model). Rewrite the ladder sentence
per THE SPEC §7: `agent.guards()` at lesson 3; the lesson list renumbers (one concept per
lesson stays the law; the exact count is not stated); `sampling` lesson → `llmParams`; a
`rewrites` lesson added; the exam last. `rules()` → `guards()` in the lesson naming.
Replace "Production swaps `world:` for `mcp: { url, headers }` plus the certified
`intake` (§4)" with "Production swaps `world(...)` for `mcpWorld(...)` (§4) — the config
line does not change."

- [ ] **Step 2: Amend §12 (construction chain)**

One paragraph: `new LoopRunAgent(cfg)` → assembly resolves the world card
(`factsFromWorld` / `SurfaceGate` for live surfaces) → `AgentFactory.governed` →
`Engine.create` … (names only; the chain's shape is unchanged).

- [ ] **Step 3: Scoped dead-name check**

Run: `sed -n '48,95p;1593,1605p' docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md | grep -nE "intake|sampling|rules\(\)|Compiler"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): v3 §2+§12 — guards() at lesson 3, one config line"
```

---

### Task 8: §11 register + §13 maps + §15 compliance

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md:1563-1590` (§11), `:1605-1673` (§13), `:1693-1824` (§15 + checklist)

- [ ] **Step 1: Replace §11 with THE SPEC §9**

The full amended register (old → new, including the inverted `'ungoverned' vs 'control'`
row now reading `control` → `ungoverned`), plus the unchanged AS-IS bans, plus the gate
statement: empty allowlist, whole-identifier matching, every build and release.

- [ ] **Step 2: Amend §13**

§13.1 rows: "regex-validation" gains "the one exception: the author's declared pattern in
`blockPattern`/`purgePattern`/`maskPattern`"; "custom-guard-abuse" row names the written
admission + the census `custom` label. §13.2: UNTOUCHED except `readFirst(...)` example →
`onlyAfter(...)` in rows 62/80 wording; case 72 row stays verbatim. §13.3: delete risk
row 10 (volatile); add "the four judged factories are opt-in — undeclared = uninstalled
coverage, priced in the skill's authoring guidance"; renumber.

- [ ] **Step 3: Amend §15**

Rows to rewrite (pointer text only, PASS stays): R1.5 (`guards()`), R2.3 ("the ungoverned
variant is a separate explicit class — no option on the governed constructor weakens
governance"), R3.x rows naming intake → the mcpWorld card + `SurfaceGate`, R5.1 (consent
laws), R6.5 ("every ctx carries userText for literal search; meaning only via
judgeQuery"), R6.7 (declared judged factories; no self-installed judged set), R7.4
(`llmParams`), RENAME (points at the amended §11). Checklist walk: update the same
vocabulary (`controlCompile` line → `AgentFactory.ungoverned` / `UngovernedAgent` class
identity; "views carry no user text" line → the literal-search law).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): v3 §11+§13+§15 — amended register, maps and compliance"
```

---

### Task 9: The global dead-name sweep (the name gate, run by hand)

**Files:**
- Read: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md`

- [ ] **Step 1: Sweep**

Run (each old name; expected: hits ONLY inside the §11 register section):

```bash
grep -nE "\bRule\b|InstalledRule|\bsay\b|CallView|ReplyView|\bjudge:|\bfails\b|Sampling|resultInvariant|\bintake\b|IntakeTool|CertifiedIntake|toolDefs|controlCompile|ControlStrip|\bcontrol\b|Compiler|IntakeGate|intakeFromWorld|\bvolatile\b|keyWithout|readFirst|neverCall|consentRequired|requiresBefore|forbidThisTurn|degenerationGuard|jargonScrub|llmCheck|'agent'|'domain'|outcome:" \
  docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
```

For every hit outside the register: fix the line (THE SPEC §9 is the dictionary), re-run
until clean.

- [ ] **Step 2: Consistency read**

Read the amended blueprint end to end once. Check: every factory named in §5.2 appears in
the census discussion with the same name; `on` phases spelled identically everywhere;
`guards()`/`guards` never `rules`; the species count in any sentence says 20 (+3 rewrites).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs(spec): v3 dead-name sweep clean"
```

---

### Task 10: Stamp the REVIEW-TO-BE rows

**Files:**
- Modify: `docs/superpowers/specs/REVIEW-TO-BE.md`

- [ ] **Step 1: Stamp every row**

Change each row's status: rows already `DECIDED` → `RESOLVED (design §N)`; rows `OPEN`
(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11) → `RESOLVED (design §N)` using THE SPEC §12 map for
the section number. No row text rewrites — status column only.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/REVIEW-TO-BE.md
git commit -m "docs(spec): REVIEW-TO-BE rows stamped RESOLVED against the design"
```

---

### Task 11: Adversarial verification, fixes, final commit

**Files:**
- Read: the amended blueprint, THE SPEC, `docs/superpowers/requirements.md`
- Modify: the blueprint (fixes only)

- [ ] **Step 1: Launch the three judges (one Workflow, parallel)**

Each judge reads the amended blueprint + its authority and returns findings
`{ section, problem, mustFix }`:

- **golden-rule judge** — authority: the GOLDEN RULE. The six-year-old test on EVERY
  authoring-surface name and field in the amended blueprint, including the plan-proposed
  internal names (`SurfaceGate`, `factsFromWorld`, `SurfaceFacts`, `ToolFact`).
- **charter judge** — authority: `docs/superpowers/requirements.md` (R6.5/R6.6 as corrected).
  Row-by-row: does any amended section violate a charter row; is any §15 pointer now
  false.
- **atlas judge** — authority: §13.2. The fifteen rows still hold under the amendments;
  case 72 verbatim; the consent-transcript risk (§13.3) still priced.

- [ ] **Step 2: Fix every mustFix inline; re-run the judge whose findings changed**

Repeat until zero mustFix. Non-mustFix findings: record them at the end of
`REVIEW-TO-BE.md` as new rows for the user.

- [ ] **Step 3: Final commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md docs/superpowers/specs/REVIEW-TO-BE.md
git commit -m "docs(spec): blueprint v3 amended per the review resolution, adversarially verified"
```
