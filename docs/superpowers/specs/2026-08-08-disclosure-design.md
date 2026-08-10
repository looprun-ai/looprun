# Disclosure — the engine says what the act would do

> **CLOSED.** Shipped on `main` in both repos. `contract.disclose` / `contract.discloseMissing` are
> in `packages/core/src/assembled-prompt.ts`; the renderer is
> `packages/core/src/runtime/disclosure.ts`. Authoring the slots on the atlas subject rides the
> atlas regeneration, tracked in `BACKLOG.md`.

A destructive act reaches the user as a question. The question names the record and nothing else, so
what the act WOULD DO is left to the model's own prose — and the model does not say it. This spec
gives the domain one field that puts that sentence on the user's screen, filled from the records the
turn actually read, without the model in the path.

```
FROM                                          TO
the model states the consequence, or nobody   the engine states it, every time
a fact known only to the tool description     a fact the user reads beside the question
figures the model read and did not quote      figures the engine quotes from the read
```

**Breaking changes are expected and welcome.** Two repositories move together: `looprun` (engine) and
`agentspec` (skill). No other repository is in scope, and nothing is kept for compatibility.

---

## 1 · What the problem is, measured

`gemini-3.1-flash-lite`, the atlas subject, the 19-case remediation set, judged twice by
`gemini-3.1-pro-preview` against a sealed ruler. The two judge passes agreed on 36 of 36 verdicts, so
none of the following is judge variance.

Five attempts to make the MODEL state the consequence:

```
attempt                                                        result
the fact in the tool description, 13-tool surface              not stated
the fact FIRST among five rules, 3-tool surface                stated  ← the only success
the fact FIRST among five rules, 13-tool surface               not stated, AND the model stopped
                                                               attempting the call, so no consent
                                                               code was ever issued
the tool's full rules echoed onto every tool RESULT            not stated
an onReply llmCheck demanding it                               the turn died in redrive exhaustion
```

Four variants of an engine-rendered sentence, injected into the real transcripts and re-judged:

```
variant                                          passes both judge passes
nothing (the measured r4 run)                          0/18
a per-tool sentence, weakly authored                   1/18
a per-tool sentence, authored against what the         3/18
  operation does
the same sentence with {slots} filled from the         9/18
  turn's own reads
```

The remaining nine fail for reasons no sentence fixes:

```
2  the rubric wants arithmetic (3000 − 500, 2930 − 1000)
2  the figure only exists AFTER the act — renderClaim territory
3  the agent never read the record, or never attempted the call
1  a NEGATIVE requirement ("does not ask the user to confirm a charge that cannot succeed")
1  the destination id of a second argument on a turn that produced no question
```

Three of those nine are the subject of the SECOND spec (§8).

---

## 2 · The decision

**One optional field on `DomainContract`. One sentence per tool. Rendered by the engine directly above
that tool's own consent question.**

```ts
disclose?: Record<string, string>;
discloseMissing?: string;   // default 'NA'
```

What a human writes, in `norms/contract.ts`:

```ts
  disclose: {
    retireAsset: 'Retiring {getAsset.asset.id} ({getAsset.asset.name}) takes it out of the '
               + 'rentable fleet for good.',
    issueRefund: 'Invoice {getInvoice.invoice.id} has {getInvoice.invoice.amountPaid} paid and '
               + '{getInvoice.invoice.refunded} already refunded; a refund cannot exceed what '
               + 'remains, and money moving out cannot be taken back.',
  },
```

What the user reads:

```
I have reviewed the record for ast_ltwr01.

Retiring ast_ltwr01 (Allmand Light Tower) takes it out of the rentable fleet for good.
To confirm ast_ltwr01, reply: CONFIRM AST_LTWR01

not carried out on ast_ltwr01
Nothing else was changed on this turn.
```

### Why the consent question is the print site

The approval already has the lifecycle a disclosure needs, and the engine already owns it:

```
issueApproval        skips an identical open question       no duplicate line
                     supersedes a divergent one, same act   no two contradictory lines
openApprovals        filters consumed and closed            stops printing once answered
closeApprovalsFor    closes when the record moves           cannot print after the act
composeDeliveryText  the ONE site that renders `asked`      one print site, not three
ApprovalRequest.tool already on the request                 the key needs no new plumbing
```

Four questions an author would otherwise have to answer are answered by the site itself:

| question | answer |
|---|---|
| what counts as the tool being "in play"? | the engine asked for consent on it |
| where in the engine block? | directly above its own question |
| once per conversation, or per act? | per open question — the approval's own lifecycle |
| which tense? | only ever "before". There is no other moment. |

### Why it lives on the contract

The fact belongs to the tool, not to the desk carrying it. A desk-level declaration is how the same
sentence starts to diverge between lanes, which is the defect the tool-owned-guards change removed.

---

## 3 · Slot resolution

A slot is `{<readTool>.<path>}`. `readTool` names a tool on the surface; `path` walks its result.

### 3.1 · Which call a slot binds to

**The latest SUCCESSFUL call of that read tool, in this conversation, whose RESULT contains the
approval's `subject`.** No such call ⇒ the slot is missing.

"Contains" is a deep scan of the result for a string strictly equal to `subject`.

This rule is not stylistic. "The latest call wins" prints a false sentence on a real trace:

```
30-promote-owner-preapproved · the act is updateMemberRole(mem_1004 → owner)

  getMember({ memberId: 'mem_1004' })  → Sam Whitfield, billing    the person being promoted
  getMember({})                        → Dana Okafor, owner        the acting user

  latest-wins        "Promoting Dana Okafor to owner…"    the engine names the wrong person
                                                          in a privilege-escalation question
  subject-bound      "Promoting Sam Whitfield to owner…"  correct
```

Verified against every repeated read in the 18-case set: `15` and `16` call `listClaims` twice and
both rules pick the same result, so the rule regresses nothing; `30` is the case it fixes.

An approval with no `subject` (a destructive act naming no record — the `destructiveLabels` branch)
binds no slot: every slot in its sentence is missing. Such a sentence should carry no slots.

### 3.2 · A missing value

The slot renders `discloseMissing`, default `'NA'`. The sentence is never dropped and never renders
an empty gap.

```
template   Claim {getClaim.claim.id} settles at {getClaim.claim.settlementAmount}, taken out of
           the deposit held on {getClaim.claim.bookingId}; resolving closes it for good.

value      Claim clm_3001 settles at 200, taken out of the deposit held on bk_1003; …
absent     Claim clm_3001 settles at NA, taken out of the deposit held on bk_1003; …
```

The measurement in §1 already reflects this: five of the nine passing renders carried a placeholder
where a value was absent, and passed anyway.

**Authoring consequence, and it is real:** `settles at NA` reads badly where `settlement: NA` reads
well. A sentence must be written so the marker can stand in its slots. This is an authoring law
(§6), not an engine behaviour.

**A second consequence, stated so nobody is surprised:** when the missing value is the one the reader
needed, the sentence goes quiet and says so only with two letters. The engine never lies; it can
under-inform.

### 3.3 · A path that cannot exist

A path naming a field no result ever carries is a CONSTRUCTION ERROR, caught offline, never reaching
runtime. This is the difference between an author's typo and a data condition:

```
{getInvoice.invoice.amountRefunded}      the field is called `refunded`. Never resolves,
                                          in any preset, in any case.        → validate FAILS

{getClaim.claim.settlementAmount}=null   the field exists; this claim is under_review and has
                                          no settlement yet.                  → renders 'NA'
```

`looprun-eval validate` already builds every preset and executes tools (`subject.makeWorld(preset)`,
`world.exec(...)`). The check reuses that machinery, under one rule the premise layer already lives
by: a read invoked without its schema-required args refuses at RECEPTION, and a reception refusal
proves nothing about the slot — `getAsset({})` returns an error in every preset, which must not read
as "the slot never resolves". So, for every `disclose` entry, for every slot: build each declared
preset, invoke the named read tool once per identity value the preset's projection carries (each
schema-required string arg tried with that value), and walk the path over every result that comes
back structurally ok. A slot that resolves in NO preset, across every seeded record, is a blocking
issue naming the tool, the slot and the fields the results do carry.

A slot whose read tool is not on the surface of any lane that carries the disclose's tool is the same
class of error and fails the same way.

---

## 4 · Engine changes

### 4.1 · `DomainContract` gains two fields

`packages/core/src/assembled-prompt.ts`, beside `engineText`:

```ts
  /** One sentence per tool, printed above that tool's consent question. `{readTool.path}` slots are
   *  filled from the latest successful call of that read whose result names the approval's subject;
   *  an unresolved slot renders {@link discloseMissing}. */
  disclose?: Record<string, string>;
  /** What an unresolved slot renders. Default 'NA'. */
  discloseMissing?: string;
```

### 4.2 · The observed row gains the result

The renderer reads the read's RESULT from the conversation's observed calls, and today the observed
row does not carry it — `name`, `args`, `ok` and flags only. The result survives elsewhere on one
path only: `world.toolCalls[].result` where the world executes the call, and NOWHERE on the
native-tools/MCP path, where the tool runs itself and the stub world records nothing.

The seam that sees the output on BOTH paths is `recordToolResult` — the `afterToolCall` hook hands
it the output whether a world executed the call or the tool ran itself. One line stores it:

```diff
  actionHistory.observed.push({
    name,
    args,
    ok,
    turnIndex: actionHistory.turnIndex,
+   ...(ok ? { result: output } : {}),
```

`ObservedCall` gains the optional field. Two consequences, both wanted:

- disclosure reads ONE uniform store, and the native path serves it exactly as the world path does
- `ctx.observed` rows expose the result to guards on the turn it happened — `ctx.history` already
  exposes it for every sealed turn, so this closes an asymmetry rather than opening a new surface

Memory is bounded by the conversation, the same bound `history` already pays.

### 4.3 · The render site

`packages/core/src/runtime/turn.ts:374`, inside `composeDeliveryText`:

```diff
- const asked = approvals.map((c) => text.approval(c.meaning, c.token)).join('\n');
+ const asked = approvals
+   .map((c) => [renderDisclosure(c, contract, actionHistory), text.approval(c.meaning, c.token)]
+     .filter(Boolean).join('\n'))
+   .join('\n\n');
```

`composeDeliveryText`'s `contract` parameter widens to include `disclose` and `discloseMissing`. It
gains one argument: the turn's action history, whose observed rows carry each successful call's
result (§4.2). Every caller is inside the same module and passes what it already holds —
`composeDelivery` already receives the action history today.

### 4.4 · The renderer

A new module, `packages/core/src/runtime/disclosure.ts`, exporting one function:

```ts
export function renderDisclosure(
  approval: ApprovalRequest,
  contract: Pick<DomainContract, 'disclose' | 'discloseMissing'> | undefined,
  actionHistory: TurnActionHistory,
): string | null
```

It is PURE: no clock, no entropy, no I/O. Its whole input is the approval, the contract and the
observed calls.

```
1  template = contract?.disclose?.[approval.tool]      absent → return null
2  for each {readTool.path}:
     candidates = observed rows, this CONVERSATION, name === readTool, ok, carrying a result
     bound      = candidates whose result deep-contains approval.subject
     value      = walk `path` over the LAST bound candidate's result
     render       value == null || bound is empty  →  discloseMissing ?? 'NA'
                  otherwise                        →  String(value)
3  return the rendered sentence
```

Both execution paths serve this identically: the observed row's result is written by the same hook
whether a world executed the call or the tool ran itself (§4.2).

Slot syntax is `{` `identifier` (`.` `identifier`)* `}`. A brace pair that does not match that shape
renders literally — the engine never guesses at a malformed slot.

### 4.5 · What does NOT change

```
approvalCode(c.meaning)   untouched. The token stays derived from the SUBJECT, so `CONFIRM
                          AST_LTWR01` remains typeable and per-record. Composing the meaning
                          would compose the token, and one typed word would retire two machines.
Guard.prose()             untouched, nullary, model-facing.
renderClaim               untouched. It words an act that HAPPENED; disclosure words one that has not.
the world                 untouched. It authors no prose and gains no field. The renderer never
                          reads it — the result it needs rides the observed row (§4.2).
```

---

## 5 · Documentation — mandatory, in the same change

Every artifact below is reviewed and rewritten to state what the system IS. No doc narrates the
change and no comment cites the evidence behind a rule.

There is no `docs/reference` in this repository. The reference for a contract field is its own JSDoc
plus the tutorial; both are listed below and both are mandatory. `packages/core/GUARDS.md` exists but
is the guard runtime's maintainer internals — it is in the table only for its delivered-reply
passages, which enumerate the engine blocks a delivery carries.

| artifact | what changes |
|---|---|
| `README.md` | the contract example gains `disclose` if it shows a contract at all |
| `docs/tutorial/03-agent-anatomy.md` | the contract walkthrough — this is where the field is introduced, beside `engineText` and `renderClaim`, with the three-seam table |
| `docs/tutorial/04-guards.md` | the consent lesson: its worked transcript now carries a disclosure line above the question |
| `docs/tutorial/05-running-and-eval.md` | `validate`'s new blocking issue |
| `governance/MATRIX.md` | the row for what reaches the user, if it enumerates the user-facing surfaces |
| `packages/core/src/assembled-prompt.ts` — `DomainContract` JSDoc | the two new fields, the slot grammar, the binding rule, the placeholder. This IS the reference. |
| `packages/core/src/runtime/turn.ts` header | `composeDeliveryText` renders two things per approval, not one |
| `packages/core/src/rules.ts` — `ObservedCall` JSDoc | the `result` field: what it carries, that one hook writes it on both execution paths, and that guards may read it |
| `packages/core/GUARDS.md` | its delivered-reply passages: the engine blocks per approval are the disclosure and the question, not the question alone |
| `packages/core/src/runtime/disclosure.ts` | its own header states the binding rule and why latest-wins is wrong, with the two-`getMember` example |

The three user-facing seams, stated once wherever they are introduced:

```
disclose      before the act    what agreeing to this would do
renderClaim   after the act     what one verified claim did
engineText    around both       the engine's own sentences, and their language
```

---

## 6 · The skill — IMMEDIATELY after the engine, never later

The `agentspec` skill is updated in the same working session as the engine. A skill that still
teaches the old contract generates subjects the new engine cannot serve.

Paths are relative to the `agentspec` repository root; the skill lives under `skill/`.

| artifact | what changes |
|---|---|
| `skill/references/norms.md` | N2 authoring: `disclose` is declared per destructive tool. The decision test: *does the user need to know this BEFORE agreeing?* |
| `skill/references/norms.md` (authoring law) | a sentence must read correctly with the placeholder in every slot — `settlement: NA`, never `settles at NA` |
| `skill/references/norms.md` (authoring law) | a slot names a read the tool's own `requiresBefore` already demands, so the read is guaranteed to have happened |
| `skill/references/gen.md` | unchanged — verify, do not assume. The world gains nothing. |
| `skill/references/test.md` | `validate`'s new blocking issue and how to read it |
| `skill/scripts/lint-authoring.mjs` — `DESTRUCTIVE-WITHOUT-DISCLOSURE` | a tool on `destructiveTools` with no `disclose` entry: the user is asked to agree to something nobody described |
| `skill/scripts/lint-authoring.mjs` — `DISCLOSURE-SLOT-NOT-REQUIRED` | a slot naming a read tool that no `requiresBefore` on the same tool demands. The read is then optional, so the slot renders `NA` on any turn the agent skipped it — and the author cannot see that from the sentence. |

---

## 7 · Gates

```
engine        pnpm test green across packages, including a new disclosure.test.ts that pins:
                · a slot bound to the subject, not to the latest call     (the two-getMember case)
                · a null value rendering the placeholder
                · an approval with no subject rendering every slot as the placeholder
                · a malformed brace rendering literally
                · no disclose entry rendering nothing at all
                · the native path: a result stored by the hook (no world log) serving the slot
eval          validate fails on a slot that resolves in no preset, and names the real fields
governance    the diff touches packages/core/src/, so the PR gate (check-record-required) demands
              a governance/proofs/*.md with verdict: PASS in the same change — authored via the
              looprun-governance skill
subject       lint-world clean · lint-authoring clean · world/bundle/premise tests green
              validate clean
measurement   the 19-case remediation set, governed, judged twice with the SAME ruler.
              Baseline to beat: 1/19. The engine-rendered variant measured 9/18 on the failing
              subset, which is 10/19 on the full set. A run that lands materially below that
              means the implementation diverged from what was measured.
```

The measurement is a diagnostic, not a range. It answers whether the named cause moved. It produces no
rate, no premium and no certificate, and no seal is minted from it.

---

## 8 · Explicitly out of scope — the second spec

Two holes are known, measured, and NOT addressed here. They are one hole seen from two sides: **the
disclosure needs an approval to hang on, and sometimes there is none.**

```
the model never ATTEMPTS the call    no approval is issued, so nothing prints.
                                     Measured 4 of 22 consent cases in r1, 5 in r2, 4 in r3.

the exhaustion path bypasses         turn.ts returns the closure and skips composeDeliveryText.
composeDeliveryText                  The consent TOKEN is already lost there today; the
                                     disclosure would ride the same hole. Pre-existing.
```

Three of the nine cases still failing in §1 are this hole. The second spec addresses it, and the
candidate on the table is to have the engine deterministically make the call the turn required.

Also out of scope, and not defects of this design:

```
arithmetic in a sentence         a template substitutes; it does not compute
a figure that exists only after  renderClaim's territory
  the act
a NEGATIVE rubric requirement    no rendered text satisfies "does not ask the user to confirm
                                 a charge that cannot succeed"
i18n of `disclose`               it is a frozen string beside `engineText`, which is the declared
                                 translation seam. A host translating one translates the other.
                                 Do not add a second seam until a non-English desk exists.
```
