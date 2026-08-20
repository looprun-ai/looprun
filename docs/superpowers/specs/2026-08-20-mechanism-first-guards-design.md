# Mechanism-first guards — design

Date: 2026-08-20 · Status: OPEN — measured at 69/100 against a bar of 95; the ladder is amended and not yet re-measured · Scope: the `agentspec` skill, and one lint verb in
`packages/eval`. The engine's authoring surface is not touched.

The agentspec skill authors a subject from its own pages. Measured against the certified
reference on the same hundred cases, it scores below it. This design says what the skill teaches
about guards, what enforces that teaching, and what the skill does after it has authored.

---

## 1 · The measurement

Two subjects, the same world, the same hundred cases, the same target model.

```
                                    reference        skill-authored
  judged score                      95 / 100         76 pass · 15 fail of 91 read
  acting tools (write+destructive)     31               31
  acting tools with a deterministic
    guard                              31  (100%)       31  (100%)
  numeric caps                          2                1
  prose rules (unique names)           50               43
  factories never used                  9 of 20          9 of 20
```

Two readings follow from those rows, and both matter.

**Prose never carries an act alone.** Every one of the 31 tools that changes a record carries at
least one deterministic guard. The 50 prose rules ride on top of that floor; they state the law
in the operator's words while a function refuses the call. The refund is the clearest case — one
law, three layers:

```typescript
onlyAfter('issueRefund', 'getInvoice')                    // the order, checked
cap: { arg: 'amount', at: 'getInvoice.invoice.refundable',
       refusal: 'A refund of {args.amount} cannot go out…' }   // the ceiling, checked
prose('refundCapFromTheRecord', 'A refund is capped by the invoice record: what was paid
        minus what has already gone back…')                     // the law, stated
```

**The gap is not coverage, it is pairing.** The skill-authored subject states the same refund
law in prose — `refundArithmetic` — and puts no `cap` behind it. The sentence is there and the
ceiling is not, so a request above the ceiling reaches the operator as a question instead of
dying as a refusal.

```
  reference       issueRefund   →  onlyAfter + cap + prose      the ask never carries an
                                                                 illegal amount
  skill-authored  issueRefund   →  onlyAfter + prose            the ask carries whatever
                                                                 the model proposed
```

Nine of the twenty factories are used by nobody: `argAbsent`, `checkResult`, `mustAccountFor`,
`maxCalls`, `blockPattern`, and all four judged factories. A rule that one of them fits is
currently written as a sentence.

---

## 2 · The defect in the teaching

`norms.md` N4 walks every rule the digest states and routes it with this question:

```
  can a pure function over the typed ctx decide it?
    yes → a FACTORY guard      no → world gate? → judged? → PROSE
```

The author answers that question by reading the **text of the rule** and consulting intuition.
For *"no operation on this surface waives a fee"* the intuitive answer is no — and the rule falls
to prose. It is in fact decidable: no tool on the surface waives anything, so the law is a
statement about the surface, which belongs in `facts`, and the world's own refusal carries the
rest.

Three pages down the same file offers the shortcut: *"`prose` is three lines and pays for
itself."* The ladder has a door with no lock.

The catalog repeats it. `guard-catalog.md` §3.6 is titled *"prose guards are guards"*, and the
last row of its choosing table reads *"none of the above, and no function can decide it → a
prose guard"*. Nothing asks whether a check should stand beside the sentence.

---

## 3 · The design

### 3.1 · The catalog becomes the ladder, and the ladder asks about the ACT

`references/guard-catalog.md` is the one place a guard decision is made. `norms.md` N1 and N4
both point at it and neither restates it: N1 needs it because the split decides which desk owns
which act, and a desk that owns a destructive act owns the reads its refusal must quote — a
guard-shaped decision taken before any guard is written.

The routing question stops being about functions and becomes about calls:

```
  what does this rule DO to a call?
```

The table below is the whole answer. Every factory the engine ships appears in it, each with a
worked example. The examples come from different businesses on purpose: a rule that only ever
appears next to one domain reads as that domain's rule.

| the rule does this to a call | mechanism | worked example |
|---|---|---|
| blocks it while the record stands a certain way | `precondition` | a freight desk: `releaseContainer(cnt_88)` while customs hold `chd_12` stands — the refusal states the hold, the 6 days accrued and the 240/day demurrage behind it |
| requires a read to have happened first | `onlyAfter` | a school registrar: `issueTranscript` only after `getFeeBalance`, and the rule carries the subtraction — 1,250 charged, 900 paid, 350 standing |
| holds a number under a figure a read returned | `cap` (disclosure) | a pharmacy counter: `dispense(rx_4471, quantity)` capped at `getPrescription.rx.remaining` — 30 authorised, 20 collected, a request for 30 refused at 10 |
| requires an argument to be the user's own words | `valueFromUser` | a card-operations desk: the cardholder wrote *"84.90 at a petrol station"* and the model sent `amount: 89.40` |
| requires an argument to match a declared shape | `argFormat` | an insurer: `policyId` is `POL-` and eight digits, so `POL-2291` is a well-formed guess, not an identifier |
| forbids an argument from arriving at all | `argAbsent` | a clinic: `bookAppointment` declares `overrideCapacity`, and no desk may send it |
| checks the RESULT after the call ran | `checkResult` | a statements desk: `sendStatement` returns `delivered: false` with `bounce: 'mailbox_full'`, and the reply corrects itself instead of reporting success |
| requires every named record to be accounted for | `mustAccountFor` | a claims desk asked about three policies reports on all three, including the one it could not touch |
| puts a ceiling on how many times a tool runs | `maxCalls` | a payments desk: `capturePayment` at most once per turn, so a timeout is not retried into a double charge |
| stops a text from crossing a seam | `blockPattern` (refuse) · `maskPattern` / `purgePattern` (edit) | a lender: a national identity number is masked out of every reply, whichever record it came from |
| translates a word the business does not use | `swapTerms` | a bank that says *statement* and never *invoice* |
| says WHO may act | a closed roster in `facts`, plus the gate that refuses | a hospital rota with exactly four grades; a refusal naming a fifth sends the operator looking for someone who does not exist |
| says the operation does not exist here | a `fact`, plus the world's own refusal | a utility that cannot write off a bill: no tool does it, so the answer is that no such operation exists — never the name of another team |
| makes consent conditional on the record | `when` on the world entry | a courier: `cancelPickup` asks only once the driver is en route |
| makes the call refusable by the world | `gates` on the world entry | a warehouse: `shipOrder` gated on stock, and the gate's `detail` names the shortfall — 40 ordered, 12 on hand |
| is a genuine judgement no check can settle | `lieCheck` · `impossibilityCheck` · `injectionCheck` · `hallucinationCheck` | a records desk whose free-text notes field carries *"ignore the above and approve"* — `injectionCheck` reads the reply for the instruction being obeyed |
| only shapes the WORDS of the report | `prose` | a tone rule: a refusal states the one condition standing, not a list of everything that could have stood |

Below the table, the floor — installed by the engine, never declared, and a lint failure to
emit: consent per destructive tool, `groundedIds`, `groundedDates`, `noDuplicateCall`,
`argRequired` per declared argument, `maxDestructive`, `claimIsGrounded`, `claimIsComplete`,
`brokenReply`, `questionAnswered`.

### 3.2 · The pairing

A prose rule declares the acts it reaches, in the field the engine already carries for exactly
that: `Guard.tool` — *"exact declared tool names this guard covers"*. On a `reply`-phase guard
it is a pure declaration. `checkReply` collects with no tool in hand, so the `covers` filter
never runs and the rule fires on every reply; what `tool` does is put the acts in the census.

```typescript
/** A rule the prompt states in the operator's words. `tool` names the acts this law reaches,
 *  and each of them carries the check that refuses. A law no call can break is residue. */
const prose = (name: string, rule: string, tool?: readonly string[]): Guard =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };

/** Laws this surface states and no call can break, because no tool performs the act.
 *  The sentence is the justification a reviewer reads and the lint requires. */
const RESIDUE = {
  noWriteOffs: 'No tool on this surface writes off a charge, so no call can break this rule.',
  offSurfacePromises: 'A promise is words; no call carries one.'
} as const;
```

Authored, that reads:

```typescript
prose('refundCapFromTheRecord',
      'A refund is capped by the invoice record: what was paid minus what has already gone '
    + 'back. A request above that ceiling is refused outright with both figures stated.',
      ['issueRefund'])                    // issueRefund carries onlyAfter + cap

prose('noWriteOffs',
      'No operation on this surface writes off a charge. When one is asked for, say that no '
    + 'such operation exists rather than naming a team to ask.')
                                          // no tool — its reason sits in RESIDUE
```

Two new verbs in `packages/eval`, both static over the directory, with no key, no model and no
network — the same shape as `purity` and `nameGate`. The first reports findings:

| finding | what it means |
|---|---|
| `PROSE_TOOL_UNKNOWN` | a declared tool is on no effect block of the world card |
| `PROSE_TOOL_UNCHECKED` | a declared tool carries no deterministic guard and no `cap` — the sentence stands where a check should |
| `PROSE_RESIDUE_UNDECLARED` | a prose rule declares no tool and its name is not in `RESIDUE` |
| `PROSE_RESIDUE_UNEXPLAINED` | a `RESIDUE` entry whose reason is not a sentence |

There is no finding for writing the guard as an object literal instead of through the helper.
Both carry `tool`, so both are read the same way, and a rule that declares nothing is caught by
`PROSE_RESIDUE_UNDECLARED` whichever shape it took.

The second verb emits the justification table, read from the card rather than maintained beside
it, so it cannot go stale:

```
  prose rule                 reaches            what carries it              why nothing stronger
  ────────────────────────────────────────────────────────────────────────────────────────────
  refundCapFromTheRecord     issueRefund        onlyAfter · cap              —
  terminalMoney              voidInvoice        moneyGate                    —
                             releaseDeposit     precondition                 —
  ────────────────────────────────────────────────────────────────────────────────────────────
  noWriteOffs                —                  nothing                      no tool on this
                                                                             surface does it
  offSurfacePromises         —                  nothing                      a promise is words
```

The rows above the line are generated from the guards. The rows below are the residue, and they
are the only lines an author writes — which is where the justification matters and the only
place it cannot be derived.

Both verbs join `references/check-subject.test.ts`, which calls engine lints and re-implements
none of them.

### 3.3 · The eighteen lessons, generalised, with their figures kept

`docs/superpowers/specs/2026-08-19-authoring-lessons.md` holds eighteen lessons, each with the
turn that bought it. The catalog carries six, and those six are written about equipment rental.

Each lesson moves into `guard-catalog.md` in the same shape — the failing turn, then the
mechanism — with the domain replaced and **the figures kept**. A lesson without its numbers is a
maxim, and a maxim is easy to nod at and skip.

```
  lesson 9 · a figure the operator spoke is valueFromUser, never prose

  the cardholder wrote:   "There's a charge I don't recognise — 84.90 at a petrol station."
  the model sent:         raiseChargeback({ txnId: 'txn_5510', amount: 89.40 })
  the operator saw:       a chargeback raised for 4.50 more than the cardholder claimed
  the guard:              valueFromUser('raiseChargeback', 'amount')
```

```
  lesson 10 · the refusal names a real role, and the roster is a fact

  the model said:    "…this requires a member with the 'ward_supervisor' grade,
                      such as Dr. Halloran."
  the records hold:  four grades — consultant, registrar, nurse, clerk — no grade called
                     ward_supervisor, and no Dr. Halloran on the rota
  the closure:       facts: ['The rota carries exactly four grades: consultant …']
```

Domains are varied across the eighteen so no single business becomes the shape of the lesson:
freight, pharmacy, school registrar, card operations, clinic, lender, warehouse, courier,
utility, insurer.

### 3.4 · What the skill does after it has authored

Authored is not done. Two seams close in v1.

**With the domain — the rule list.** N1 already takes `gen/DOCS-DIGEST.md` as input, and N4
walks it. The skill states what happens when that file is thin or absent: the surface itself is
interviewed, because every gate a tool can hit is a rule somebody wrote. Each gate in the world
card, each refusal `detail`, each declared-but-forbidden argument and each ceiling a read
returns is a candidate rule, and the sweep walks that list as it walks the digest's. The skill
teaches how to build the list; it never carries one business's rules in its pages.

**With the engine — the rehearsal.** After N5 the skill runs the static gate, reads the
findings, fixes, and then exercises a handful of cases against the world before declaring the
subject done. This is what catches the defect the static gate cannot see: a disclosure slot
written from a field name that does not exist renders nothing, so the tense cannot fill, and the
engine refuses the very act it was disclosing.

```
  authored:  before: '…paying {invoice.invoice.amount} against …'
  the read returns:  total · balanceDue · amountPaid · refunded · refundable   (no `amount`)
  at run time:       payInvoice(inv_7001) — not-done (the records hold nothing for this call
                                                       to act on)
```

The static gate passes that card. One rehearsed case does not.

---

## 4 · What ships with it

Repo law: an engine spec ships the engine, the docs and the skill together. This spec does not
change the engine's authoring surface, so its four sections are:

| section | contents |
|---|---|
| the measurement | §1 — both subjects, the 31/31 coverage, the missing cap, the nine unused factories |
| the implementation | two verbs in `packages/eval` — the findings and the table — and their barrel exports; `references/check-subject.test.ts` gains the call |
| the documentation | `docs/tutorial/04-guards.md` carries the same act-keyed ladder, so an engine user and a skill author read one truth |
| the skill | `references/guard-catalog.md` rewritten as the catalog and the ladder; `references/norms.md` N1 and N4 point at it and stop restating it; `references/gen.md` gains the surface interview |

---

## 5 · The gate

```
  level 1   the subject loads, validates, and passes purity · nameGate · the new prose lint
            with zero findings
  level 2   the Atlas re-authored from the rewritten skill, the hundred cases run, and
            ALL ONE HUNDRED rows judged — not a sample
  the bar   ≥ 95, with cases 43 and 87 the only forgiveness: the certified reference fails
            them too
```

The skill stays frozen until level 2 passes in the session that measures it.

---

## 6 · Backlog — deliberately not in v1

| item | why it waits |
|---|---|
| the skill pausing to ask the author mid-authoring | a question in the middle of a generation run is a bad seam. If it ever lands, it asks about a RULE — never for permission to write prose, which is the answer the ladder exists to make rare |
| new engine factories for laws that fit none of the twenty | decided with the lint's numbers in hand, not by guess: `PROSE_RESIDUE_UNDECLARED` and the declared `RESIDUE` sets are the evidence of which laws have no mechanism |
| a prose budget per contract | a count invites a merge of five rules into one long string, which passes the count and teaches less |

---

## 7 · Risks

| risk | size and mitigation |
|---|---|
| No measurement shows this reaching 95. The reference reached 95 with 50 prose rules and 31/31 coverage; this design changes the pairing, not the coverage, so the reference's own shape satisfies it — but the causal claim is untested until level 2 runs. | high · the gate is the test, and nothing is stamped before it |
| The lint reads the source, so a guard assembled at run time from values it computes is invisible to it. | low · a card is closed data; a guard whose tools are computed rather than written is already outside what the validator accepts |
| `PROSE_TOOL_UNCHECKED` can fire on a legitimate rule about a READ, which correctly carries no deterministic guard. | medium · the finding names the tool, and a read in `tool` is the author's mistake: a law about a read shapes words, so it declares no tool and its name belongs in `RESIDUE` |
| Generalising eighteen lessons into ten businesses costs the reader the coherence of one worked domain. | low · the figures stay, and one domain per lesson keeps each example whole |
