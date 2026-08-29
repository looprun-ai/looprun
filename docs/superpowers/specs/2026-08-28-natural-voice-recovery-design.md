# The Natural-Voice Recovery Program — Design

**Status:** DRAFT — pending owner review
**Repos bound:** `looprun` (engine — the preferred path) · `agentspec` (skill — **LOCKED**, edited only as a last resort and only with the owner's express authorization) · `agentspec-bench` (the exam)

---

## 1 · Goal

Restore the agent to the measured quality bar deterministically, then rebuild the natural
reply so the delivered message is genuinely **natural** — one voice, flowing, in the
operator's language — with every phase validated at maximum rigor before the next begins.

The program starts from the last known-good floor (the delivery path as it stood before the
natural-reply commit) and re-introduces every feature that proved good, in phases, each
behind its own gate.

### The canonical example — the permanent reference

Every reply-quality judgement in this program reads against this pair. The lines are
conversation data in the operator's language (pt-BR here, because the operator wrote pt-BR);
the reply always follows the operator's language.

```
FAILS the bar — counters pass, letters pass, and it is still not natural:

  "Posso cancelar. [CONFIRM-7431] Cancelar a reserva bk_1004 libera
   as duas diárias."

THE BAR — natural:

  "Posso sim — cancelar a bk_1004 libera as duas diárias de 12/08.
   Se estiver de acordo, digite 7431."
```

English gloss: *"I can — cancelling bk_1004 releases both nights of Aug 12. If you agree,
type 7431."* The consent sentence and its live code are woven into one flowing sentence a
person would say at a counter. No engine frame, no bracketed code line, nothing bolted
beneath the prose. Deterministic counters and rubric letters cannot tell these two replies
apart — **only a reader can**, which is why the naturalness bar (§4, layer 3) is a read,
not a count.

---

## 2 · The strategy: a new branch, a surgical revert floor

A new branch off `main`. A phase merges into `main` when it certifies and closes — F0 and F1 landed together after F1's close.

The floor is `git revert` of the three delivery commits (`324f016` the natural reply,
`3fc9554` + `7555943` its proofs) on top of current `main` — not a branch rooted before
them. Micro-tested in a scratch worktree:

```
revert of the 3 delivery commits over main
──────────────────────────────────────────────────────────────────
delivery-writer.ts   reverts BYTE-IDENTICAL to the 23/08 state
finish-desk.ts       reverts BYTE-IDENTICAL to the 23/08 state
prompt-writer.ts     reverts BYTE-IDENTICAL to the 23/08 state
catalog.ts           auto-merges; residue verified = the router's
                     carriedIds/provenance walk, which must stay
turn.ts              ONE conflict: 3 hunks, 29 lines in dispute
                     (router interleaved with natural-reply code)
```

Why revert-on-main and not rebuild-then-merge: the routed house, the chat door and the
routed eval are already under everything the program validates. A branch rooted before the
natural reply would validate phase 1 on a tree without the router, and the later merge
would change the floor **after** its validation — either everything is re-validated
(subject calls spent twice) or the seal is hollow. The same 29 lines of conflict appear
either way; on the revert they appear first, small, and inspectable.

**`desks-describe-themselves` is never merged.** Its one engine feature commit is tangled
(good and bad interleaved in `17868d2`). The gate stamp (`d7ad33b`) and the
`description`/`summary` field return re-implemented clean in phase 3; the branch remains as
reference only and dies at the end of the program.

Known loss carried by the revert, restored by design in phase 1: `figureIsGrounded`
(a measured-good piece — zero false positives) leaves with `324f016` and comes back as part
of the phase-1 delivery design.

---

## 3 · The phases

Each phase gets its own spec + plan (honoring the four-section law: measurement,
implementation, documentation, skill). A phase begins only when the previous phase's gate
is fully paid. No phase edits the skill.

```
F0  THE FLOOR
    revert 324f016 + 3fc9554 + 7555943 on the new branch;
    resolve the 29 disputed lines of turn.ts by hand
    gate: build green · full test suite green · offline replay of the
          existing dumps reproduces the 23/08 delivery byte-exact ·
          delivery files byte-identical to their pre-324f016 state
    cost: zero subject calls

F1  THE NATURAL REPLY, FROM ZERO (its own spec)
    the prose is the delivery · every act sentence knows WHO it is for
    (operator vs model) · the receipt and the negation reach the operator
    by design, never by patch · figureIsGrounded returns ·
    the runner EMITS the deterministic counters beside every run
    (the design registered as agentspec BACKLOG row 1) ·
    AND the confirmation-code contract, folded here from F4: 6 random
    digits · the exact code alone licenses, any language · code plus any
    other text answers "type only the code" · NO <code> has no effect ·
    5-minute validity, cancelling = letting it expire
    gate: counters all zero · natural-100 letters ≥ 95, every letter read ·
          NATURALNESS read letter by letter against §4 layer 3,
          judged on the canonical example of §1 · directed code cases
    cost: replay first · 12-slice · targeted set · full ruler ONCE

F5  THE SKILL'S CORRECTIONS AND THE EXAM'S REPAIRS (owner's ruling,
    2026-08-29, between F3 and F2): backlog-da-skill rows 2, 4, 5, 6, 7
    — the five missing teachings, the four c12 findings, and the exam
    cases 76, 61/62/68 and 48 — each fix validated by directed cases;
    spec: 2026-08-29-f5-skill-and-exam-repairs-design.md

F2  RE-SEAL THE ROUTED HOUSE + CHAT (zero new code; runs LAST, after
    F3 and F5 — one campaign measures the final build against the
    repaired ruler and pays both seals)
    the router, the chat door and the routed eval stand as they are on
    main; their 97/100 seal was paid on the 24/08 delivery and is re-paid
    on the new one
    gate: routed-100 ≥ 95, every letter read, lanes checked
    cost: replay first · targeted subset · full routed ruler ONCE

F3  THE DESK DESCRIBES ITSELF + THE GATE STAMP, CLEAN
    re-implement on the new floor: `description` (routing line, long, verbs)
    + `summary` (comma-free, the house's own refusal) replacing `handles` ·
    unknown desk fields refused by name and line · the emitted gate carries
    the declaration's hash stamp
    THIS PHASE CLOSES THE SYNC BREAK of §5 — until it ships, no blind
    authoring round runs
    gate: repo tests green · emit round-trip proofs · replay
    cost: near-zero subject calls

F4  — folded into F1: the ask surface is rebuilt there and certified
    once, so the code contract ships with it (the F1 spec, §3b)
```

**The skill during the program:** untouched through F0–F3. After F1 + F3 land, ONE
alignment proposal is presented for the owner's authorization (candidates in §6.4:
restoring the A/B law, pointing the pages at the runner-emitted counters). Nothing is
edited before that word.

---

## 4 · The naturalness bar — three layers, all required

| layer | what it checks | who pays it | cost |
|---|---|---|---|
| 1. deterministic counters, **emitted by the runner** on every run | one call at two outcomes = 0 · empty deliveries = 0 · successful-read lines in a delivery = 0 (ask-turn pure-text quotes excepted) · raw JSON = 0 · reply language = the operator's on every model-closed turn · engine frames leaked into prose = 0 | the engine, every run | free |
| 2. rubric letters | ≥ 95 of 100, **every** letter read — never sampled, never counted mechanically | the agent in the session | free (reading costs nothing) |
| 3. **the naturalness read** | letter by letter against a written rubric: one voice · flows like a person at a counter · consent sentence and code woven word for word (the §1 canonical example) · no repetition · no contradiction · negations preserved · nothing bolted beneath the prose | the agent in the session | free |

Layers 1 and 2 can both pass on a reply that is still not natural — the §1 pair proves it.
Layer 3 exists because only a reader can tell the pair apart. A phase certifies only when
all three hold on the same run.

---

## 5 · The sync break (standing finding — closed by F3)

```
skill HEAD teaches:    description: / summary:   (zero occurrences of `handles`)
engine main accepts:   handles:                  (description exists only on the
                                                  unmerged branch)

⇒ a blind author running the skill TODAY against engine main is REFUSED
  at emit. No blind authoring round runs until F3 ships the rename.
```

---

## 6 · The audit — everything since the baseline, evaluated

The record the program was designed from. Verdicts: **KEEP** (stays as is) ·
**REBUILD** (the requirement survives, the code is replaced in F0/F1) ·
**REMOVE** (marked for removal) · **RE-SEAL** (code stays, its number must be re-paid).

### 6.1 · Engine, 24/08

| commit | what it is | verdict |
|---|---|---|
| `324f016` the natural reply | prose delivers, `covers()` fills gaps by ids/figures | **REBUILD** — the goal survives; the mechanism deleted 18 of 84 disclosures, 8 losing a negation |
| `3fc9554` `7555943` delivery proofs | tests of the `covers()` contract | **REBUILD** with F1 |
| `34a3c73` + `968751b` pick | a needs alias binds one row of a list read | **KEEP** — closed case 18; deterministic; orthogonal |
| `861b97b` + `b3c30e6` thinking off | off by default; the meter reads thought tokens | **KEEP** — standing law; measured at the bar with off |
| `7f12d91` per-turn cost in the dump | instrumentation | **KEEP** |

### 6.2 · Engine, 25/08 — the routed house (all on main)

| cluster | commits | verdict |
|---|---|---|
| core: front desk + notMine door | `fde77a1` `213f325` `763e0e6` | **KEEP + RE-SEAL** |
| emit: handles line | `efa8350` `1bbae55` | **KEEP** (renamed in F3) |
| mastra: the house | `f801f8c` `b87c3dc` `67cd037` `5b92c8a` `0960be7` `ba46f7e` `e857f56` `4957243` `0dba41c` `df49053` | **KEEP + RE-SEAL** |
| server + CLI: the chat door | `9200c77` `e303064` `dae89ef` `19cc301` | **KEEP** |
| eval: routed cases | `f398bf9` `f47f6f8` `54eeb5d` `b5b2b8d` | **KEEP** |
| provenance | `2450fe1` `c871f47` | **KEEP + RE-SEAL** |

The whole cluster was ruled by the owner and sealed at routed 97/100 + unpinned 96/100 —
paid on the 24/08 delivery, hence RE-SEAL in F2.

### 6.3 · Engine, the unmerged branch

| part | verdict |
|---|---|
| `17868d2` ① the receipt always reaches the operator | **REBUILD** — the requirement is critical; today it is a patch over `covers()`; in F1 it is the design |
| `17868d2` ② the bare-frame filter | **REMOVE** — deletes frameless engine refusals: `openBookng — not-done (no tool by that name)` vanishes and "the booking is confirmed" ships alone |
| `17868d2` ③ the `rich` parameter removal | **REMOVE** — unmeasured collateral |
| `17868d2` `description`/`summary` + emit validation | **REBUILD CLEAN** in F3 (owner-ruled: `teammates` is dead) |
| `d7ad33b` the gate hash stamp | **REBUILD CLEAN** in F3 (cherry-pick or re-apply) |

### 6.4 · The skill, commit by commit — what removal would do

The skill is LOCKED; these verdicts are the review record, not edits.

| commit | what it does | if removed today | verdict |
|---|---|---|---|
| `ea30c08` | `before` woven word for word + "write the tense to flow" | authors write headline/list `before` sentences again — naturalness falls at the source, since the tense enters the reply verbatim | KEEP |
| `a4362e4` | removes the "the reply is the desk's prose" law row + engine mechanics | reverting restores the law — F1's exact direction, but describing an engine that does not exist yet | restore AFTER F1, with authorization |
| `0042828` | removes the A/B wording law | reverting brings back a lesson measured twice (one byte flips a case 3/3 → 0/3); today a blind author ships wording unmeasured | **restore candidate** (owner's word) |
| `bea4040` | removes the two-halves bar (the counters) | reverting restores the teaching without engine support; the ruled home is the runner (F1 builds it, the pages then point) | F1 resolves via the engine |
| `a215252` | compression + `figureIsGrounded` floor row | loses a real floor row, regains a paragraph | KEEP |
| `2a111a4` → `7d81fa1` → `c96300e` | stop-rule churn ending at "paid or dry, bar 100, one home" | removing all three returns the bar to 95/two-reps — against the ruling; the latest blind loop ran under the current rule | KEEP the third |
| `b62c867` | certify 1.0 in the ship snippet | snippet contradicts the bar | KEEP |
| `4e774b1` | thinking off by default | authors do not know the default; thinking returns silently, billed | KEEP |
| `a74506b` | the pick door | the engine keeps pick with no page — every blind author relearns it from refusals (case 18 again) | KEEP |
| `c4714b7` | BACKLOG row 1: counters emitted by the runner | loses the ruled register that seeds F1 | KEEP — F1's seed |
| `7c56663` | the routing line names ACTS, never nouns + the none law | noun lines return ("the depot: drivers, crates" loses "who is on tomorrow's delivery?") — a measured family | KEEP |
| `98edaef` | the field on the spec sketch | authors declare the line late, out of phase | KEEP |
| `a95d7c6` | route mismatch = a LINE defect in the T-loop | routing failures lose their repair lane; authors drift into conduct/case edits (the exact drift of the terrible routed rung) | KEEP |
| `7fa975a` | the magnet law + the stray-literal clause | topic-scoped clauses return (a widened line kills the none refusal — measured); a stray confirmation literal again becomes a repeated act, a manufactured ask, or a code read as an id | KEEP |
| `2c6c199` | minted-id owes an `after` + `description`/`summary` teaching + the asked-read clause | TANGLED: removal loses the minted-id law (good, engine-independent) and undoes the rename (which would sync with main today) | KEEP; F3 closes the sync |
| `50449dd` | own-domain examples + the summary comma rule + the loop dries over LINES | the bench domain leaks back into the pages — unacceptable | KEEP |

---

## 7 · Critical premises (binding on every phase)

1. **The engine is the preferred path.** The skill is edited only for what is impossible
   without it, only after the engine path is exhausted, and only with the owner's express
   authorization.
2. **Maximum-rigor validation.** A phase certifies only with every gate item confirmed:
   letters read one by one, all rubric items checked, counters at zero, the naturalness
   read done. "≥ 95" means ≥ 95 verified in fact, never inferred.
3. **Subject calls are the scarce resource; reading is free.** Replay offline first; the
   12 → 40 → 100 ladder; targeted subsets after repairs; the full ruler once, at the end
   of a phase, as certification. Never re-run to confirm what reading a dump answers.
4. **The next phase starts only when the current one is 100% validated.**

---

## 8 · Before F0 — one obligation

Commit the `atlas-c18` working state in `agentspec-bench` (modified declaration, cards,
gate, `REPAIR-REPORT.md`, the loop directories): it is the blind author's recovery map and
exists nowhere else.
