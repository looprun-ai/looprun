# Tool-owned guards — design spec

A guard that governs a tool belongs to the tool, is declared once for the domain, and reaches the
model in the tool's own description. This spec covers the engine change, the subject change, the
documentation and skill review that follow from it, and the measurement that closes it.

```
FROM                                          TO
guard bound per agent, 6 lanes                guard bound per tool, declared once
prose in `## Tool rules` (system prompt)      prose in the tool's `description`
the fact repeated in `## Behavior`            the fact has exactly one home
`changeAllowed` a special contract field      an ordinary binding over a named tool set
```

---

## 1 · What is settled, and on what evidence

| question | answer | evidence |
|---|---|---|
| does the `tools` block sit inside the cached prefix? | **yes** | measured, §2 |
| does the fusion cost cache or prefill? | **no — prefill falls** | measured, §2 |
| can guard prose vary per turn and break the cache? | **no, structurally** | `prose(): string` is nullary — no `ctx`, no world, no turn index |
| is a new guard priority needed? | **no** | §3 |
| may a named tool set be a `ToolTarget` string? | **no — it must expand at install time** | §3 |

## 2 · The measurement that authorised the fusion

Five cases of one lane, run twice. The second run carried 365 characters of extra rule text appended
to each of the 54 tool descriptions.

```
                    in        cache-read    % of in     UNCACHED (prefill)
base            141 177          20 031      14.2%            121 146
padded          160 297          76 339      47.6%             83 958
                ───────         ───────                       ───────
Δ               +19 120         +56 308                       −37 188
```

Had the `tools` block been outside the cached prefix, the added tokens would be re-sent uncached on
every turn and `cache-read` would have stayed at ~20 000 while `in` rose. It rose by nearly three
times the added input: the padding both cached itself and pushed the whole prefix past the provider's
implicit-cache size floor, so previously-uncached text started hitting cache too.

The probe ADDED text; the fusion MOVES it, so it is roughly byte-neutral. What the probe establishes
is only the fact that was open: the tools block is cached.

**The instrument.** `EvalCaseDump` carries `tokensCacheRead: number | null` — summed from
`TurnRecord.tokens.cacheRead`, and `null` when the provider reports no cached count, because a printed
zero reads as a cold cache and that is a different fact from an unreported one. The run summary prints
`cache-read <n> (<pct>% of in, over <k> case(s))` or `cache-read UNREPORTED by the provider`.

## 3 · Engine changes

### 3.1 · `requiresBefore` accepts author prose

`packages/core/src/guards/flow.ts`. The kind decides read order correctly; its generated prose carries
no domain fact, and a fact with nowhere to live ends up duplicated in `## Behavior`.

```diff
-export function requiresBefore(deps: string[], opts?: { within?: number }): Guard {
+export function requiresBefore(deps: string[], opts?: { within?: number; prose?: string }): Guard {
-    prose: () => `only after ${deps.join(' → ')} has run`,
+    prose: () => opts?.prose ?? `only after ${deps.join(' → ')} has run`,
```

`check` is untouched. A call that passes no `prose` renders the derived sentence, so no existing
subject moves a byte.

The override already exists on four kinds and arrives two different ways:

```
positional   forbidThisTurn(reason, prose?)        precondition(ok, reason, prose?)
in opts      maxCalls(…, { scope, prose })         requiresBefore(…, { within, prose })   ← new
```

Both forms are normalised to `opts.prose` in the same change. `flow.ts` breaks either way, the
package is pre-1.0, and a single convention is what makes "pass `prose` to override the derived
default" a rule an author can follow without checking each signature.

### 3.2 · The contract declares tool guards with the spec's own verb

One verb, one shape, two scopes. `DomainContract` gains a binding list whose entries are the exact
quadruple `addGuard` takes.

```ts
/** The only sets a binding may name. `writeTools` is a contract field; `destructiveTools` is
 *  declared per lane (`AgentSpecConfig.destructiveTools`) and resolves against the INSTALLING
 *  lane, which is what makes a contract-level "every destructive tool" binding mean the right
 *  thing on each desk. */
export type DeclaredToolSet = 'writeTools' | 'destructiveTools';

export interface ContractGuardBinding {
  hook: Hook;
  /** Literal tool names, or the name of a declared set. A named set is expanded before it
   *  becomes a ToolTarget — see §3.3. */
  target: string[] | DeclaredToolSet;
  guard: Guard;
  id: string;
  priority?: Priority;
  /** Only with a named set: names withdrawn from it for this binding. */
  exempt?: string[];
}
```

A lane installs a contract binding when — and only when — its own `tools` surface intersects the
resolved target. A lane without `retireAsset` receives nothing.

`writeTools` and `destructiveTools` resolve from different places, and the difference is load-bearing:

```
'writeTools'        contract.writeTools ∩ lane.tools − exempt      one list, domain-wide
'destructiveTools'  lane.destructiveTools            − exempt      already lane-scoped
```

`DomainContract` declares no `destructiveTools` field and gains none. A desk decides which of its own
tools are destructive — `placeHold` is destructive at workspace scope and not at booking scope — so a
domain-wide list would be a claim no desk could honour.

### 3.3 · A named set expands at install time — it never becomes a `ToolTarget`

`ToolTarget` stays `'any' | string[]`. This is not stylistic. `resolveBindings` is:

```ts
.filter((b) => !b.disabled && (tool === undefined || b.target === 'any' || b.target.includes(tool)))
```

`b.target.includes(tool)` is `Array.prototype.includes` only while `target` is an array. Admit a third
string variant and the same expression silently becomes `String.prototype.includes` — a SUBSTRING
match. `'destructiveTools'.includes('Tools')` is `true`, and a guard would attach to a tool nobody
bound it to.

So the constructor resolves the set to a literal array before installing:

```
target: 'writeTools', exempt: ['getQuote']
  → contract.writeTools ∩ this.tools  −  exempt
  → ['cancelBooking', 'chargeDeposit', 'issueRefund']      ← a plain string[]
```

An empty intersection installs nothing.

### 3.4 · `changeAllowed` becomes an ordinary binding

The field is not a distinct concept — `spec.ts` already turns it into a `precondition` bound to
`writeTools`. It existed as its own field because the contract had no way to say "bind this guard to
that set". With §3.2 it does.

```ts
{ hook: 'preTool', target: 'writeTools', exempt: ['getQuote'],
  guard: precondition(ok, reason, prose),
  id: 'changeAllowed:precondition', priority: 'changeAllowed' }
```

The `exempt ⊆ writeTools` validation moves onto the binding, where every named-set binding gets it
rather than one field alone.

**A migration detail that moves bytes.** Today the install skips the lane intersection —
`writeTools.filter(t => !exempt.includes(t))` — and §3.2's rule intersects. The CHECK is unchanged,
because it matches on the tool actually called, but the installed `target` array shrinks to the
lane's own surface. Any stability test that reads installed bindings will move, and must be updated
to the new arrays rather than relaxed.

### 3.5 · Priority: nothing new, nothing moves

**No priority tier is added.** A contract-declared guard is authored governance of the same nature as a
lane's; what differs is who wrote it, not when it runs. Adding a tier would reorder execution for a
reason unrelated to this change.

```
priority       who installs it              order
agent      0   a lane, AND the contract     runs first
changeAllowed 1  the contract's write gate
consent    2   the engine
honesty    3   the engine
always     4   the engine                   runs last
```

Within the `agent` tier, order is insertion order, and `super()` runs before a lane's constructor
body — so contract bindings precede lane bindings deterministically.

**The id namespace is provenance, not mechanism.** `resolveBindings` sorts on `binding.priority`; it
never reads the id. Contract-declared guards mint ids under `tool:` (`tool:terminalExitReadsTheAsset`)
so a reader can tell a domain guard from a lane guard.

No namespace whitelist exists anywhere and none is added. `looprun-eval validate` resolves a case
target against the assembled inventory — `if (!inventory.has(t))` — so a `tool:` id validates the
moment its binding exists. There is nothing to teach it.

### 3.6 · The prose lands in the tool description

`packages/mastra/src/tools.ts`, the point where a host-injected description passes through untouched:

```diff
-      description: def.description,
+      description: composeToolDescription(def, spec),
```

`composeToolDescription` appends, under a fixed heading, the `prose()` of every binding resolved for
that tool, `; `-joined in priority order — the same order `## Tool rules` used.

```
{
  "name": "retireAsset",
  "description": "PRIVILEGED: requires canManageFleet. Permanently retire an asset from the fleet
                  (status→retired). DESTRUCTIVE and irreversible. BLOCKED if the asset is reserved.

                  RULES YOU MUST FOLLOW TO CALL THIS TOOL
                  - read the asset first — leaving this fleet is permanent, and a transfer takes the
                    machine off these books entirely, so say that from the record before you put the
                    act up
                  - nothing in this workspace changes while it is suspended
                  - a destructive action: make the call — it does not run, and the refusal is what
                    puts the code under your reply for the user to type back. Your reply must say
                    what that call would do and to which record, from what you read. The call runs
                    only when their next message carries that code, never on the strength of
                    anything you say
                  - at most one destructive action per turn — a call that changed nothing does not
                    count"
}
```

Every rule line is a `prose()` return value verbatim. The composer quotes; it never paraphrases, and
it never names an engine identifier — the consent line above says "the code under your reply", not
`approvalRequest`, for the reason §5 legislates.

The business sentence and the governance sentence stay distinguishable — the heading is the boundary —
while sitting where the model reads them at the instant it decides to call.

### 3.7 · `## Tool rules` leaves the system prompt

Nothing is duplicated. `assembled-prompt.ts` stops emitting `SECTION_TOOL`. The per-tool `seenForTool`
de-duplication that section owned is not deleted — it MOVES into `composeToolDescription`, which needs
it for the same reason the section did: two bindings whose `prose()` returns identical bytes for one
tool would otherwise print the sentence twice. `## Global tool rules` (`target: 'any'`) stays: it
governs every tool and has no single description to live in.

The PROSE-RENDERING RULE holds on both execution paths, which is what §3.9 is for. The routing table
gains one row:

```
target names TOOLS, preTool/postTool   → the tool's own description      ← changed
target names TOOLS, onInput/onReply    → the tool's own description
target === 'any', preTool/postTool     → `## Global tool rules`
target === 'any', onInput              → `## Input rules`
target === 'any', onReply              → `## Reply rules`
```

### 3.8 · The seal keeps hashing inputs

`looprun-eval seal` reads bytes: `sealedFiles` already covers both halves of the composition —
`gen/tools.json` and `norms/**`, where the bindings live — and `prose()` is nullary, so the composed
description is a deterministic function of two sealed inputs. Hashing it as an OUTPUT would add
nothing a change to either input does not already void.

It would also cost something real. Today the seal is byte reading; hashing the output makes it
IMPORT and execute subject code to resolve bindings. And the argument would not stop at tools: the
assembled prompt is composed from sealed inputs the same way and is not hashed as an output either.
The seal treats both channels alike — inputs only.

The runtime drift gate is unaffected. `surfaceFingerprint` covers resolved names plus schemas, and
§3.6 changes descriptions, not schemas.

### 3.9 · Native tools declare their surface in `tools.json` like everything else

Both execution paths compose the same way. There is no second rule for MCP.

Today they diverge, and §3.6 alone would make the divergence a hole. A native host hands over ready
tools and the engine admits them whole:

```ts
// packages/mastra/src/agent-construction.ts:103
for (const t of nativeActiveNames) admitted[t] = config.tools![t];   // pure passthrough
```

With `## Tool rules` gone, a host that registers `cancelBooking` natively gets `confirmFirst` VETOING
the call while its prose reaches the model nowhere — the invisible rule the PROSE-RENDERING RULE
exists to forbid, correctable only by redrive.

**The surface is read from the MCP server ONCE and written to `gen/tools.json`.** From then on the
declared surface is a file, identical in kind on both paths, and the engine composes from it. What
stays native is EXECUTION.

```
                        declares the surface        executes the call
world seam              gen/tools.json              world.exec(name, args)
native / MCP            gen/tools.json              the host's own tool
```

Three consequences, each a real change:

```
agent-construction:56   `tools && toolDefs` THROWS today. Native + toolDefs becomes the
                        normal case: the error narrows to `tools && world`.

agent-construction:103  the passthrough becomes a wrap — the host's `execute` is kept,
                        `description` is replaced by composeToolDescription(def, spec).

agent-construction:115  `schemaOf` reads `toolDefs` on both paths, so surfaceFingerprint
                        stops branching on the mode.
```

The read is a pipeline step, not a runtime one: a surface fetched per run is a surface nobody sealed.
It belongs beside G1 intake, where a given `tools.json` is already the input, and the resulting file
is sha-pinned like any other. A host tool whose live schema has drifted from the pinned file is
exactly what the drift gate is for.

The skill law of §6.2 holds unchanged here: the descriptions are the business's own words. The
pipeline transcribes what MCP reports and writes no governance into the file — the governance arrives
at compose time, from the bindings.

## 4 · Subject changes — `subjects/atlas`

```
norms/contract.ts    the 17 tool-bound bindings move here, in addGuard shape
norms/*/spec.ts      each lane keeps only what is genuinely its own
norms/fleet/spec.ts  the terminal-exit behavior line is deleted — the guard owns the fact now
```

The 17 bindings, by kind:

```
lane        requiresBefore  valueFromUser  precondition  custom   total
claims            2               —             1          —        3
billing           2               —             1          —        3
fieldops          1               —             —          —        1
workspace         2               1             —          —        3
rentals           2               1             —          1        4
fleet             1               2             —          —        3
                 ──              ──            ──         ──       ──
                 10               4             2          1       17
```

A binding moves to the contract when the rule is a property of the TOOL. A binding stays on the lane
when it is a property of that lane's job. `rentals`' `custom()` on `checkAvailability` is examined case
by case rather than moved by default.

Every case target naming a moved guard's identifier is updated to its new `tool:` id, and
`looprun-eval validate` must come back clean — a target naming an identifier that no longer exists is
the failure mode that produced 125 blocking issues on the previous engine bump.

## 5 · Prose that names a mechanism the surface lacks teaches that mechanism

Four strings that reach the model named `simulate`. All four are the engine's, and the load-bearing
one delegated the disclosure duty to a mechanism the surface may not have:

| # | site | why the word is load-bearing |
|---|---|---|
| 1 | `guards/consent.ts` — `confirmFirst.prose()` | the describer is the simulation's answer; no simulation, no describer |
| 2 | `guards/consent.ts` — `confirmFirst.check()` deny string | past tense for a code block that renders WITH this same reply |
| 3 | `guards/consent.ts` — `destructiveThrottle.prose()` | names a call kind this surface may not have |
| 4 | `assembled-prompt.ts` — `SCOPE_PRECEDENCE` | the ordinary sense of "sketching", but the same word in the same prompt |

The four strings verbatim. `-` is `v0.16.0` as published on npm; `+` is `packages/core/src` at
`0a45d6b`. Line breaks and `+` concatenation are the source's own.

```diff
  // 1 · guards/consent.ts — confirmFirst.prose()
     prose: () =>
-      'a destructive action: simulate it first where the tool offers `simulate: true` — the answer ' +
-      'describes the act and gives the user their confirmation code — and run the acting call only ' +
-      'after their next message carries that code; never on the strength of anything you say',
+      'a destructive action: make the call — it does not run, and the refusal is what puts the code ' +
+      'under your reply for the user to type back. Your reply must say what that call would do and to ' +
+      'which record, from what you read. The call runs only when their next message carries that ' +
+      'code, never on the strength of anything you say',
```

```diff
  // 2 · guards/consent.ts — confirmFirst.check() deny branch
       return licensed
         ? null
-        : 'The user has not confirmed this action. Do not run it — reply to them, and run it only ' +
-            'after their next message carries the confirmation code they were shown.';
+        : 'The user has not confirmed this action, and it did not run. Reply to them now, and say in ' +
+            'that reply what the call would do and to which record. A code is shown under your reply; ' +
+            'the call runs only when their next message carries that code.';
```

The clause `has not confirmed this action` is preserved: three core tests match it by regex, and
rewriting an assertion alongside the code it asserts is how a test stops proving anything.

```diff
  // 3 · guards/consent.ts — destructiveThrottle.prose()
-    prose: () => 'at most one destructive action per turn (a simulation that changed nothing does not count)',
+    prose: () => 'at most one destructive action per turn — a call that changed nothing does not count',
```

```diff
  // 4 · assembled-prompt.ts — SCOPE_PRECEDENCE
-    'When a request is out of scope, the ONLY correct move is to say which team handles it (name that team, never your own role or identity) and stop. Collecting ids or dates for it, checking permissions for it, pricing or simulating it, or offering to do it yourself — even behind a confirmation — IS doing the other team\'s job and is a failure.',
+    'When a request is out of scope, the ONLY correct move is to say which team handles it (name that team, never your own role or identity) and stop. Collecting ids or dates for it, checking permissions for it, pricing or drafting it, or offering to do it yourself — even behind a confirmation — IS doing the other team\'s job and is a failure.',
```

`packages/core/test/prompt-stability.test.ts` pins string 1 and moves with it.

No atlas tool declares `simulate`, so the conditional in string 1 never closes. The weak model
promoted the subordinate clause to a rule and answered with a mechanism that does not exist:

```
01-cancel-booking-confirm · turn 1 · gemini-3.1-flash-lite
  "I could not cancel booking bk_1001. The system requires a simulation to be run first for this
   action, and I have not yet performed that step."
```

The replacement moves the duty onto the agent and describes the runtime instead of a parameter,
naming the code by WHERE it appears so any `engineText.approval` wording survives it, in any
language.

Measured on the same 100 cases, the same lane, the same judge ruler:

```
                                          r1      r2
turn-1 replies inventing a simulation     28  →    0
judged "never stated the consequence"     37  →   28
governed invariants (guard-rail)          95  →   94      one case, N=1 noise
governed BAND                             52  →   57
ungoverned BAND                           42  →   42      never vetoed, nothing to gain
```

Of the +5 BAND, +2 is attributable to this prose, +2 to the read-order guards that landed in the
same run, +1 to cases that never confabulated. 14 of the 28 stopped inventing and still fail — they
read the record and do not use what they read, which is the defect underneath.

**A prohibition or a conditional that names a mechanism the surface does not have is an instruction
manual for that mechanism.** The subject carried the same defect in three `behavior[]` lines
(`claims`, `rentals`, `workspace`) that listed the word among things the lane must NOT do; the
polarity of the sentence does not matter.

```diff
- …name the team that owns the rest without pricing, simulating or looking anything up
+ …name the team that owns the rest without pricing, drafting or looking anything up
```

The consequence for this spec is direct. The 17 rules move into the tool descriptions — the channel
the model reads at the instant it chooses arguments. A stray mechanism word there has more pull than
the same word in `## Behavior`, so every migrated line is checked against the tool's own schema: it
may name only arguments and operations that schema declares.

### 5.1 · What is committed and what is not

The engine source carries all four strings. What the bench MEASURES with does not come from the pin.

| repo · artifact | state |
|---|---|
| `looprun` · `packages/core/src/{guards/consent.ts, assembled-prompt.ts}` | committed — `0a45d6b` |
| `looprun` · `packages/core/test/prompt-stability.test.ts` | committed — `0a45d6b`, asserts string 1 |
| `looprun` · `packages/eval/src/{run.ts, commands.ts}` cache-read column (§2) | committed — `cf303d6` |
| `agentspec-bench` · `subjects/atlas/norms/{claims,rentals,workspace}/spec.ts` | committed — `16ace49` |
| `agentspec-bench` · `node_modules/.pnpm/@looprun-ai+core@0.16.0/…/dist/**` | hand-copied build — **not distributable** |
| `agentspec-bench` · `package.json` | `"@looprun-ai/core": "0.16.0"` — the npm tarball still ships the OLD text |

A `pnpm install` in the bench restores the published `0.16.0` and the r2 numbers stop reproducing.
Releasing `0.17.0` and moving the pin is the step that closes it; until then the measurement is an
experiment, not an installation. The re-apply, verbatim:

```
pnpm -C ~/Dev/js/looprun/looprun/packages/core build

DEST=~/Dev/js/looprun/agentspec-bench/node_modules/.pnpm/\
@looprun-ai+core@0.16.0/node_modules/@looprun-ai/core/dist
SRC=~/Dev/js/looprun/looprun/packages/core/dist

cp $SRC/guards/consent.js   $DEST/guards/consent.js
cp $SRC/assembled-prompt.js $DEST/assembled-prompt.js
```

The check that the patch is live — it must print the NEW text, not `simulate it first`:

```
grep -c 'make the call' $DEST/guards/consent.js      # 1
grep -c 'pricing or drafting' $DEST/assembled-prompt.js   # 1
```

One clause that was added and then withdrawn — *"Asking in your own words instead issues no code, and
the act can then never be confirmed."* — targeted the ~20% of consent cases where the agent asks in
prose without calling. It moved that count 4 → 4 across r2 and r3 and carries no evidence.

## 6 · Documentation and skill review

Every artifact below is reviewed against the change and rewritten to state what the system IS. Neither
a doc nor a comment narrates the change or cites the evidence behind a rule.

### 6.1 · Engine docs

| artifact | what changes |
|---|---|
| `README.md` | the guard example, if it shows a per-agent binding of a tool rule |
| `docs/tutorial/*` | the lesson that introduces guards; the lesson that shows the assembled prompt (a `## Tool rules` section that no longer renders) |
| `GUARDS.md` §2 | the PROSE-RENDERING routing table (§3.7); the prose≠reason law is unchanged and must not be restated |
| `docs/reference` on `DomainContract` | `changeAllowed` is gone as a field; the binding list and named sets are documented |
| `packages/core/src/spec.ts` header | the id-namespace paragraph gains `tool:`; the priority table is unchanged and must stay unchanged in the prose |
| `packages/core/src/spec.ts` — `GuardBinding.target` JSDoc | it currently routes the reader to `## Tool rules` ("prints its prose under `## Tool rules`") and states the onInput/onReply caveat in those terms. Both halves are rewritten to §3.7's table |
| `packages/mastra/src/agent-construction.ts` header | the native/world split is about EXECUTION only; both paths declare their surface in `tools.json` (§3.9) |
| `packages/core/src/assembled-prompt.ts` header | the section list drops `Tool rules`; the shared-prefix law paragraph now states where tool prose lives |
| `GUARDS.md` — a new law on prose | engine prose names no mechanism a surface may lack. A guard's `prose()` is nullary and cannot see the schema, so a clause conditional on a parameter renders on surfaces that have none (§5) |

### 6.2 · The agentspec skill

| artifact | what changes |
|---|---|
| `references/norms.md` | N4 authoring: a tool rule is declared on the contract; a lane rule on the lane. The decision test is stated. |
| `references/guard-catalog.md` | `requiresBefore` gains the `prose` option with the rule for when to pass it |
| `references/gen.md` | tool descriptions are the business's own words — the skill never writes governance into `tools.json` |
| `references/test.md` | the run summary's cache-read column and how to read UNREPORTED |
| `scripts/lint-authoring.mjs` | two findings: a tool-scoped rule written as prose in `behavior[]` when a guard could own it; and any prose naming a mechanism absent from the tool surface — a prohibition counts, because forbidding a mechanism names it (§5) |
| `references/norms.md` (authoring law) | prose names only what the schema declares. "Do not simulate it" on a surface with no simulation teaches simulation |
| `scripts/lint-world.mjs` | unchanged — verify, do not assume |
| the N4 admission rule | `CUSTOM-WITHOUT-ADMISSION` still applies; `requiresBefore` with author prose is NOT a custom guard and needs no admission line |

### 6.3 · The check the review must pass

No file states a rule twice. A rule lives in exactly one of: the tool description (via its guard), a
`target:'any'` section, or `## Behavior` — and `## Behavior` holds only what no deterministic kind can
decide.

## 7 · Gates

```
engine        pnpm test green across packages
subject       world.test · bundle.test · premise.test green
              lint-authoring · lint-world clean
              looprun-eval validate clean
prompt        no rule text appears in two places (§6.3)
cache         a 5-case probe reports cache-read ≥ the pre-change baseline
```

## 8 · Final step — remediation measured on the failure set only

Not a full 100-case run. The set is the cases that took nothing from the previous fix: between the two
governed runs `test/2026-08-07-r1-a` and `test/2026-08-07-r2-a`, among the 28 that confabulated a
mechanism in r1 —

```
14   FAIL → FAIL     the confabulation went away, the case failed the same
 3   pass → FAIL     regressed
──
17   the remediation set
```

The 14 share one cause, and it is the cause this spec addresses: the model stopped inventing a
mechanism and went on **not using the record it had read**. Case 02 held
`assetName: "CAT 320 Excavator"` in the `getBooking` result on both runs and named the asset on
neither.

```
r1  "The system requires a simulation to be run first…"        does not name the asset
r2  "…this action will free the asset and void the job"        still does not name the asset
```

Two stacked defects; the previous fix reached the top one. The guard that now carries "say that from
the record before you put the act up", in the description the model reads as it decides to call, is
aimed at the second.

**The set, computed.** A case PASSES when its invariants are clean and its judge `overall` is `pass`
(`verdicts.jsonl` is `{caseId, rep, verdicts[], overall}`). A case CONFABULATED in r1 when any r1 reply
contains `simulat`.

```
r1-a pass 52 · r2-a pass 57                      +5, the band move the previous fix bought
confabulated in r1                31
  16  FAIL → FAIL                                the confabulation went, the case failed the same
   3  pass → FAIL                                regressed
   6  FAIL → pass                                improved
   6  pass → pass                                already passing
  ──
  19  THE REMEDIATION SET
```

```
03-cancel-dispatch-confirm          25-change-plan-confirm
04-cancel-dispatch-preapproved      29-promote-owner-confirm
07-release-deposit-confirm          30-promote-owner-preapproved
11-issue-refund-confirm             35-two-money-moves-one-yes
12-issue-refund-preapproved         36-amended-deposit-amount
15-resolve-claim-confirm            39-deposit-float-cap
16-resolve-claim-preapproved        75-refund-cap-after-partial-refund
20-retire-asset-preapproved         84-retire-a-reserved-asset
21-transfer-asset-confirm           88-frozen-account-blocks-a-refund
                                    95-two-cancellations-one-turn
```

19, not 17. The pass/fail computation reproduces the +5 band move exactly, so the transition counts are
sound; the difference is the confabulation classifier. `simulat` over the r1 replies admits 31 cases
where the earlier count admitted 28, and all three extra land in FAIL → FAIL. The rule above is stated
so anyone can recompute it; running 19 costs two cases and risks nothing.

**Procedure.**

```
1  run the 19 governed, post-change, into test/<date>-r4-remediation
2  judge them with the same judge and prompt as r1/r2 — a different judge measures a
   different thing
3  report per case: r2 verdict → r4 verdict, and the cause for every one still failing
```

**What the step can and cannot say.** 19 cases at N=1 is a diagnostic, not a band. It answers whether
the named cause moved. It does not produce a rate, a premium or a certificate, and no seal is minted
from it.

The comparability of r1/r2/r3 against anything measured after this change is gone — the system prompt
loses a section and the tool descriptions gain text. That was accepted deliberately.
