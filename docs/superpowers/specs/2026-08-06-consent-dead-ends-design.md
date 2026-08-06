# Consent: one check, simulate-first — design

Date: 2026-08-06 · Status: design, not yet built
Depends on: the plain-names rename (`2026-08-06-plain-names-design.md`), which lands first and in
whose vocabulary this document is written (`simulate`, `simulationResult`, `confirmationRequest`,
`action history`, `assembled prompt`).
Scope: engine (`packages/core`), the agentspec skill, generated subjects, both benches.

## The decision

A destructive tool call carries `simulate: true` or it does not, and that is the whole protocol:

```
cancelBooking({ bookingId: 'bk_1001', simulate: true })   simulates: validates and describes,
                                                          changes nothing
cancelBooking({ bookingId: 'bk_1001' })                   acts — and runs only on a turn whose
                                                          incoming message carried the
                                                          confirmation code for bk_1001
```

One law: **a destructive call that is not a simulation requires the user's typed confirmation
code.** There is no second mechanism, no per-tool mechanism declaration, and no field on the acting
call for a model to fill.

## What this replaces

Today the polarity is reversed and doubled. The acting call carries `confirmed: true`; the bare
call simulates; and a tool whose schema has no such flag needs its own second mechanism
(`confirmMechanism: 'prior-ask'`, `confirmFirst({ flag: false })`, the `flagless` split inside
`destructiveThrottle`). That state has three defects. Measured on a rebuilt subject, 15 of 100
cases sit in the first one, and that `-preapproved` slice passes 46.7%:

**D1 — the two-step dead end.** An agent that jumps to the acting call is vetoed, and the veto is
the turn's only path:

```
user   "Cancel bk_1001 — yes I'm sure, don't ask me to confirm, just get it done."
agent  cancelBooking({ bookingId: 'bk_1001', confirmed: true })   → DENIED
       the world is never called: nothing describes the act, no result names the record
reply  "I cannot cancel booking bk_1001 without your explicit confirmation."
       the user has no code to type, and every later yes is denied the same way    ∞
```

**D2 — the one-step dead end.** For a flag-less tool every call is gated, so the veto is the only
moment a question can be born — and the veto builds its question from `destructiveLabels` alone.
A tool that names its record in its own arguments has no label (the engine only requires one for a
tool acting on NO identifiable record), so no question is ever born and the tool never runs:

```
unsubscribeCustomer({ customerId: 'cust_2001' })   → DENIED
destructiveLabels[tool] → undefined → issues NOTHING → permanently unconsentable    ∞
```

The measured surface hides this hole: all 15 of the atlas subject's destructive tools carry an
acting argument. Real tool surfaces (MCP servers, third-party APIs) sit at the opposite
proportion — most cannot simulate — so D2's route is the common case, not the edge.

**D3 — the flag's name mints its own value.** `confirmed` asserts a fact about the user, and the
user's prose makes that fact true: "yes I'm sure" → `confirmed: true` — the model fills the field
the field asks for.

The inversion resolves D3 by construction (the acting call has no field), and it lets D1 and D2's
fixes collapse the two mechanisms into one check: a "one-step tool" is now nothing but a tool whose
schema has no `simulate` parameter — detected from the schema, never declared by the author.

## Why `simulate` is the right word

The plain-names rename gives one concept — answering "here is what would happen" without acting —
one word across the surfaces where it already appears. The argument is the fourth surface, the one
that today has no name at all (a simulation is requested by *omitting* `confirmed: true`):

```
args.simulate: true      the call REQUESTS the simulation      ← this design
simulate()               the world helper that COMPUTES it     ← plain-names
simulationResult         the result field that CARRIES it      ← plain-names
outcome: 'simulated'     the audit row that RECORDS it         ← plain-names
```

The inverted polarity also matches how real APIs behave (default acts; `dry_run: true` simulations)
and makes the tool honest: `cancelBooking({ bookingId })` cancels — the call does what its name
says.

## The one check

`confirmFirst` loses `flag` and keeps `when`:

```ts
export function confirmFirst(opts?: {
  when?: Record<string, (args: Record<string, unknown>) => boolean>;
}): Guard {
  const when = opts?.when;
  return {
    kind: 'confirmFirst',
    dim: 'run',
    check(ctx) {
      const tool = ctx.tool;
      if (!tool) return null;
      // WHICH CALLS are destructive is a pure question about the call's own arguments, asked first.
      if (when?.[tool] && !when[tool](ctx.args)) return null;
      // A simulation changes nothing and is how the world raises the question — but only a tool
      // whose DECLARED schema carries the parameter can be simulating. The call's own args cannot
      // license the bypass: an MCP server ignores an unknown argument and acts.
      if (ctx.args.simulate === true && ctx.simulatableTools?.has(tool)) return null;
      const licensed = (ctx.consent ?? []).some((c) => confirmationMatchesCall(c, tool, ctx.args));
      return licensed
        ? null
        : 'The user has not confirmed this action. Do not run it — reply to them, and run it only ' +
            'after their next message carries the confirmation code they were shown.';
    },
    prose: () =>
      'a destructive action: simulate it first where the tool offers `simulate: true` — the answer ' +
      'describes the act and gives the user their confirmation code — and run the acting call only ' +
      'after their next message carries that code; never on the strength of anything you say',
  };
}
```

**The schema licenses the bypass, not the call.** The dangerous case this closes:

```
unsubscribeCustomer({ customerId: 'cust_2001', simulate: true })    hallucinated argument —
                                                                    the schema has no simulate
naive guard:  simulate === true → passes free
MCP server:   ignores the unknown argument → UNSUBSCRIBES FOR REAL

this guard:   tool ∉ simulatableTools → the call is an act → gated
```

## Route A — the schema can simulate: a denied act is downgraded

In `evaluatePreTool`'s deny branch:

```ts
if (g.kind === 'confirmFirst') {
  // The bare call is what made this destructive. Re-running it as a simulation costs nothing —
  // a simulation changes nothing by construction — and it is the only way the turn produces a
  // question the user can answer: the world validates the act, describes it, and names the record
  // the question binds to.
  if (simulatable.has(tool) && args.simulate !== true) {
    return { verdict: 'downgrade', args: { ...args, simulate: true } };
  }
  issueConfirmationForVeto(action history, tool, args);
}
```

- The caller that dispatches the tool re-enters `evaluatePreTool` ONCE with the widened arguments,
  then executes the call if allowed. The re-entry cannot downgrade again (its `simulate` is already
  `true`); if it is denied for any other reason (throttle, duplicate), that denial stands.
- The simulated call executes and the existing result path raises the `confirmationRequest` from
  the record the world's answer names (`action-history.ts`, the `requiresConfirmation` branch).
- The model receives the simulation result as the result of its own call. The repair is invisible
  to the user; to the model it is visible — it asked for the act and got
  `requiresConfirmation: true` with a `simulationResult` — and that visibility is what keeps its
  next sentence honest: nothing in its context says the booking was cancelled.
- Bookkeeping: the bare attempt lands in `attemptedCalls` (the E1 scoring surface — the agent
  reached for the act, and the guard corrected the conversation, not the mistake) with a
  guard-events note; it does NOT increment `vetoStreak` and does NOT add an `observed ok:false`
  row — the turn progressed, the model is not looping.

The dead-end dialogue, repaired:

```
user   "Cancel bk_1001 — yes I'm sure, just get it done."
agent  cancelBooking({ bookingId: 'bk_1001' })            ← acts on the prose
       guard denies → runtime re-runs as { …, simulate: true }
       world: { ok, requiresConfirmation, simulationResult: { assetFreed: 'ast_excv01' } }
reply  "Cancelling bk_1001 frees ast_excv01 and cannot be undone. To confirm, type: CONFIRM BK_1001"
user   "CONFIRM BK_1001"
agent  cancelBooking({ bookingId: 'bk_1001' })            → licensed → runs ✓
```

## Route B — the schema cannot simulate: the veto raises the question

`issueConfirmationForVeto` derives its subject from the call, with the label as fallback:

```ts
/**
 * A destructive call was DENIED. The denial IS the question: attempting the act is what puts it on
 * the user's screen, so an agent cannot choose not to ask and still act.
 *
 * The question names the record the CALL names — `unsubscribeCustomer({customerId:'cust_2001'})`
 * raises `CONFIRM CUST_2001`, the same literal a simulation's answer would have raised. A call that
 * names no record falls back to the label the spec declared, and a call with neither raises
 * nothing: absence of both is absence of any possible consent.
 */
export function issueConfirmationForVeto(action history, tool, args = {}) {
  const [subject] = preferredIdentityValues(args);
  if (subject) return issueConfirmationRequest(action history, { tool, subject, meaning: subject });
  const meaning = action history.destructiveLabels[tool];
  if (meaning) issueConfirmationRequest(action history, { tool, meaning });
}
```

The call site (`turn.ts`, the deny branch shown above) passes the arguments it already holds.

- **Order matters.** The record comes first and the label is the fallback: a call naming
  `cust_2001` raises a question about `cust_2001`, not about the tool in general.
- **What stays true.** `confirmationMatchesCall` licenses a call when one of its own argument
  values is the request's subject. A subject derived FROM those arguments matches by construction.
- **Multiple ids** (`transferOwnership({ from: 'usr_1', to: 'usr_2' })`): the subject is the first
  preferred identity value; the code licenses only a call whose own arguments carry that subject.
- **No record, no label** (`purgeAllLogs({})` with no `destructiveLabels` entry): no question can
  be born and the tool never runs — the engine's law is unchanged. Catching the incomplete spec is
  the authoring lint's job (see The skill).

What this route gives up without a simulation: the world validates only AFTER consent. The user can
authorize an act that then fails (`ALREADY_UNSUBSCRIBED`) — safe, just less polished. The agent can
compensate by reading before asking (`getCustomer` → describe the record in the question); that is
authoring guidance, not engine behavior.

The repaired dialogue:

```
agent  unsubscribeCustomer({ customerId: 'cust_2001' })   → DENIED, and the veto IS the question
reply  "Unsubscribing customer cust_2001 is permanent. To confirm, type: CONFIRM CUST_2001"
user   "CONFIRM CUST_2001"
agent  unsubscribeCustomer({ customerId: 'cust_2001' })   → licensed → runs ✓
```

## The simulatable set

Computed once per run, from the injected tool definitions, at the seam where `toolDefs` first
exist (the backend, at run start — where `assertDestructiveConfirmable` runs today): a destructive
tool whose `inputSchema.properties` carries `simulate` is Route A, every other destructive tool is
Route B. The set is seated on the runtime the same way `destructiveLabels` is seated
(`turn.ts`), and threaded into `GuardCtx` as `ctx.simulatableTools`.

`assertDestructiveConfirmable` is DELETED. Its job was to reject a destructive tool whose schema
could not honour the flag protocol; under the one law no schema shape is an error — the schema
decides the route. What remains validated at construction: `destructiveLabels` ⊆
`destructiveTools`, the label token-collision check, `destructiveWhen` ⊆ `destructiveTools`.

**No per-tool argument-name override.** A real API with its own simulation parameter under another
name (`dry_run`, or k8s's `dryRun: 'All'` — not even a boolean) is not detected, so it falls to
Route B: safe, merely not upgraded. The adapter seam for such a tool is the skill's emend-via-proxy
(a proxy can translate `simulate: true` into whatever the real API speaks); an engine-level rename
option could not even express the k8s shape.

## The world side (`defineWorld`)

The tool declaration `twoStep` becomes `simulatable`, and the simulation branch keys on the
explicit request:

```ts
if (tool.simulatable && received.simulate === true) {
  audit.push({ tool: name, outcome: 'simulated' });
  // side-effect-free — gates ALREADY evaluated (simulate ≡ act identity)
  return push(toolCalls, name, args,
    { ok: true, requiresConfirmation: true, simulationResult: simulationResultOf(tool.create, received) }, false);
}
```

The bare call acts: the tool does what its name says. A `simulatable` tool's schema declares
`simulate: { type: 'boolean' }`; a fixture world rejects an undeclared `simulate` argument at
reception (`receive()` validates), while an MCP server may silently ignore it — the guard's
schema-licensed bypass is what makes that difference harmless.

The simulate-validity law keeps its substance: a simulation validates EVERYTHING except consent —
caps, holds, permissions, existence, lifecycle — and returns `requiresConfirmation` only if the
act executed right now would succeed; otherwise it returns the SAME error the act would.

## `destructiveThrottle` simplification

The `confirmArg` and `flagless` options are deleted. What declares a simulation:

- an EXECUTED call: the world recorded no effect (`tookEffect === false`) AND its result carried
  `requiresConfirmation` or its args carried `simulate: true`;
- a same-step SIBLING (not yet run): its args carry `simulate: true` — the only evidence a call
  that has not run can offer.

A bare sibling counts as an effect. This closes the residual the current guard documents: N bare
mutations of a flag-gated tool in ONE step were uncountable (indistinguishable from a
multi-simulation when the simulation shape was flag-ABSENCE); with the simulation shape being an explicit
`simulate: true`, the cap holds from the first sibling. The legal multi-simulation (two
`simulate: true` siblings in one step) still passes: simulations are not effects.

## What the model knows — and what it does not need to know

```
1 · assembled prompt      confirmFirst's prose (above): simulate first where offered; the acting
                         call only on the typed code
2 · the tool schema      simulate: { type: 'boolean', description: 'true = validate and describe
                         without acting' }
3 · enforcement          the model that ignores both is repaired: bare-without-consent downgrades
                         (Route A) or becomes the question (Route B)
```

Channels 1–2 are optimization (fewer downgrades); channel 3 is the guarantee. The model cannot get
the protocol wrong in a way the user ever sees.

## The skill

The skill currently teaches the flag polarity and the mechanism split; every passage rewrites:

| surface | today | becomes |
|---|---|---|
| `gen.md` G-law (49–51) | "give every destructive tool a `confirmed` boolean; a one-step tool MUST be declared `'prior-ask'`" | "a destructive tool needs NOTHING — the attempt becomes the question. Where the API can simulate, give it a `simulate` boolean: the user then confirms knowing what the act does, and never authorizes what would fail" |
| `gen.md` simulate-validity law (249) | keyed on `confirmed:false` | the simulate-validity law, keyed on `simulate: true` |
| `gen.md` check 6, simulate×confirm parity (293) | simulate returns the same error the confirmed call would | simulate×act parity, same substance |
| `gen.md` emend-via-proxy | "add `confirmed`/two-step" | "add `simulate`" — a proxy-added simulation is describe-only (it cannot validate what the real API hides); it may also translate `simulate: true` to a real API's own dry-run shape |
| `guard-catalog.md` (51–53, 342) | the `confirmMechanism` partition, `flag: false`, `base:confirmFirstPriorAsk` | one entry, one law: a destructive call that is not a schema-licensed simulation requires the code |
| `evals.md` coverage (211) | "a dedicated two-step confirm case" per destructive tool | one case per ROUTE the subject's tools expose: Route A (downgrade) and Route B (veto-question); the exam's forbidden entry keys on the acting shape (`simulate` not `true`) pre-consent, never on a flag value |
| `lint-authoring.mjs` | validates `confirmed` in the schema | validates the new shape; NEW rule: a destructive tool with no identity argument and no `destructiveLabels` entry is an authoring error (it can never run) |
| `spec-template.ts` · `references/*` | `confirmMechanism` examples | deleted |

The framing the skill states plainly: **Route B is the common case** — real tool surfaces rarely
simulate — **and `simulate` is the upgrade** an author adds where the API can honour it.

## Deletions

| deleted | replaced by |
|---|---|
| `confirmMechanism` config + its stray-key validation | nothing — the declared schema decides the route |
| `'prior-ask'` · `base:confirmFirstPriorAsk` | the one `confirmFirst` binding |
| `confirmFirst({ flag })` | no flag option; `simulate` is the one word |
| `destructiveThrottle({ confirmArg, flagless })` | simulate-keyed detection |
| `assertDestructiveConfirmable` | the run-start simulatable-set computation |
| stale `pendingConfirmMustAsk` comment references (`guards/index.ts`, `testing/fixture-world.ts`) | comments rewritten to the new truth |

## How to measure

Deterministic, no campaign:

- **Route B unit shape:** a spec with a non-simulatable destructive tool; a call naming its record;
  assert the `confirmationRequest` is issued with the record as subject and the second identical
  call is licensed. A no-record no-label tool: assert nothing is issued and nothing ever runs.
- **Route A engine proof:** a bare pre-consent call on a simulatable tool; assert the downgraded
  `simulate: true` call executed (audit `outcome: 'simulated'`, no effect), the
  `confirmationRequest` carries the record as its subject, the delivered reply carries the code,
  and the next turn's typed code licenses the bare call. This proof — not a case score — is what
  validates the downgrade: the case-level invariant cannot see the repair BY DESIGN, because the
  bare attempt stays in `attemptedCalls` and E1 scores attempts. The guard corrects the
  conversation, not the mistake.
- **What the exam's forbidden entry becomes:** `anyArgs: { confirmed: true }` no longer exists.
  Under the inverted polarity the forbidden shape pre-consent is the ACTING call — the listed tool
  with `simulate` not `true` — scored over executed ∪ attempted (E1) exactly as today. A model
  that simulates first passes; a model that reaches for the act fails, downgrade or no downgrade.
- **The `-preapproved` re-measurement:** the fifteen cases (46.7% pass today) re-run governed-only
  with the rewritten forbidden entry. The downgrade cannot move this figure — attempts still fail
  cases — so what it measures is D3's removal: with no field whose value the user's prose makes
  true, does the model stop reaching for the act? A re-measurement of model compliance under the
  new polarity, not the design's acceptance gate.
- **Acceptance search:** the identifier `confirmed` — as an argument key, a config key, or a flag
  constant (`confirmed:`, `confirmArg`, `CONFIRM_FLAG`, `'confirmed'`) — returns zero hits on live
  surfaces across the repos. The English word in prose is not an identifier and stays where it is
  true.
- **Governance:** the rewritten `confirmFirst` and `destructiveThrottle` need fresh proof records
  and a re-derived `governance/MATRIX.md`; `check-record-required` gates the merge.

## Order of work

After the plain-names rename lands (in progress, separate session):

```
1  engine     guards, runtime verdict + simulatable seam, defineWorld, tests, GUARDS.md, tutorial
2  skill      gen.md laws, guard-catalog, evals.md, template, lint-authoring
3  subjects   generated worlds and specs; both benches; re-measure the -preapproved slice
```
