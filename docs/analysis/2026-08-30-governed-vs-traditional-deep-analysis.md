# Governed vs traditional — the deep comparison

Ten-agent adversarial workflow (4 evidence readers → 4 opposing lenses → design + red-team),
every claim file-backed; the five load-bearing claims re-verified by hand in session against
the dumps and sources they cite.

The question under test: the governed pipeline (spec + contract + T-loop + looprun engine)
against the traditional process (a bespoke hand-written agent per subject, free edits at
every layer). Subjects: harborpoint, trialworks, atlas.

---

## 1 · The corrected ledger

Three subject pairs exist, not two. The exams are byte-identical per pair (case ids, turns,
rubric text, split labels), the target model is the same everywhere
(`google/gemini-3.1-flash-lite`, temperature 0, thinking off), and the trad backend is a
bundled build of the looprun world runtime — same records, same refusals.

```
SUBJECT          GOVERNED              TRADITIONAL           READING
---------------  --------------------  --------------------  ---------------------------
atlas (100)      92/100 strict,        78/100 final          governed +14, on the HARDER
                 router choosing       (v1 87 undeployable:  path (trad reads the desk off
                 the desk              cloned-world          the frozen case file:
                                       rehearsal)            runner.ts:103)
trialworks (29)  29/29 twice           29/29                 TIE — and the trad build is
                 (~9 T2 rounds)        (5 rounds)            unshippable (English SYNONYMS
                                                             regexes in provenance.ts)
harborpoint (33) 28/33, mode of 3      33/33, n=1            trad +5 — the most CONFOUNDED
                 full runs, rotating   (final run is a       pair of the three (see §5)
                 fail set (12 rounds)  byte-identical
                                       replay of r3)
```

Runs: governed `harborpoint/subjects/harborpoint/test/r11..r12-*`, `trialworks runs/t3-r8·t2-r9`,
`atlas-c20/test/2026-08-30-cert`; traditional `harborpoint-trad/runs/final`,
`trialworks-trad/runs/final`, `atlas-traditional/runs/v2-no-clone/final`.

**The headline the scores actually support:** governed wins the one clean comparison,
ties the second, and loses only the pair where every confound points the same way.
"Governed produces worse results" is not what the ledger says. What it does say:
**governed is slower (2–4× the rounds) and dearer (2.3–2.6× campaign cost) everywhere.**

---

## 2 · Why the traditional loop converges in 3–5 rounds

Each reason is a measured mechanism, not a style difference:

| # | mechanism | the evidence |
|---|---|---|
| 1 | **Every layer is editable every round** — prompt text, guard code, policy tables, runner code | harborpoint-trad r2 edited guard + prompt + runner in one round, net +3, kept |
| 2 | **Per-verdict must-state directives** — each gate verdict ships literal strings the reply must contain, checked in-conversation, redriven on the same prefix | `guard.ts:169 __internal_directive.must_state`; bought +5 (hp r2) and +8 (tw r2) |
| 3 | **The answer key was in the box** — the exam's `covers:` field names the governed guard identifiers verbatim; the builder's constant is literally `CONFIRM_FIRST` | `given/cases.ts` (`confirmFirst:endMooring`), `policy.ts:34` |
| 4 | **Exam text transcribed into the prompt** — including a held-out case, verbatim, with the wrong answer named | `prompt.ts:25-27`: “Operator: ‘What would a week on B-01 cost Sea Ranger?’ … You do NOT state 364.” |
| 5 | **The consent mechanism itself was loosened to pay a case** — a `?` in the previous reply licenses the act with ANY arguments | `agent.ts:119` + `guard.ts:81-84,242`; REPORT.md concedes it |
| 6 | **One agent, no router** (harborpoint) — the 3 routed cases are plain reads | `prompt.ts:3-4` “One surface serves all four of its counters” |
| 7 | **Net-positive round rule** — an edit that pays 5 and breaks 2 is kept | METRICS §3, “Net +3, so the edit was kept” |

The governed loop forbids 1, 3-eq, 5 and 7 by design (a round that pays one line and breaks
another “has paid nothing”), lacks 2 as a checked mechanism (see §4), and ran without 6.

---

## 3 · Where the 13 unpaid governed points actually live

Attribution over every persistent failure (harborpoint 5 rotating + c20 8), each classified
by reading its dump and the file it implicates:

```
CLASS            HARBORPOINT   C20    TOTAL   THE SHAPE
---------------  -----------   ----   -----   -------------------------------------------
ENGINE                3          2      5     4 of 5 are ONE component: the ReplyComposer
DECLARATION           0          3      3     channels that EXIST, unused (c20 68 `after`)
LADDER GAP            2          1      3     the real cost of lock (a)
RUBRIC                0          2      2     pinned tool with no anyOf (c20 63/80)
MODEL VARIANCE        0          0      0     not an independent cause: every "flap" is an
                                              unenforced wall sentence underneath
---------------  -----------   ----   -----
                      5          8     13     THE LOCKS COST 3 OF 13 — not 13 of 13
```

**The composer seam, in one case** (`test/r12-final-governed/dumps/a-week-costs…json`,
re-read by hand):

```
what the guard did       figureIsGrounded FIRED: "the message states 364 and no
                         record this turn carries it"
what the desk then wrote finish.message: "…a nightly rate of 52. For a stay of seven
                         nights, the total is settled on the invoice by the harbour
                         office."                          ← the author's fix WORKED
what the operator got    delivered text (delivery.by: composer, facts: []):
                         "…a daily rate of 52, meaning a week-long stay would
                         cost 364."                        ← a SECOND model call re-derived it
what checked that text   gateMisses(facts=[], …) = []  — presence-only, vacuous
```

The T-REPORT attributes this case to a missing arithmetic rung. The dump refutes that: the
rung fired and won; the composer undid it. Same component on c20: cases 95 and 37 had the
required sentence in `finish.message` and the composer DELETED it; `note-in-record` and
`end-a-season` closed through `engineClose`, which runs no reply guard and no judged walk.

---

## 4 · Why the outer agent finds causes the T-loop author cannot (Q2.1)

Three gaps, all structural, none a capability difference:

| gap | the mechanism |
|---|---|
| **The judge row is stripped** | `judge-inputs.ts:33` `corrections: r.corrections.map(c => c.kind)` — the author sees `["redrive"]` and the final text; `guardName`, `detail`, `finish.message` and `delivery.by` — the four fields that identify the composer seam — never reach the judge file. The outer agent reads the dump, which has all four. |
| **The skill has no word for the stage** | `grep -rn composer agentspec/skill/` → zero hits. The floor table describes `figureIsGrounded` as guarding “the reply” — which is the composed text it never sees. The author's model of the seam is wrong by construction. |
| **The licence ends where the defect lives** | test.md: a line unpaid when the loop dries “is in the case, the world, or the engine, and those are not the author's files” — the author is INSTRUCTED to stop exactly where 5 of 13 points sit. |

So the answer to “why do you find it and the T-loop agent doesn't” is: **the T-loop agent is
judging a redacted record of a machine it has no map of, under orders to stop at the
boundary where the defect lives.** The outer agent has the dump, the source, and no fence.

---

## 5 · The harborpoint confounds (why trad's 33/33 is not a clean +5)

```
1  ANSWER KEY   exam `covers:` names governed guards verbatim; 14 exam record ids
                (inv_3, ves_3, b_1, mo_1, wo_1, hd_1, inv_2) appear in trad runtime
                text; governed declaration.yaml carries ZERO world-record ids
2  HELD-OUT     a held-out case's turn AND forbidden answer are in the prompt
   SPENT        (“You do NOT state 364”); a held-out rubric line is copied verbatim
                into a guard directive (guard.ts:425). All 9 held-out cases carry
                dedicated mechanism. (Governed also spent held-out rows — rounds 8
                and 10 — a wash on honesty, but neither 100% is a generalisation
                estimate.)
3  CONSENT      agreeTo-on-'?' licenses the staged tool with ANY arguments —
   LOOSENED     a weakening no governed author is permitted to make
4  NO ROUTER    one agent holds all 25 tools; governed ran 3 desks + front desk
5  n = 1        trad "final" is a byte-identical replay of r3 (same md5);
                governed 28/33 is the mode of three full runs
6  SELF-JUDGED  both sides; but c20's strict re-read shows self-judging bought +2
                (96/94 self vs 94/92 strict)
```

And the untested generalisation holes in the trad build, measured by running its own code:
`spokenNumbers("from 2026-09-05 to 2026-09-12")` donates 2026, 9, 5, 12 as “figures the
operator spoke”, so `payInvoice(amount: 2026)` clears provenance; `'a minority of the
crew'.includes('minor')` licenses `severity: 'minor'`; 9 of 14 write tools have no
operator-figure check at all — exactly the 9 the exam never probes.

---

## 6 · What dies if looprun is replaced wholesale (the priced list)

| dies | trad has | price |
|---|---|---|
| translatable vocabulary | English `SYNONYMS` regexes in a shared runtime module — every PT/ES probe fails (5/5) | rewrite provenance + policy per subject, per language |
| reply-figure grounding (absence side) | presence-only `shortfall()`; trialworks has NO reply gate | no mechanism — an invented figure is unreachable |
| audit record | no git, no verdicts file, no digest binding run to code | seal + digest + dumps + counters |
| transferability | the two trad builds share 2/0/3 lines — subject #4 = ~1,100 new lines of safety code | one ~790-line declaration |
| discrimination proof | no ungoverned twin, ever | governed measured 25/30 vs 14/30 and 100 vs 69 |
| consent that binds | `?`-fallback with `args: null`; trialworks executes the held act in the HARNESS | held EXECUTABLE act + 6-digit code + TTL + exact-alone |

**Correction the comparison forced into the open:** reading a choice out of the operator's prose
is language-bound whatever the reader does. “A triagem da pt_4133 **não passou**” carries no
English term, so an English-declared gate refuses the lawful call; take the negator list away and
the same sentence ALLOWS `outcome: 'passed'` — the opposite of what the operator said. No amount
of extra vocabulary repairs either side: the words belong to a language, and the engine owns none.
A choice is licensed by an ANSWER: the desk asks in the operator's language, and the licence is
the reply carrying the option and the ask's own code.

Second correction: the audit advantage is currently unexercised — none of the four subject
trees is under git, and neither governed subject carries a seal file. The verbs exist
(`eval/src/seal.ts`); they were not run.

---

## 7 · Answers, compressed

| question | answer |
|---|---|
| 1 · why does trad hit 100% in few rounds? | §2: total edit freedom + checked must-state + the answer key + exam text in the prompt + loosened consent + no router + net-positive rule |
| 2 · is governed WORSE after hundreds of rounds? | No. It wins the clean pair (92 v 78), ties one, loses the confounded one — but it IS 2–4× slower and 2.3–2.6× dearer |
| 2.1 · why does the outer agent see what the T-loop can't? | §4: stripped judge rows + a stage the skill never names + orders to stop at the engine boundary |
| 2.2 · are locks (a)+(b) THE bottleneck? | Partly. They cost 3 of 13 points. The engine itself costs 5 (4 = composer). Lock (a) is half-real: the wall is free prose; the LADDER is closed (13 factories, four published no-rung shapes, no tool-result annotation, no checked must-state). Lock (b) is total — and its worst effect is epistemic (§4), not just permissive |
| 3 / 3.1 / 3.2 / 3.3 | see `docs/superpowers/specs/2026-08-30-minimal-core-free-author-proposal.md` — NO to replacing, YES to a minimal core + freed author, with the red-team's amendments |
