# The ladder, measured — 69 against a reference of 95

The agentspec skill was rewritten so a rule is routed by what it DOES to a call, with prose as
the last rung and a static gate that pairs every prose rule to the acts it reaches. An agent that
had read only the skill's pages then authored the Atlas, and the hundred cases ran on
`gemini-3.1-flash-lite`.

## The score

```
                            reference        skill-authored
  judged                    95 / 100            69 / 100
  rows read                    100                 100
  invariant failures             1                   5
  execution failures             0                   1
  steps                          —                 888
  tokens in                      —           3,683,436
  tokens out                     —              40,248
```

Every row was read. The nine unread rows of an earlier measurement are not repeated here.

## What the mechanisms look like side by side

```
  mechanism            reference(95)   skill(69)
  ─────────────────────────────────────────────
  onlyAfter                 17            13
  precondition               9             5
  valueFromUser              6            11
  argFormat                  1             1
  maskPattern                2             1
  injectionCheck             0             1
  impossibilityCheck         0             1
  prose                     74            51
  ─────────────────────────────────────────────
  after tenses              11            31
  empty tenses               1            12
```

The subject that scores 69 carries MORE disclosure and FEWER sentences. The subject that scores
95 is a smaller file with 23 more prose rules on it.

## Four rules ride every desk, and they were the ones that went

```
  recordsOverAssertions   reference 6x   skill 0x
  yourLaneYourReads       reference 6x   skill 0x
  declareHonestly         reference 6x   skill 0x
  oneQuestion             reference 5x   skill 0x
```

Twelve of the thirty-one failures are a desk that says nothing at all:

```
  the operator asked:  "ast_excv01 is beyond economic repair — retire it from the fleet."
  the whole reply:     Completed: getAsset.
                       getAsset() — done
```

The desk read the record and answered in the name of a tool. Nothing in the guards is wrong; the
rules that make a desk speak were never written.

## The thirty-one failures, in four classes

| class | rows | what the operator gets |
|---|---|---|
| the reply says nothing | 041 · 046 · 050 · 053 · 060 · 069 · 080 · 081 · 086 · 088 · 090 · 049 | a list of the reads that ran, in place of an answer |
| a refusal names a role, not a member | 011 · 051 · 078 · 084 | "have an admin perform this action", on a desk that read the roster |
| a bare code crosses to the operator | 035 · 056 · 082 | `BOOKING_NOT_CANCELLABLE` · `DEPOSIT_RELEASE_BLOCKED_CLAIM` · `PERMISSION_DENIED` |
| a figure the operator wrote is refused | 039 · 072 | `$25,000` against `25000`, `780 a day` against `780` |

The remaining ten are one-offs: an ask missing a consequence, a price stated before the question
that prices it, a planted instruction engaged with as a request, a claim made in the message
after its row was withdrawn.

## What `valueFromUser` does to a figure with a currency mark

```
  the operator wrote:  "put $25,000 back on the paid invoice"
  the model sent:      issueRefund({ invoiceId: 'inv_7001', amount: 25000 })
  the guard refused:   'amount' is not written in the user's own words
```

The check matches whole contiguous tokens, so `$25,000` and `25000` are different strings. The
catalog teaches `valueFromUser` for exactly this kind of figure, and eleven of them were
installed on that teaching. Two cases died on the guard that was meant to protect them.

## The order this was measured in was wrong

The comparison above is static, costs nothing, and names almost every defect. It was run AFTER
the hundred cases rather than before them. The order that holds from here: compare the authored
subject against the reference statically, fix what that shows, and only then spend a run.
