# Worst world, owned truth — design

Date: 2026-08-06 · Status: implemented on `main` (engine and skill repos) · Scope: engine
(`packages/core`), the agentspec skill (gen, evals, lints).

Three things landed differently from what this document proposed. The delivery funnel scrubs only
the model-authored prose — the engine's own blocks (approval questions, record lines, the closure)
compose from the already-filtered record and ship verbatim, because a net over the whole composed
text eats a digit-shaped approval token and leaves the act unconfirmable. The filter's guarantee is
seam-scoped: the world seam filters inside the tool, before the model reads the result; a
self-executing tool (native, MCP) returns straight to the model runtime, so there the declarations
bind the record and every delivery composed from it. And `noDuplicateCall` matches a scrubbed call
by its written form, so the loop gate fires on a repeat whose declared free-text argument the seam
rewrote. Atlas regeneration and re-measurement are out of scope: the lints already price that debt
on the shipped subject (`lint-world` 285, `lint-authoring` 17), and the regeneration plan owns it —
starting with the reconciliation of `WRITE-REFUSED-UNGATED` against the guard ownership law, which
give opposite verdicts on an ungated documented refusal.
Siblings: `2026-08-06-consent-dead-ends-design.md` (shipped, v0.14.0) — this design keeps its
vocabulary (`simulate`, `simulationResult`, approval code) and extends its direction: the schema
tells the truth, the engine owns what it knows, and the exam measures the model.

## The decision

Four laws, one theme — governance owns every rule the tool surface does not promise, and it never
hides behind a friendly fixture:

1. **Worst world.** A generated world implements exactly what the tool surface documents — nothing
   safer. Undocumented behavior is modeled at its worst.
2. **Owned gap.** A guard exists for every rule the surface does not document; a guard that
   duplicates documented surface behavior is deleted. A simulation is a read and passes the gate.
3. **Rendered truth.** The engine renders what it knows — authored report lines, open approvals,
   authored error sentences — and never raw read data.
4. **The exam measures the model.** An eval never scores the engine's own enforcement as the
   model's defect: a consented act stopped by the throttle is the runtime working.

## 1 · Worst world (gen)

A fixture world exists to certify governance against the surface the business will actually run
on. Every safety feature the fixture adds beyond the documented surface inflates the measurement —
the ungoverned variant inherits it too, the pair ties, and the governance premium disappears —
and the certificate overclaims: deployed against the real executor, the invented kindness is gone.

The law, per behavior in `world.ts`:

```
documented in tools.json / the docs digest  →  the world implements it faithfully
silent                                       →  the world assumes the WORST:
                                                returns raw data, executes any
                                                well-formed call, cannot simulate
anything the business needs beyond that      →  governance owns it (it is what ships)
```

**Lint (gen):** every validation, mask or refusal in a generated `world.ts` must cite the
`tools.json` entry or docs line that promises it. A safety behavior with no citation is a
governance responsibility smuggled into the fixture, and the lint fails the build.

What this removes from the atlas fixture (none of it documented): source-side PII masking
(`maskEmail`/`maskPhone`), the viewer read-only write gate, the role→capability `permGate`. What
stays: every error the surface documents (`SOLE_OWNER_PROTECTED`, `PLAN_DOWNGRADE_BLOCKED`,
`BOOKING_QUOTA_EXCEEDED`, `TECHNICIAN_DOUBLE_BOOKED`, lifecycle and cap codes) — those are the
real API's own promises, and the simulate-validity law still mirrors them.

## 2 · Owned gap (gen + engine)

### 2.1 The guard ownership law

With the world at its documented shape, the guard surface is derived, never doubled:

```
rule documented on the surface   →  NO guard: the call (or its simulation) returns
                                    the domain error, with the figures the reply needs
rule the surface does not know   →  a guard — the only enforcement that ships
```

The mirror costs twice. It vetoes the legitimate simulation — `removeMember({memberId,
simulate: true})` is a no-op question the world would answer `SOLE_OWNER_PROTECTED` — and the
exam scores the veto as a forbidden attempt. And it replaces the world's figure-rich error
(`PLAN_DOWNGRADE_BLOCKED: 6 seats used, 2 active bookings exceed the starter caps`) with guard
text that carries no figures, which is the fact the rubric then finds missing.

### 2.2 A simulation is a read (engine)

One check, in `evaluatePreTool`, before any guard runs:

```ts
// A schema-licensed simulation changes nothing and the world validates it in full —
// it is a read. Only the always-family still applies (a looping simulation is a loop).
if (args.simulate === true && actionHistory.simulatableTools?.has(tool)) {
  return evaluateAlwaysGuards(ctx);
}
```

`simulate` remains a destructive-tool concept only: a reversible write needs no preview (its
failure already has no effect; its success is correctable), and the set stays
`simulatableTools` — destructive AND the declared schema carries the parameter. The bypass is
schema-licensed, never call-licensed.

## 3 · Rendered truth (engine + gen)

### 3.1 Refusal by rule is groundable

`claimIsGrounded` accepts a `blocked`/`refused` intention today only on a vetoed attempt or a
failed call. The exam forbids the attempt — so the compliant refusal is undeclarable:

```
exam    "do not touch releaseDeposit"        → the model obeys, only reads
model   "I refuse: claim clm_3001 is open"   → the right answer
guard   refused, no attempt, no failure      → no evidence → veto → redrive →
        exhaustion → the canned line ships and the blocker is never named
```

New grounding row: a `blocked`/`refused` claim is grounded when a read this turn addressed the
entity AND no effected write touched it. The anti-lie edge holds: an effected write on the entity
still refutes the refusal.

The redrive message names what IS declarable: alongside each violation, the outcome words the
turn's evidence supports for that entity — the model converges in one rewrite instead of
exhausting.

### 3.2 The closure carries authored sentences only

The exhaustion closure composes, per failed claim, the world's own error message — an authored
sentence, the same trust class as `confirmationPrompt` — and, where a spec authors one, a guard's
public sentence. Never raw read data: the closure ships after the reply checks are exhausted, so
anything injected there bypasses them by construction.

```
today     "One action completed. An action could not be completed."
becomes   "One action completed (ast_genr01: back in service).
           scheduleMaintenance did not run: 'ast_genr01 is already in maintenance.'
           Nothing else was changed on this turn."
```

### 3.3 The operation record carries the result's report

A write result (and a simulation result) carries a gen-authored `report` line; the engine appends
it to the operation record it already renders under every delivery. Open approvals render every
turn until answered or closed.

```
today     bk_1001: done
becomes   bk_1001: done — removed tech_4003; 2026-07-10 freed
          bk_1001: awaiting your confirmation — deposit charge outstanding
```

The delivered message stays a collage the model cannot edit: its prose first, the engine's record
after. The facts a rubric demands arrive even when the prose forgets them.

## 4 · The sensitive-data filter (engine + contract)

The fixture no longer masks (§1) — a real executor returns what it returns, so the enforcement is
a filter on our side of the boundary, before any result enters the model's context:

```
executor (any) ──raw result──▶ ENGINE FILTER ──▶ model context
                                │
                                ├─ omit: the field is deleted
                                └─ mask: the value is replaced by its masked form
                                (driven by contract.sensitiveFields)
```

```ts
contract.sensitiveFields = {
  'customer.phone': 'omit',   // nothing consumes it → it never exists in context
  'customer.email': 'mask',   // the user must recognize it → masked form only
};
```

- Entry-side filtering is strictly stronger than delivery-side redaction: what never entered the
  context cannot be paraphrased ("ends in 99" dies here too).
- There is no third mode. The "model needs the raw value to act" case dissolves under an authoring
  law: a tool takes the record id and resolves the sensitive value internally
  (`sendSMS({customerId})`, never `sendSMS({phone})`). A field that genuinely must transit is
  simply not declared.
- The footer, the consent question and the closure read from the filtered record, so everything
  the engine renders is clean by construction.

**Free text** is the one place field filtering cannot reach — PII embedded in prose. A pattern
scrub (filter, never a guard: it masks silently, no veto, no redrive) runs inside declared
free-text fields only:

```ts
contract.scrubTextFields = ['fileClaim.description', 'updateAssetCondition.notes'];
```

at three points: inbound results, outbound write arguments (protects what gets STORED and every
later reader), and the delivery funnel. Patterns cover well-formed classes only — email (high
precision), card numbers (digit runs passing the Luhn check), conservative phone shapes — and the
spec says so plainly: names and addresses are the assumed residue, measured by prose and judge,
covered by no pattern. Scrubbing a stored business field is a contract decision per field, never a
global default: a desk that legitimately needs a callback number in a description does not declare
the field, and the acceptance is authored and visible.

## 5 · The exam measures the model (skill/evals)

A rapid-fire case types two approval codes in one message. Both acts are consented; the
one-act-per-turn cap stops the second; the veto is the runtime working — the engine's own proof
lanes already certify it. The case therefore stops listing the second consented act as forbidden:

```
today     forbiddenToolCalls: [{ name: 'cancelBooking', args: { bookingId: 'bk_1004', … } }]
becomes   requiredToolCalls:  [ the first act ]
          rubric:             the final reply reports the second as outstanding,
                              taking another turn — the model's share of the law
```

The same applies to a consent code that licensed nothing: attempting the act is what re-raises the
question (the veto IS the question), so the attempt is not the model's defect. Optional DSL flavor
for authors who want the engine's share asserted per-case: an invariant that a named call `took no
effect`, scored over the world's action history — it never counts a veto.

`evals.md` rewrites its rapid-fire recipe accordingly, and the forbidden entry keeps its shipped
simulate-first semantics: it keys on the acting shape, never on a simulation.

## Deletions

| deleted | replaced by |
|---|---|
| fixture-side masking, permGate, viewer write gate (undocumented kindness) | worst-world law + the lint |
| generated guards duplicating documented world errors | the call or its simulation returns the domain error |
| `minimalDisclosure` as unowned prose | `contract.sensitiveFields` + `scrubTextFields`, engine-enforced |
| the rapid-fire `forbiddenToolCalls` entry on the second consented act | required first act + outstanding-report rubric |

## How to measure

- **Engine proofs:** simulation-passes-guards (positive/negative on schema licensing);
  refusal-by-rule grounding (grounds on reads, refuted by an effected write); closure sentence
  composition; report-line and open-approval rendering; filter omit/mask/scrub cases including a
  free-text scrub of a stored argument. Fresh proof records; `check-record-required` gates.
- **Gen lint:** the citation rule (§1) and the per-field declarations (§4) validated at authoring.

## Order of work

```
1  engine   simulation-is-a-read · grounding row + redrive text · closure sentences ·
            report/approval rendering · sensitive filter (fields, scrub, funnel)
2  skill    gen worst-world law + lint · guard ownership law · contract declarations ·
            evals rapid-fire rewrite
```
