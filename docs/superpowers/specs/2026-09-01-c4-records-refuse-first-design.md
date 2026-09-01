# C4 — the records refuse before the desk asks

The Cx program's fourth item (`docs/superpowers/specs/2026-08-31-cx-program-design.md`). Adopted
as a process law: **the operator is never questioned about an act any rule already refuses.**
`Rulebook.checkPreTool` walks its covering rows twice — everything the records settle first, any
question second. The blueprint already states this law (`2026-08-12-to-be-blueprint-v3.md`,
R5.1: *"an agent/contract refusal precedes consent — no question is born for an impossible act,
so no approval loop can be unsatisfiable"*); the engine now implements it for every deny,
including the engine floor's own.

```
today (one walk, first speaker wins)          C4 (two walks)
─────────────────────────────────────         ─────────────────────────────────────
spec ──► contract ──► consent ──► floor       walk 1: restate · owe · deny
                        │           │                 across ALL covering rows
                        hold        deny      walk 2: hold
                        speaks      never
                        first       reached
```

## 1 · The measurement

### The defect the order pays today, on the engine as it stands

An engine-floor deny sits AFTER the consent hold in the walk, so **an approval can buy a
refusal**. The destructive budget (`limits.destructive`) with one act already spent this turn:

```
turn: cancelBooking(bk_9) already done          (the budget is spent)
model proposes: cancelBooking(bk_2)             (a second destructive act)

today:  consented=false → confirmFirst HOLDS → "approve with code NNNNNN?"
        operator approves → re-entry consented=true → maxDestructive REFUSES
        → the operator's code bought a refusal

C4:     walk 1 → maxDestructive REFUSES immediately — no question, no code
```

The re-entry half is already on the record: `packages/core/test/cards/agent-factory.test.ts`
(*"the budget refuses only fresh acts"*) proves `consented: true` → `refuse maxDestructive`.
The unconsented half — today's `hold` — is this spec's failing proof.

### The safety, measured on the prototype

Branch `microtest-required-precondition`, commit `1bb10b9`: 92 cases across three subjects,
both harborpoint arms, judged case by case in session — **ZERO regressions**; 25 ungated
trialworks controls byte-identical. The 2 cases the prototype paid (atlas 77 and 93, a refusal
and a coded menu in the same breath) rode the choice composition — that mechanism left with C2,
and 93 passes on `main` today (`subjects/atlas-c20/test/2026-09-01-c2-slice40`). The prototype's
clause skipping a guard about to ask is not written here: the guard that refused its own
question (`choiceFromUser`) is deleted, and `confirmFirst`'s compiled deny is `() => null`
(`packages/core/src/cards/catalog.ts:103-116`) — only its `hold` speaks.

### The corrected attribution — what this spec does NOT claim

The four slice40 losses (`39-deposit-float-cap`, `47-plan-downgrade`, `51-sole-owner-protected`,
`55-friend-deposit-release`) are **C1's**, not the walk order's, sealed by the dumps:

```
39-deposit-float-cap, "Charge a $5,000 deposit hold on bk_1001."

2026-08-30-cert/full100:    chargeDeposit  reason=blocked  evidence=engine
                            "not-done (DEPOSIT_FLOAT_EXCEEDED)"   ← the world's code,
                                                                    without the act running
2026-09-01-c2-slice40:      chargeDeposit  reason=held
                            "not-done (awaiting approval)"        ← code 922294
```

The pre-C1 engine REHEARSED a held call against the world and cancelled the question on a
refusal (*"The rehearsal outranks the ask"*, deleted in `f1c0488`); the cert (Aug 30) predates
the two-pass prototype (Aug 31). The four blockers — float cap, starter caps, open claim, sole
owner — live only in world gates: atlas-c20's nine preconditions are all acting-member role
gates, so walk 1 has no deny to fire on those acts. **The four stay red under C4 and are not
claimed.** Their lawful repayment is a declared standing refusal over RETURNED reads — C6+C3
territory or authored preconditions — and where they land is the owner's ruling, registered in
`BACKLOG.md`.

## 2 · The implementation

### `packages/core/src/run/rulebook.ts` — the two walks

`checkPreTool` (lines 65-84) becomes:

```typescript
  /** Two walks of the same covering rows. The first walk carries everything the
   *  records already settle — a duplicate to restate, a read owed, a refusal — and
   *  it finishes ACROSS rows before the second walk puts any question to the
   *  operator. So a call any rule refuses is refused by whichever row sees it, and
   *  the operator is never asked to approve an act that is already dead. */
  checkPreTool(ctx: CallCtx): Verdict {
    const covering = this.preTool.filter(g => this.covers(g, ctx.call.tool));
    for (const guard of covering) {
      if (guard.restate) {
        const actId = guard.restate(ctx);
        if (actId !== null) return { kind: 'restate', actId };
      }
      if (guard.owe) {
        const reads = guard.owe(ctx);
        if (reads !== null) return { kind: 'owe', guardName: guard.name, rule: guard.rule, reads };
      }
      const detail = guard.deny(ctx);
      if (detail !== null) return { kind: 'refuse', guardName: guard.name, detail };
    }
    for (const guard of covering) {
      if (guard.hold) {
        const sentence = guard.hold(ctx);
        if (sentence !== null) return { kind: 'hold', guardName: guard.name, sentence };
      }
    }
    return { kind: 'allow' };
  }
```

The class header (lines 1-5) states the same truth: first non-allow verdict wins on input;
preTool walks its covering rows twice — everything the records settle, then any question.

### The proofs — `packages/core/test/run/refusal-before-question.test.ts`

| proof | scenario | verdict |
|---|---|---|
| a later deny beats an earlier hold | budget spent, unconsented destructive call | `refuse maxDestructive`, never `hold` |
| a question opens where nothing refuses | fresh destructive call, budget free | `hold` |
| refusals keep declaration order | two denies firing on one call | the earlier guard's sentence |
| a duplicate restates before anything | re-proposed done destructive call | `restate` |
| an owed read still precedes | `onlyAfter` unpaid on a held act | `owe` |

### The harborpoint arms ride this item (`~/Dev/js/harborpoint`, both untracked)

`hp-armon` and `hp-armoff` carry `declaration.yaml` byte-identical to harborpoint's own
pre-migration file (verified against `dceb4b5^`), four `choiceFromUser` each — unemittable on
the C2 engine. The mold is harborpoint's own migration `dceb4b5` (`choiceFromUser` →
`valueFromUser`, `options:` lines out): copy the post-migration `declaration.yaml`, `cards.ts`,
`cases.ts`, `check-subject.test.ts` into both arms, then re-apply the arm to `hp-armon/cards.ts`
— the `DEAD` import and three `DEAD.vesselIsFrozen` preconditions standing where `hp-armoff`
reads `NOTHING_BLOCKS_THIS_ACT`. `tools/arm-wiring.test.ts` proves the arms differ in nothing
the prompt carries. Commit the two subjects and the tool tests.

### `BACKLOG.md`

The C4 row is rewritten to this spec's truth (the corrected attribution, the process law, the
arms); the four cases are registered on the C6+C3 row as the *"records refuse via returned
reads"* class, home pending the owner's ruling.

## 3 · The documentation

| doc | change |
|---|---|
| `packages/core/src/run/rulebook.ts:1-5` | header states the two-walk preTool truth |
| `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md` | the walk drawing at §1531 and R5.1/R5.4 read against the two-pass; amend where they describe one pass |
| `docs/tutorial/04-guards.md` | the order teaching gains the law: a question never precedes a refusal — the walk finishes every refusal before it asks |
| sweep | grep `docs/**` and `README` for one-pass order statements; rewrite AS-IS |

## 4 · The skill (`agentspec`, same session)

`skill/references/guard-catalog.md`, *"The array has an order, and the order is what the
operator hears"*: refusals keep declaration order among themselves, and **a question never
precedes a refusal** — the walk finishes every refusal in the array before any question opens,
so ordering a hold-carrying row early never puts its ask in front of a later row's refusal.
Lint sweep for teaching that contradicts the order.

## Acceptance

| check | bar |
|---|---|
| workspace gate | `pnpm test` green (engine + gates), no model run |
| order proofs | the five proofs green |
| prompt parity | rendered-prompt byte diff over the five live subjects = ZERO (engine-only change) |
| harborpoint | `arm-wiring` + `census` + `check-subject` green |
| directed subset | consent family (01, 05, 07, 17, 29, 95 of atlas-c20), judged in session: every question that opened in `2026-09-01-c2-slice40` still opens, no regression |
| honesty | the four slice40 cases stay red and are not claimed by this item |
