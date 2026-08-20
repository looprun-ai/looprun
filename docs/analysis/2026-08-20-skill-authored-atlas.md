# The skill authors the Atlas — what the comparison found

The agentspec skill's own quality gate: it must be able to produce the subject that phase 5
certified. This is what happened when it did.

## What was re-authored, and what was not

```
  RE-AUTHORED from the skill's pages          REUSED, because it is ported data
  ──────────────────────────────────          ────────────────────────────────
  cards.ts        the two cards               generated/world-data.ts    the records
  world.ts        the card declaration —      generated/tool-schemas.ts  the 31 schemas
                  blocks, labels, targets,    generated/cases-data.ts    the 100 cases
                  branches, the state note    world-kit.ts + handlers    the API's logic
```

The reference is the measuring stick. Re-inventing the records or the cases would move it, and
the spec freezes it for exactly that reason.

## Level 1 — the structural diff

| governance fact | reference | skill-authored | verdict |
|---|---|---|---|
| effect block of each of 31 tools | reads 23 · writes 16 · destructive 15 | identical | match |
| destructive target argument | 15 declared | identical | match |
| desks | rentals · fieldops · billing · claims · fleet · workspace | identical | match |
| lane sizes | 15 · 12 · 15 · 15 · 13 · 9 | identical | match |
| disclosure entries | 19 tools | the same 19 tools | match |
| guard names and sentences | the reference's wording | the author's own | **variation, allowed** |

One placement differs and is not a defect: the reference installs each capability gate on the
desk that owns those tools; the skill teaches that a TOOL rule belongs on the contract, so the
authored version puts all five there. Measured, the difference costs nothing —

```
  rentals prompt, reference      2284 chars, money gate absent
  rentals prompt, skill-authored 1715 chars, money gate absent
```

— because the engine already drops a guard whose tools are not on the desk's surface. The
contract placement is also the safer one: a desk that later gains a money tool inherits the
gate instead of quietly running without it.

## The four teaching gaps the pass found

Each was fixed in the SKILL first, and only then in the subject.

### 1 · The split lost the blocker reads

The claims desk in the authored version had no `listHolds`, `placeHold` or `releaseHold`, so
three cases approved acts no question could ever hold. The validator said so:

```
Case '97-two-hold-lifts-one-turn' approves 'releaseHold', but nothing on agent 'claims' ever holds it.
```

The skill said "cluster by tool-need" and nothing about the reads a REFUSAL owes. It now says a
blocker read travels with the desk that hits the blocker, and the desk that owns a destructive
act owns the reads its refusal must quote.

### 2 · Eleven destructive acts went out with a label and no sentence

The checklist read "every destructive tool has a disclosure entry, **or its label alone is
genuinely enough**". That escape hatch let payInvoice, issueRefund, voidInvoice, resolveClaim,
placeHold, releaseHold, retireAsset, transferAsset, changePlan, removeMember and
updateMemberRole ship with nothing but a label. What an operator would have approved:

```
  label only     [CONFIRM 4f2a] paying a refund out runs only after your approval.
  with before    [CONFIRM 4f2a] Invoice inv_7001 has 1800 paid and 600 already refunded,
                                so 1200 is what can still go back.
```

The rule is now unconditional: every destructive tool gets a `before`.

### 3 · A read that takes no argument had no documented form

Construction refused the card, with an error the skill's pages had not prepared anyone for:

```
SLOT_UNDERIVABLE: '{usage.*}' needs getPlanUsage to accept the held call's target 'null'
```

The empty map — `needs: { usage: { tool: 'getPlanUsage', args: {} } }` — is now written out
beside the renamed form.

### 4 · A slot written from an invented field name refuses the ACT

The costliest of the four, and it survived the static gate: `{invoice.invoice.amount}` where
`getInvoice` returns `total`, `balanceDue`, `amountPaid`, `refunded`, `refundable`. The tense
could not fill, so the engine refused the call it was disclosing:

```
payInvoice(inv_7001) — not-done (the records hold nothing for this call to act on)
```

The operator was told the system had no records to work with, on an invoice the same turn had
just read. The skill now says to write every slot from a result you have actually seen, and to
fall back on `{args.*}`, which is always there.

## Level 2 — the measured run, and where it stands

The ten-case slice judged 10/10, so the hundred followed. Two runs:

```
  rep1   abandoned at the thirteenth row: the asks were quoting what the RECORD held and
         never what the ACT carried, so three cases put a refund, a settlement and a plan
         move to an operator without their figures. A subject already known to be
         defective is not worth a hundred readings.
  rep2   91 rows judged · 76 pass · 15 fail · 1 invariant unmet · monitor clean
         648 steps · 2,479,964 in · 35,639 out
```

**The bar is 85 and rep2 does not reach it.** Level 2 is open. Two of the fifteen failures
are the reference's own (43 · 87); the other thirteen fall into four groups:

| group | rows | what goes wrong |
|---|---|---|
| the `after` speaks the args, not the result | 26 · 36 | an act reported without the figure the call returned |
| the ask is missing a consequence | 30 · 31 | "owner controls the plan" without "the last owner cannot be removed" |
| a refusal names the wrong reason | 35 · 49 · 53 · 70 · 78 · 88 · 95 | a lane hand-off, a role, or all three blocking conditions at once, where the case wants the ONE that stands and a member who can act |
| the reply answers nothing | 60 · 63 | a list of completed calls in place of an answer; a planted instruction engaged with as a request |

What the mid-cycle fixes bought is visible: case 100 and case 72 both pass here, and both
FAIL in the certified reference.

## What this comparison is not

The authoring pass was **not independent**: the agent that wrote the skill also wrote the
subject, so a gap it carries in its head rather than on the page would not show up here. Four
gaps still surfaced, which says something about how much of authoring is in the details rather
than the outline — but an independent author, reading only the pages, is the stronger test and
has not been run.
