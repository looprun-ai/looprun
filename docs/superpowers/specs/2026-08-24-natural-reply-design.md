# The natural reply — one voice, every guarantee

**Status: DESIGN, prototype measured.** Every mechanism below is implemented and test-driven on
the branch `microtest/coherent-reply-and-bytes` (commits `7205c19 → 104bc3b`); the branch is a
prototype — it does not pass the repo gate (the delivery-format proofs assert the old
composition) and merging it is the implementation plan's job, not a copy. Where a mechanism is
design-only it says so in its own row.

## 1 · The goal

The delivered reply is the desk's own prose: correct, fluid, in the operator's language, never
contradicting the record, never repeating what it already says. Every engine guarantee stays:
what the prose fails to carry, the engine prints beneath it; what the prose gets wrong, the
engine refuses to deliver.

```
OPERATOR: O cliente acabou de desistir - cancele a bk_1001.

AGENT:    A reserva bk_1001 está pronta para ser cancelada. Cancelar a bk_1001
          encerra a locação de 2026-07-10 a 2026-07-15 da CAT 320 Excavator e
          devolve ast_excv01 ao pátio — e uma reserva cancelada não volta atrás.
          Qualquer serviço de técnico vinculado a ela é anulado no mesmo ato, e
          0 de caução segue retido no registro. Para prosseguir, responda
          CONFIRM e70b5d.
```

One message. The consent statement is woven in word for word, the approval literal closes it,
and no engine line follows — because a substring check proved the prose already carries both.

## 2 · The measurement

Baseline: the sealed pt-BR hundred-case run,
`agentspec-bench/subjects/atlas-c17-ptbr/test/2026-08-24-ptbr-w100/rep1` — 96/100 letters
(fails 62 · 68 · 80 · 100), and per delivered reply:

| defect | baseline count (153 turns) |
|---|---|
| bytes delivered | 99 046 (647/turn) |
| turns whose prose the engine discarded (`forcedFinish`) | 54 |
| the same call printed as done AND not-done in one reply | 7 |
| successful-read lines printed | 314 |
| raw JSON in the reply | 26 |
| whole reply in English (pt-BR conversation) | 86 |

Prototype evidence (session scratchpad runs, disposable — the implementation plan re-earns
every figure on sealed runs): three full-100 runs (`final100` 86 → `v2-100` 93 → `v2c-100`
95/100 letters, judged letter by letter in session), a 3×2-build discriminator on cases
34/77/79, the 12-key slice at 11/12 with zero invariant failures, and single-case runs of
01/17 for the final prose-first layer. `v2c-100`'s only delta from baseline is case 34, which
fails 0/3 on main as well — a case flap, not a build delta. The three invariant failures
(62 · 68 · 80) are identical in every run on both builds.

## 3 · The mechanisms, each with its implemented code

All paths relative to `packages/core/src/run/`; commits on `microtest/coherent-reply-and-bytes`.

### 3.1 The prose is the delivery; the record fills only what it left out

`delivery-writer.ts` — `compose()`, `record()`, `covers()`, `unframed()` (commits `4be49f6`,
`c9a88f1`, `104bc3b`). The delivered text is the desk's message; a settled act's sentence
prints beneath it only when the prose does not carry every id and every figure that sentence
states:

```ts
/** The prose covers a record sentence when every id and every figure the sentence
 *  states already appears in the prose — then the sentence has nothing to add. */
function covers(message: string, sentence: string): boolean {
  if (message === '') return false;
  for (const id of idsOf(sentence)) if (!message.includes(id)) return false;
  const said = amountsOf(message);
  for (const figure of amountsOf(sentence)) if (!said.has(figure)) return false;
  return true;
}
```

An id is an underscore token carrying a digit (`bk_1001`, never `hold_release`); figures
canonicalize through `canonicalAmount` (catalog.ts, exported), so "5.000.000" in prose covers
`5000000` in a result. What prints, prints without the tool frame — `unframed()` strips
`tool(target) — status.` and speaks the sentence body; a refusal speaks the rule inside its
parentheses; a line that would strip to nothing keeps its original form.

**Every block breathes** (commit `c9a88f1`): the delivered text joins its blocks with a blank
line — the prose, then each record fact, then each question, one paragraph apiece. A
prose-only reply is a single paragraph and gains nothing.

Evidence: cases 01/17/18/31/34/95 recomposed offline from recorded acts — case 31's prose
lacked the minted `hold_6001`, the receipt printed it; case 01 T2's prose lacked the `0`,
the receipt printed it; case 34's prose covered everything, nothing printed.

### 3.2 One act per call — the canonical key

`delivery-writer.ts` — `settled()`: acts group by `a.call.key` (the engine's canonical,
key-sorted form), and the strongest evidence wins (`done > unknown > held > refused`).
`JSON.stringify(args)` is order-sensitive and split the same call in two — measured: four
turns delivered done AND not-done for one call (11/15/21/29 in `fix100`) until the key fix;
zero after.

### 3.3 Reads are the model's memory, not the operator's — with one exception

`delivery-writer.ts` — `record()`: a successful read never prints, fallback included. The one
exception: a pure-text read — no id, no figure: a policy, a rule — on a turn that puts a
question up, prints as a quote; fact-coverage cannot see its content in the prose, and it is
the ground the decision is asked on. Evidence: case 17-r1 (the hold-release policy) failed
letter-strict with reads silent, passes with the quote — verified by offline recomposition of
run `pf17c`.

### 3.4 The consent statement is woven into the prose, word for word

`finish-desk.ts` — `force(open)` (commit at `104bc3b`'s parent chain): the forced-finish
instruction hands the model each open question's authored sentence and its literal:

```ts
const consent = open.length === 0 ? ''
  : ' Weave into your message, WORD FOR WORD, each approval statement with its literal: '
    + open.map(q => `"${q.sentence}" — the operator approves by replying ${q.code}`).join('; ')
    + '. Open with your own short sentence answering the operator, then the statement, then '
    + 'name the literal. One flowing message.';
```

`compose()` suppresses the `[CODE] sentence` line iff the message contains the sentence AND
the code verbatim — substring checks, never interpretation. Evidence: case 01 ×3 reps, all
three delivered the single flowing message with no engine line.

### 3.5 Every figure in the prose exists in the records

`turn.ts` — `tryFinish()`: deterministic check before delivery. The message's canonical
figures must each appear in the turn's evidence (user texts, args, results, sentences, open
questions, notes, history); an unmatched figure is a redrive naming it. Evidence: 243
recorded finishes, 0 false positives, and it caught the only two desk-arithmetic lies in the
corpus (case 42's `7800` = 9000−1200, case 75's `70`); live, the model rewrote correctly on
the first redrive.

### 3.6 A contradicted message is never delivered — the record speaks

`turn.ts` — `tryFinish()` / `engineClose()`: when a finish report's word contradicts the
settled record (a `refused` claim over a call that ran), the message is discarded and the
delivery is the settled acts' own sentences. Evidence: case 11 T2 (`fix100`) — licence
executed the refund, the model reported it refused; delivered text:
`100 is paid back on inv_7001: 100 has now gone back against the 2930 paid.` — the false
prose never reached the operator. A malformed report is a different fault and keeps the
prose (case 72 T2, delivered in pt-BR intact). A delivery is never empty.

### 3.7 The model's memory is the full record, never the slimmed delivery

`turn.ts` history assembly + `delivery-writer.ts` — `modelView()`: the model re-reads its
past turn as prose + every settled act sentence + open questions; the operator's slim text is
never its memory. Evidence: case 79 flipped 0/3 → 3/3 on this change alone (the T2 answer
"contate o setor de rentals" comes from the T1 reads it re-reads), and case 11 T2 went from
licence + 4 blocked re-calls (`fix100`) to exactly one act (`v2c-100`).

### 3.8 The forced step carries only the finish card

`turn.ts` — `stepInput.tools = forced ? [fd.toolCard()] : [...pw.toolCards(), fd.toolCard()]`.
A forced turn has one legal move; the other cards are dead bytes. Measured on the billing
desk: 23 065 B → ~9 400 B per closing attempt (−59%). The contract guards leave with the
cards by construction — a guard's rule lives on its tool's card and nowhere else (standing
law; hoisting was measured at −13% bytes and one lost case, and is forbidden).

### 3.9 Schemas carry teaching, not plumbing

`prompt-writer.ts` — `slim()`: `$schema`, `additionalProperties` and `pattern` leave the
tool schemas sent to the model (the engine validates; the guards refuse); `description`
stays. Measured: −10 631 B of static prompt (−8%), 12-key slice and full 100 with no
invariant change.

### 3.10 The language instruction lives in the forced step only

`finish-desk.ts` — `force()` says "Write the message in the language the operator wrote in."
The same sentence in the finish card's `does` cost case 77 3/3 (the model closed early and
never read the member record); isolated by A/B with the line as the only variable. Any
prompt-side wording change is A/B-measured before it ships — a standing law this defect
bought.

## 4 · What is designed and NOT implemented

| piece | design |
|---|---|
| declared vocabulary | the engine's own delivery words (`done`, `not-done`, `CONFIRM`/`NO` literals, question closures) become subject-declared data — the author writes them in the desk's language, the engine defaults to English. Declaration schema + emit + core. |
| subject language end-to-end | authored sentences pass through byte-for-byte (proven: the case-01 clone with pt-BR declaration blocks delivered pt-BR); the atlas-c17-ptbr declaration itself is still authored in English, and world data (`confirmed`, `active`) follows the world's authoring. |
| prose paragraphing | the woven ask-turn message is one long paragraph; splitting it needs a force-instruction change, unmeasured. |
| the sealed hundred | the final prose-first layer is measured on case 01 ×3, case 17, the 12-key slice (11/12; the miss is 44-r1, prose variance on an unchanged channel) and offline recomposition of five cases. The full-100 letter gate on the final build has not run. |

## 5 · The bar

The gate is two halves, both required (registered as agentspec `BACKLOG.md` row 1):

1. **Letters**: ≥ the baseline 96/100 on the same subject, judged letter-strict in session.
2. **Deterministic counters over the same run**: replies with one call at two outcomes = 0 ·
   empty deliveries = 0 · successful-read lines = 0 (ask-turn pure-text quotes excepted) ·
   raw JSON = 0 · prose language = operator's language on every model-closed turn.

A letter score alone certifies nothing about voice: case 01's three critical letters are all
payable by the engine's own consent line, and no letter looks at contradiction or language.

## 5.1 · The closing measurement — the hundred, once, in English

The spec closes with ONE full run that earns every published figure — run only on the user's
order, never proposed by the session:

- **Subject**: `agentspec-bench/subjects/atlas-c17` (the English original), final build,
  **1 rep** of all 100 cases.
- **Quality**: every letter judged in session, letter-strict — the two-halves bar of §5
  against the sealed English baseline (`atlas-c17/test/2026-08-23-c17-w100`, 96/100).
- **Statistics, recorded per turn and totalled**: input tokens, output tokens, cached-input
  share, wall clock per case, delivered bytes per reply, model calls per turn, and cost per
  conversation and per turn at the subject model's published prices. The governed dump today
  records none of these — the runner grows the usage capture before this run, or the run does
  not count.
- **Comparison table**, three columns: sealed baseline (main build) · this run (final build) ·
  `atlas-traditional`'s `runs/final/stats.json` where comparable (input/case 26 652 mean,
  reply 380 B mean, wall 3 384 ms mean) — so the reduction claims (reply bytes, step bytes,
  re-call count) are stated against both anchors, not one.

## 5.2 · The closing measurement — measured, and what it returned

Run: `agentspec-bench/subjects/atlas-c17/test/2026-08-24-natural-100/rep1` — all 100 cases,
1 rep, final build (`natural-reply` @ `ccd2c71`), climbed 12 → 40 → 100 with each checkpoint
judged. Every letter judged in session, letter-strict; counters computed by script over the
dumps. Prices: gemini-3.1-flash-lite published $0.25/1M input · $0.025/1M cached ·
$1.50/1M output (ai.google.dev, read 2026-08-23).

| | sealed baseline (main) | this run (final build) | atlas-traditional |
|---|---|---|---|
| letters | 96/100 (61 · 62 · 80 · 100) | **93/100** (18 · 44 · 50 · 61 · 62 · 80 · 100) | 87/100 self-judged (`runs/final/verdicts.jsonl`); 83/100 under its own report's stricter reading — four passes name fabricated colleagues |
| invariant failures | 3 (61 · 62 · 80) | 3 — the same three lines (61 · 62 · 80) | 3 (32 · 60 · 97, its own checks) |
| one call, two outcomes in a reply | 5 | **0** | — |
| empty deliveries | 0 | **0** | — |
| successful-read lines delivered | 298 | **0** | — |
| raw JSON in a reply | 24 | **0** | — |
| reply language = operator's | — | 153/153 turns | — |
| forced closes | 53 | **6** | — |
| delivered bytes (mean/turn) | 98 958 (647) | **41 961 (274)** | (380 mean reply) |
| input tokens (mean/case) | not recorded | 2 897 216 (28 972) | 2 665 272 (26 653) |
| cached input | not recorded | 0 | 409 124 (15.4%) |
| output tokens (mean/case) | not recorded | 36 804 (368) | 24 016 (240) |
| model calls (per turn) | not recorded | 605 (3.95) | 484 (3.16) |
| wall clock (mean/case) | not recorded | 473 369 ms (4 734) | 338 442 ms (3 384) |
| cost, whole run | not recorded | **$0.78** | $0.61 |
| cost per conversation / per turn | not recorded | $0.0078 / $0.0051 | $0.0061 / $0.0040 |

**The two-halves bar: counters hold at zero across every row; letters land at 93 against the
baseline's 96 — the misses are findings, and the spec stays open on them.** The three
invariant misses (61 · 62 · 80) and the case-100 letter are byte-for-byte the same disputes
on both builds; the delta this change owns is 18 · 44 · 50.

| finding | cases | class |
|---|---|---|
| a critical letter names a fact only a raw read line used to carry — the hold's recorded reason — and no authored sentence says it | 18-r1 | two repair rounds flat: a conduct sentence and a card rule both missed, because the reply is composed on the forced step with the cards off the table; routed to looprun `BACKLOG.md` row 3 — the `needs` declaration whose `pick` puts the reason inside the woven sentence |
| the tier refusal names a role that cannot act | 50-r2 | repaired through the skill's own T-loop: `theTierMoveIsOwnerOnly` on the workspace desk — two passing repetitions |
| the delivery-choice guard stops a flow whose rubric expects the booking made | 61-r1 | subject: case and guard disagree about the waived check — the same stall fails the baseline |
| catalogue prices stated before the delivered-or-collected question | 44-r1 | repaired through the skill's own T-loop: `askTheDeliveryChoiceBeforeAnyPrice` on the rentals desk — two passing repetitions |
| roles named where the rubric wants a named member of the workspace | 100-r3 | prose flap — the same letter fails on the baseline |
| a read whose declared sentence has no body delivers as a bare frame (`getDepositBalance() — done`) through the ask-turn quote; a world refusal code (`SOLE_OWNER_PROTECTED`) delivers raw | 05 · 06 · 35 · 36 · 51 (no letter lost) | voice: bodyless declared sentences and code-worded world refusals are authoring gaps the delivery now exposes |

Case 18's baseline pass was paid by the raw `listHolds` JSON line carrying the hold's reason —
a reply this build correctly refuses to compose; the fact now belongs to an authored sentence.
Cases 44 and 50 regress on model prose alone: the baseline reps happened to say the asking
words ("include the delivery?", "Only an owner may move the plan tier") and these reps did not,
on an unchanged prompt channel.

## 6 · The documentation this change touches

`README.md` (the delivery contract), `docs/tutorial/**` wherever a delivered reply is shown,
`governance/**` honesty-guarantee wording (figures now reach the operator through the prose
under `figureIsGrounded` + coverage, with engine lines as the net), and the source headers of
`delivery-writer.ts`, `finish-desk.ts`, `turn.ts` (already rewritten AS-IS on the branch).

## 7 · The skill

`agentspec` teaches, in the same working session as the engine merge: the delivery contract
(prose-first, coverage, the net), the two-halves bar (§5), consent-sentence authoring (the
sentence is woven verbatim into prose — authors write it as a sentence that can sit inside a
message), the declared vocabulary once it exists, and the A/B law for prompt-side wording.
