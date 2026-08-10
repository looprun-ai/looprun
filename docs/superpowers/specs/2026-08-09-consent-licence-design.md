# Consent — the question is about the call, and the agent can say so

> **CLOSED.** Shipped on `main`. The build is recorded in
> `2026-08-10-consent-licence-implementation.md`. The vectors this design does not close are pinned
> as `it.fails` red-team cases under `packages/core/test/redteam/`; the atlas findings ride the atlas
> regeneration, tracked in `BACKLOG.md`.

Three defects stop a destructive act from ever reaching the user's agreement. Each was measured on
real traces, each has a verified root cause in the engine, and all three are fixed in the source.
This spec carries the design and its decisions; the build itself — the diffs verbatim, the full
measurement ladder, every doc and the skill — is recorded in
[2026-08-10-consent-licence-implementation.md](2026-08-10-consent-licence-implementation.md).

```
FROM                                             TO
the licence is guessed from an argument's NAME   the licence IS the call, with its arguments
the exhaustion route drops a standing question   every route prints a question still standing
one word covers "I asked" and "I am asking"      two words, and the first one is provable
```

**Breaking changes are expected and welcome.** Two repositories move together, `looprun` (engine) and
`agentspec` (skill), plus the benchmark subject in `agentspec-bench`. Nothing is kept for
compatibility.

---

## 1 · How consent works, for a reader with no history

A tool on a lane's `destructiveTools` is vetoed by the `confirmFirst` guard on every call. **The veto
is what issues the question.** The engine mints an approval, prints a literal, and the user types it
back; `consumeApprovals` matches the literal against open approvals once per turn, in the runtime,
before the model runs. No guard reads text.

```
user    "Retire ast_ltwr01."
agent   retireAsset({ assetId: 'ast_ltwr01' })
engine  confirmFirst VETOES, and the veto mints the approval from the CALL
screen  To confirm retiring an asset, reply: CONFIRM RETIREASSET-7C3F
user    "CONFIRM RETIREASSET-7C3F"
engine  matched → that call of that tool is licensed
```

No attempt ⇒ no approval ⇒ no literal ⇒ the act cannot be agreed to at all.

---

## 2 · The three defects, measured

All numbers below are from four governed runs of the atlas subject on `gemini-3.1-flash-lite`
(`test/2026-08-07-r1-a`, `-r2-a`, `-r3-a`, `test/2026-08-08-r4-remediation`).

### Defect A — the licence is guessed from an argument's NAME

`issueApprovalForVeto` asked `preferredIdentityValues(args)` which argument names the record, and
that helper accepts any key that is `id`, `label`, or ends in `Id`/`_id`, walking `Object.entries` in
INSERTION order.

```
transferAsset({ assetId: 'ast_ltwr01', targetWorkspaceId: 'ws_denver02' })
                      both are depth-1 identity keys · neither is `id`
                      the winner is whichever key the model serialized first
```

Measured on case `21-transfer-asset-confirm`, same case, four runs:

```
run   the model wrote                       the engine asked
r1    { assetId, targetWorkspaceId }        CONFIRM AST_LTWR01
r2    { assetId, targetWorkspaceId }        CONFIRM AST_LTWR01
r3    { targetWorkspaceId, assetId }        CONFIRM WS_DENVER02
r4    { targetWorkspaceId, assetId }        CONFIRM WS_DENVER02
```

Two consequences. The scripted user types the literal the case author predicted, which matches
nothing, and the act never runs. And worse than the test: `approvalMatchesCall` licensed any call one
of whose argument values equalled the subject — so a literal typed about `ws_denver02` licensed
**transferring any other machine to that destination**.

Two atlas tools carry the tie today: `transferAsset` (`assetId` + `targetWorkspaceId`) and
`placeHold` (`assetId` + `customerId`). A third class is worse and silent: an argument named `asset`
rather than `assetId` produces NO identity hit at all, no approval, and the act is unreachable
forever with nothing reported.

### Defect B — the exhaustion route drops a standing question

The engine has two routes that mean "this turn exhausted", and they disagreed.

```
withBlankFloor   checks openApprovals(...).length   → preserved the question
turn.ts (the exhaustion return)  closureText(report, sentence)  → dropped it
```

```
measured: of 174 turns where confirmFirst vetoed a call, 5 delivered no question.
          all five ended in exhaustion-terminal.
```

The approval is not lost — `openApprovals` is conversation-scoped and reprints on the next delivery —
so this costs the user one blind screen, not the act.

### Defect C — the outcome word for "I asked" was unprovable

The engine's structured terminal carries `did: Intention[]`, and `claimIsGrounded` proves each
declaration against the action history. The word for a raised question was `pending_confirmation`,
and its only proof was:

```ts
case 'pending_confirmation':
  return calls.some((c) => c.resultFlags?.requiresConfirmation === true && addressed(c));
```

`calls` is `domainCallsThisTurn(ctx)` — calls that EXECUTED. There are two routes that raise a
consent question and the rule knew only one:

```
tool declares `simulate`   the runtime downgrades the bare call and the WORLD runs it,
                           returning requiresConfirmation          → proof exists
tool declares none         confirmFirst VETOES before execution,
                           and the world never sees the call       → proof cannot exist
```

No atlas tool declares `simulate`, so the word was unprovable on the whole surface. Captured live
with an observing `onReply` guard, case `21-transfer-asset-confirm`:

```
turn 1  called getMember, getAsset · attempted nothing
  try 1  {op:'transferAsset', target:'ast_ltwr01', outcome:'pending_confirmation'}  REJECTED
  try 2  []                                                                          REJECTED
  try 3  {op:'transferAsset', target:'ast_ltwr01', outcome:'pending_confirmation'}  REJECTED
         → redrive budget spent → exhaustion-terminal → no question, no act
```

The deny even names the words that would work (`Declarable … : blocked, refused, no_op`), and the
model kept the one that describes what it was actually doing. The redrive cannot help: it
re-generates with `activeTools: ['respond']`, so the destructive tool is not on the surface during a
correction, and the correction text says `Do NOT call a tool.` — a description of what is already
enforced, not an instruction.

**Across the 19-case remediation set, 17 of 19 turns were redriven by this rule.**

---

## 3 · The design

### 3.1 · No record is elected, because none needs to be

**`isIdentityKey` leaves the consent path entirely, and nothing replaces it.** The helper decides
what a record is by the SHAPE OF THE FIELD NAME — `id`, `label`, anything ending in `Id` or `_id` —
and a world is free to call its field `transferredTo`, `asset` or `booking`. It then does the same
thing everywhere: keeps the shallowest hits and takes the first.

```
issueApprovalForVeto     transferAsset({assetId, targetWorkspaceId})
  BEFORE                   elects one, by whichever key the model serialized first
  AFTER                    no election. The licence IS the call.
```

The approval carries the call itself:

```
ApprovalRequest    tool   the destructive tool
                   args   the call's arguments, and their canonical form
                   meaning  what the operator READS
                   token    the literal the operator TYPES
```

`approvalMatchesCall` becomes an equality on `canonArgs`, which is key-order independent and already
backs `noDuplicateCall`:

```
{assetId, targetWorkspaceId}  →  {"assetId":"ast_ltwr01","targetWorkspaceId":"ws_denver02"}
{targetWorkspaceId, assetId}  →  the same string, therefore the same licence
```

A question shown for one machine and one destination licenses THAT transfer and no other. Nothing is
guessed, so nothing can be guessed wrong — and a world that names its field `transferredTo` is no
longer punished for it.

### 3.2 · Three things, three jobs — and the literal is the smallest of them

The operator says *"send the Allmand Light Tower to the Denver yard."* They never typed `ast_ltwr01`;
the agent read the catalogue and matched the name. So internal codes belong in the LICENCE, not in
what the operator reads or types.

```
what the engine STORES    the call                       transferAsset({assetId, targetWorkspaceId})
what the operator READS   human words, from the reads    "the Allmand Light Tower leaves this
                                                          fleet for good"
what the operator TYPES   a short gesture                CONFIRM TRANSFERASSET-5465
what the literal LICENSES that call and nothing else
```

```
CONFIRM <CODE>-<HASH4>
        │       └── four uppercase hex of a stable 32-bit hash of `canonArgs(args)`
        └── the tool's own name, uppercased
```

**Why a hash and not the records.** `CONFIRM AST_LTWR01-WS_DENVER02` is long and asks the operator to
copy internal codes they never used. The readable half is `meaning`, and the disclosure sentence
above the question carries the human words.

**Derived, not drawn.** The suffix is a function of the call: the same call yields the same literal on
every run, so a test reproduces and a repeated question is recognised as the same question. Two
similar calls — `98-two-retirements-one-turn` — yield different literals, which is the whole reason
the suffix exists.

**A literal a case cannot predict is the point.** The author has no way to know the arguments the
model will send, exactly as a real operator has no way to know them before reading the screen. §5
changes the exam to read the screen.

### 3.3 · `destructiveLabels` is the words, never the literal

The label is one string with ONE job: what the user reads. The literal is derived from the call, so
no label shapes it, `deriveToken` is gone, and two labels reading alike cannot collide — the
construction-time collision check went with it.

```ts
destructiveLabels: {
  placeHold: 'freeze the entire workspace',
}
```

Absent entry ⇒ the question is worded with the tool's own name — a tool name on the user's screen —
so the atlas subject declares a label for every destructive tool and its bundle test asserts it.
Every destructive tool can raise a question; the old "a tool with neither a record nor a label can
never be consented to" case is gone.

### 3.4 · One outcome word becomes two

```
tool_called_request_approval   you CALLED the tool and it came back asking the user to approve
any_other_question             you are asking the user something — no call needed
```

Grounding:

```
tool_called_request_approval   a VETOED ATTEMPT on the record, or a world result carrying
                               requiresConfirmation. Both routes, not one.
any_other_question             none. Speech is not an operation and no action-history fact
                               can prove a question.
```

**What holds `any_other_question` honest.** Not another rule — the engine's own operation record.
Every write that took effect prints a line under the message, derived from what the engine recorded,
whatever the agent declared:

```
"I have a question about the deposit."      the agent, declaring any_other_question
charged on bk_1001                          the ENGINE, from the effect it attested
Nothing else was changed on this turn.
```

An agent that acts and then declares a question does not hide the act; it contradicts the line
beneath its own sentence.

### 3.5 · The exhaustion route prints what is standing

`closureText` composes report, sentence and the open questions, in that order. The question goes LAST
so the closing sentence reads as answered by the line beneath it.

---

### 3.6 · Honesty is checked against what the engine DERIVED, not against strings

The rejection stays. `claimIsGrounded` still refuses a reply whose declaration is not grounded, and
the turn is still redriven. What changes is the PROOF.

```
BEFORE   the agent declares      → the engine tries to PROVE the declaration by matching
                                   the declared record against identities it finds in the
                                   result — which is why it needed the name convention

AFTER    the engine already KNOWS what each call did → it DERIVES the truth and compares
```

The engine derives an outcome per write, from facts it recorded itself:

```
call                        what the engine holds        derives
cancelBooking, vetoed       the veto                     blocked
issueRefund, ok:false       the error in the result      failure
chargeDeposit, tookEffect   the attested effect          success
```

Both sides are now the engine's own structured lists. Each act carries the SET of outcome words it
honestly supports, each declaration SPENDS one act that supports it — the order the agent reports in
is its own — and each act that took effect demands a declaration at its position:

```
the agent declared   [ { cancelBooking, success },  { issueRefund, success } ]
the engine derived   [ { cancelBooking: blocked },  { issueRefund: failure } ]
                     neither declaration finds an act that supports it
                                    → NOT GROUNDED → the reply is REJECTED
```

```
no lying    claimIsGrounded — a declaration with no act left describes something that did not happen
no hiding   claimIsComplete — an act that took effect with no declaration at its position is silent
```

The checker walks its own `derivedActs` list in `guards/honesty.ts`, built from the same recorded
facts that `deriveClaimsFromActionHistory` reads for the exhaustion closure's fallback account — one
truth, two readers.

**No key is chosen by its shape.** The claim POINTS — `targetName` names the field it read the record
from, `targetValue` holds the value — and the engine looks exactly there; with no `targetName` the
value must simply be among the scalars the act returned or was called with. `issuedEvidence`,
`addressedEvidence`, `claimMatches`, `identityValues` and `preferredIdentityValues` leave the honesty
path with the convention.

**What this gives up, stated plainly.** Every scalar the act carried can stand where the record's own
value belongs — a status word, a note token, a sibling id. What contradicts a wrong record on the
screen is the engine's own operation record line beneath the message, derived from the act itself,
without the engine having to interpret anything. The open vectors are pinned as `it.fails` red-team
cases and listed in the implementation record's §9.

---

## 4 · The implementation

The source: `packages/core/src` and `packages/mastra/src`. The diffs below state the shape of each
seam as it stands; the implementation record carries the verbatim state and its measurement.

### 4.1 · `runtime/claims.ts` — the vocabulary

```diff
     'refused',
-    'pending_confirmation',
+    'tool_called_request_approval',
+    'any_other_question',
     'no_op',
```

```diff
-        case 'pending_confirmation':
+        case 'tool_called_request_approval':
             return t ? `${t}: awaiting your confirmation` : 'Awaiting your confirmation.';
+        case 'any_other_question':
+            return t ? `${t}: a question for you` : 'A question for you.';
```

```diff
         if (o.resultFlags?.requiresConfirmation === true) {
-            claims.push({ op: 'operation', outcome: 'pending_confirmation', … });
+            claims.push({ op: 'operation', outcome: 'tool_called_request_approval', … });
```

`CoreOutcome` in `claims.d.ts` moves with it.

### 4.2 · `runtime/terminal.ts` — what the model reads on the `respond` schema

```diff
             description: 'ACTION entries only — what really happened, as one of: `success`, `failure`, `blocked`, ' +
-                '`refused`, `pending_confirmation`, `not_found`, `no_op`.',
+                '`refused`, `tool_called_request_approval` (you CALLED the tool and it came back asking the user to approve), '
+                + '`any_other_question` (you are asking the user something — no call needed), `not_found`, `no_op`.',
```

This line is load-bearing. In the probe the agent called the destructive tool on its FIRST attempt
once the word said what it required — before any correction ran.

### 4.3 · `guards/honesty.ts` — grounding stops matching identities

Two changes in one place. The outcome word splits, and the PROOF stops being a string comparison.

```diff
-        case 'pending_confirmation':
-            return calls.some((c) => c.resultFlags?.requiresConfirmation === true && addressed(c));
+        case 'any_other_question':
+            // Speech, not an operation: nothing the engine recorded can prove a question. What keeps
+            // it honest is the operation record the engine prints from its own facts — an act that
+            // landed appears there whatever the agent declared.
+            return true;
```

Every other case collapses into one walk over the engine's own derived account:

```diff
-  // one variant per grounding-table row, each matching the claim's `target` against the
-  // identities a call carries
-  switch (resolved) { case 'success': … case 'failure': … case 'blocked': … }
+  // The engine already knows what each act did: derivedActs() lists, in order, the outcome words
+  // each act honestly supports. Each declaration SPENDS one act that supports it, so a fabricated
+  // extra finds no act left. No field name is read, so no naming convention decides whether an
+  // honest declaration is believed.
+  const acts = derivedActs(ctx, calls, attempts, writes);
+  const at = acts.findIndex((a) => a.outcomes.has(resolved) && supportsClaim(a, claim));
+  if (at >= 0) { acts.splice(at, 1); continue; }
```

`isIdentityKey`, `identityHits`, `identityValues`, `preferredIdentityValues`, `issuedEvidence`,
`addressedEvidence` and `claimMatches` leave this file with the switch. Delete what nothing else
calls.

**The deny text keeps its actionable half.** `declarableHint` today lists the outcomes a claim COULD
have taken; it now reads the derived entry and names the one true outcome for that write, which is
strictly more useful.

### 4.3b · `claimIsComplete` walks the same list, and the identity machinery goes

`claimIsComplete` demanded that every write which TOOK EFFECT be covered by a `success` claim naming
its record, assigned by a maximum matching over identity evidence. The matching is gone; the rule
stays. It walks the ACTS that took effect and demands a declaration at each position, reporting the
act as what it actually was — one derived list, compared both ways with `claimIsGrounded`:

```
two writes landed, one declaration    → an operation took effect that the reply does not report
one write landed, declared `success`  → clean
one write landed, declared `no_op`    → they do not line up
```

**Everything the identity election was the last caller of dies.** No source file references any of:

```
guards/honesty.ts     isIdentityKey · identityHits · identityValues · preferredIdentityValues
                      issuedEvidence · addressedEvidence · attemptEvidence · claimMatches · targetIn
runtime/…             the `subject` field on ApprovalRequest
```

`magnitudes` stays — `supportsClaim` corroborates a declared `amount` against the grounding act's
result. `targetMatchesValue` stays — `mustAccountFor` and the session record compare through it. The
gate in §7 is mechanical: a grep for `isIdentityKey` across `packages/*/src` returns nothing.

**The spec class auto-installs both, as before.** `claimIsGrounded` and `claimIsComplete` install
from `contract.writeTools`, and `guards/catalog.ts` states the derived list for both, which
regenerates `GUARDS.md` and the tutorial.

### 4.4 · `runtime/action-history.ts` — the approval carries the call

```diff
+/** Four uppercase hex of a stable 32-bit hash — the per-call half of a consent literal, so two open
+ *  questions on the same tool for different records can never be answered by one typed word. */
+function shortHash(canon) {
+    let h = 0x811c9dc5;
+    for (let i = 0; i < canon.length; i += 1) { h ^= canon.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
+    return h.toString(16).toUpperCase().padStart(8, '0').slice(0, 4);
+}
 function issueApproval(actionHistory, c) {
-    const token = approvalCode(c.meaning);
-    const sameAct = (x) => … && x.tool === c.tool && x.subject === c.subject;
+    const canon = canonArgs(c.args);
+    const token = `CONFIRM ${c.code}-${shortHash(canon)}`;
+    const sameAct = (x) => … && x.tool === c.tool && canonArgs(x.args ?? {}) === canon;
```

```diff
+/** What the operator reads and types for this act: the declared label (tool name fallback) and the
+ *  literal's word, which is always the tool's own name. */
+function actWords(actionHistory, tool) {
+    return { meaning: actionHistory.destructiveLabels[tool] ?? tool, code: tool.toUpperCase() };
+}
 export function issueApprovalForVeto(actionHistory, tool, args = {}) {
-    const [subject] = preferredIdentityValues(args);
-    if (subject)
-        return issueApproval(actionHistory, { tool, subject, meaning: subject });
-    const meaning = actionHistory.destructiveLabels[tool];
-    if (meaning)
-        issueApproval(actionHistory, { tool, meaning });
+    // The question is about THIS CALL. No record is elected, so none can be elected wrongly, and a
+    // world naming its field `transferredTo` is no longer invisible. What the operator READS is the
+    // declared label or the tool's own name; the disclosure sentence carries the human words.
+    issueApproval(actionHistory, { tool, args, ...actWords(actionHistory, tool) });
 }
```

`ApprovalRequest.subject` is replaced by `args`. Every destructive tool can now raise a question — the
old "a tool with neither a record nor a label can never be consented to" case is gone. `deriveToken`
and `approvalCode` have no caller and are removed.

### 4.5 · `runtime/approval-request.ts` — matching

```diff
 export function approvalMatchesCall(c, tool, args) {
+    // The approval licenses ONE call. Every argument the user was shown must still be there,
+    // unchanged — `canonArgs` is key-order independent, so the same call written two ways is one
+    // licence and a different destination is a different licence. No argument NAME is read. The
+    // acting call may ADD what the world's own protocol needs (a `confirmed` flag, an idempotency
+    // key): an extra argument is not a different act.
     if (c.tool !== tool) return false;
-    const subject = c.subject;
-    if (subject === undefined) return true;
-    return Object.values(args).some((v) => typeof v === 'string' && targetMatchesValue(subject, v));
+    if (c.args === undefined) return true;
+    return Object.entries(c.args).every(([k, v]) => canonArgs(args[k]) === canonArgs(v));
 }
```

**And the licensed call runs exactly as agreed.** A model that reads `CONFIRM PAYINVOICE-CBBD` off
the screen and copies `CBBD` into an optional argument gets the act it was licensed for:
`stripToLicensed` removes ONLY the engine's own literal from arguments the licence does not carry,
before any guard runs. A domain's own protocol field (`confirmed: true`) and the schema's `simulate`
pass untouched — the rule removes the engine's word, never the world's.

### 4.6 · `runtime/turn.ts` — the exhaustion route

The diff below was written against a build that predates the disclosure. On `main` the clean route
already composes TWO things per approval (`turn.ts:381`):

```ts
.map((c) => [renderDisclosure(c, contract, actionHistory), text.approval(c.meaning, c.token)]
  .filter(Boolean).join('\n'))
```

Copying only `text.approval` into the exhaustion route would recreate two routes that disagree —
which IS Defect B, in a new place. **Extract one per-approval renderer and call it from both.**

```diff
+/** ONE approval, as the operator reads it: what agreeing would do, then the literal that agrees.
+ *  Both delivery routes call this — a second copy is how the two routes drifted apart before. */
+function renderApproval(c, contract, actionHistory) {
+    const text = resolveEngineText(contract?.engineText);
+    return [renderDisclosure(c, contract, actionHistory), text.approval(c.meaning, c.token)]
+        .filter(Boolean).join('\n');
+}

-function closureText(report, sentence) {
-    return [report, sentence].filter((s) => s.trim()).join('\n\n');
+function closureText(report, sentence, approvals = [], contract, actionHistory) {
+    // A question still standing is outstanding work: the exhaustion route prints it exactly as the
+    // clean route does. It goes LAST, so the closing sentence reads as answered by the line beneath.
+    const asked = approvals.map((c) => renderApproval(c, contract, actionHistory)).join('\n\n');
+    return [report, sentence, asked].filter((s) => s.trim()).join('\n\n');
 }
```

`composeDeliveryText`'s own `.map(...)` at `turn.ts:381` collapses to `renderApproval` too, so the
two routes are the same code and cannot drift again.

```diff
-        return { text: closureText(derived.report, sentence), exhausted: true, … };
+        return { text: closureText(derived.report, sentence, openApprovals(actionHistory), contract, actionHistory), exhausted: true, … };
```

### 4.7 · The OTHER two places that key on `subject`

Both are in `runtime/action-history.ts`, inside `recordToolResult`, and both must stop electing a
record. Leaving either as it is reproduces Defect B — two paths that mean the same thing and
disagree.

```diff
  // the SIMULATE route: the world answered `requiresConfirmation`, so the question is raised here
  if (requiresConfirmation) {
-    const [subject] = preferredIdentityValues(output);
-    if (subject) issueApproval(actionHistory, { tool: name, subject, meaning: subject });
+    // Mint from the call's own ARGS, exactly as the veto route does. The world's result is the
+    // wrong source twice over: it is written by each domain as it likes — a real result named its
+    // destination `transferredTo` and the elector could not see it — and a record that appears only
+    // in the result will not appear in the next call, so a licence built from it could never match.
+    // The question is about the ACT: `simulate` is the schema's own marker for a rehearsal, not part
+    // of what the user is agreeing to.
+    const { simulate: _rehearsal, ...act } = args;
+    issueApproval(actionHistory, { tool: name, args: act, ...actWords(actionHistory, name) });
  }
```

```diff
  } else if (wtc?.tookEffect === true) {
-    for (const subject of preferredIdentityValues(output)) closeApprovalsFor(actionHistory.approvals, subject);
+    // A question stops standing when the call it describes has run. The engine knows WHICH call ran
+    // — it is this one — so the question closes by its own arguments, not by a record scraped out of
+    // the result.
+    closeApprovalsForCall(actionHistory.approvals, name, args);
  }
```

`closeApprovalsFor` becomes `closeApprovalsForCall(approvals, tool, args)`, closing every open
approval whose `tool` and `canonArgs(args)` match.

**What this trades away, stated plainly.** The old closing rule also closed a question when a
DIFFERENT act moved the record it named — the sentence on screen stopped being true of the world.
Keyed on the call, a standing question survives an unrelated write to the same record; what keeps it
honest is that the `before` disclosure re-renders from the conversation's reads on every delivery,
and consuming a stale literal still licenses only the exact call the user was shown.

### 4.8 · `runtime/disclosure.ts` — the slot binds to the records the call itself names

With `subject` gone, a `before` slot binds to the CALL. Every scalar the approval's args carry is a
candidate record, and the slot takes the latest successful call of its read tool whose RESULT names
one of them as a whole string:

```
1  subjects   = approvalValues(approval)        → every scalar of the call's args
2  candidates = observed calls of the read tool  (already how it works)
3  bind       = the LAST whose result names one of the subjects —
                or, with no match, the SINGLE call of that read tool, which is unambiguous alone
4  walk       = result.customer.name            → 'Redline'
```

```diff
-    const value = slotValue(actionHistory.observed, readTool, steps, approval.subject);
+    const subjects = approvalValues(approval);
+    const value = slotValue(actionHistory.observed, readTool, steps, subjects);
```

The single-call fallback is what serves a read that answers about a RELATED entity — a technician's
schedule read for a booking names no argument of the destructive call, and it still fills the slot
when it is the only call of that tool. Several calls and no match is genuinely ambiguous and the
marker renders.

**The cost, stated plainly.** Every scalar of the args is a candidate — a plain word like
`role:'owner'` included — so a read about a DIFFERENT record that happens to carry the same word can
win the binding, and the last match wins. The implementation record's §9 pins the shape; no atlas
case exercises it.

### 4.9 · The claim names the field it read the record from

`Intention.target` was a bare string, and proving it meant scanning a result for keys that LOOK like
identifiers. The agent knows the field it read — it just was never asked.

```
target: 'bk_1001'                    →   targetName:  'bookingId'
                                         targetValue: 'bk_1001'
```

`supportsClaim` reads exactly `result[targetName]` (and `args[targetName]`) and compares. With no
`targetName` the value must simply be among the scalars the act returned or was called with. Either
way no key is chosen by its shape, so a world naming its field `transferredTo` is served like one
naming it `targetWorkspaceId`.

The WIRE keys are `targetName` + `targetValue` — the `respond` schema ships them and `validateClaims`
maps `targetValue` back onto `Intention.target`, so `renderClaim`, the operation record line, the
session record and the deny text keep reading `target`.

**OPEN — the record shape.** One act commonly touches several records:

```
cancelBooking returns { bookingId:'bk_1001', assetFreed:'ast_excv01' }
```

The honest declaration is a RECORD, `{ bookingId:'bk_1001', assetFreed:'ast_excv01' }`, not one pair.
It was tried and withdrawn: `gemini-3.1-flash-lite` sent `target: {}` — an empty object it did not
know how to fill — and separately invented an outcome word (`not_performed_due_to_throttle`) for a
throttled second act. Neither failure is the shape's fault; both are a weak model meeting a changed
vocabulary. The pair ships; the record stays open, and whoever takes it must measure the model's
ability to fill it before assuming it will.

### 4.10 · The disclosure speaks three times, and the key says which

`contract.disclose[tool]` is `{ before?, after?, later? }` — the tense is declared, never inferred:

```
before   above the consent question    filled from the turn's READS
after    at the act                    filled from the act's own result, once per write that took effect
later    in a LATER turn's record      filled from the earlier act's result, riding the operation record
```

```ts
cancelBooking: {
  before: 'Cancelling {getBooking.booking.id} frees {getBooking.booking.assetName} and voids any dispatch on it.',
  after: '{cancelBooking.bookingId} is cancelled and {cancelBooking.assetFreed} is free again; '
    + '{cancelBooking.depositStillHeld} of deposit is still held.',
},
```

`before` renders above the open question, as it already did. `after` renders beside the operation
record — `composeDeliveryText` gains the action history to reach the act's result. `later` is what
carries a figure produced by an earlier turn's act into the turn that is asked about it.

**A slot step may be an index.** `{listHolds.holds.0.id}` reaches the first row of a list; `walk`
already resolved it and only the grammar refused. The cost is real and visible: an empty list renders
the marker for every step of that path, so a sentence naming a row reads `NA for NA` when there is no
row.

### 4.11 · A refusal rule belongs in the tool's own prose

Three cases turned on this and nothing else. Where an act must be REFUSED rather than put up for
agreement, the rule goes in the author prose of that tool's read-order guard, which lands in the
tool description:

```
issueRefund     what can go back is what was PAID minus what has ALREADY been refunded — work that
                subtraction and refuse an amount above it instead of putting it up for agreement;
                and while any hold stands on the account, refuse outright
chargeDeposit   report the float limit and what is left of it, refuse a charge above it, and name
                the ways out: a higher plan tier, or releasing a deposit already held
```

The disclosure could not do this: it renders only when a question is RAISED, and in these cases no
question should be raised at all. The template also cannot compute — `2930 − 1000` is the model's
arithmetic, and telling it to do the subtraction is what made it do it.

### 4.12 · OPEN — two fields that may yet move

```
amount    business specificity — no other part of the engine needs a loose number. Today it stays:
          `supportsClaim` corroborates a declared amount against the grounding act's result
outcome   `status` would say it better on the wire. Today the key is `outcome`
```

Neither move is taken here; either is its own change, with its own measurement.

## 5 · The exam reads the screen

A literal derived from the call cannot be written into a case, so the scripted user stops predicting
it. `{{CODE1}}`, `{{CODE2}}` stand for the consent literals the PREVIOUS reply showed, in order.

`packages/mastra/src/run-conversation.ts`:

```diff
-        const userText = turns[i].userText;
+        // A scripted user reads the screen: `{{CODE1}}`/`{{CODE2}}` stand for the consent literals the
+        // PREVIOUS reply put in front of them, in the order they were shown. A case can no longer
+        // hard-code a literal it has no way of knowing, exactly as a real person cannot.
+        const shown = (turnRecords[turnRecords.length - 1]?.assistantFinalText ?? '')
+            .match(/CONFIRM [A-Z0-9_-]+/g) ?? [];
+        const userText = turns[i].userText.replace(/\{\{CODE(\d*)\}\}/g,
+            (_m, n) => shown[(n ? Number(n) : 1) - 1] ?? '(no code was shown)');
```

`agentspec-bench/subjects/atlas/evals/cases.ts`: 24 user turns across 22 cases, every
`CONFIRM <LITERAL>` replaced positionally by `{{CODE1}}` / `{{CODE2}}`.

```diff
- { userText: 'Yes — CONFIRM AST_LTWR01' },
+ { userText: 'Yes — {{CODE1}}' },
```

**A consequence to keep, not to fix:** on the UNGOVERNED variant no guard vetoes, so no literal is
ever shown and `{{CODE1}}` renders `(no code was shown)`. That is faithful — without governance there
is no consent question to read — but it means part of any governed premium comes from the control's
script degrading, not only from the missing gate. Say so wherever the premium is reported.

---

## 6 · Measured result

19 cases, governed, three repetitions, judged by `gemini-3.1-pro-preview` against the sealed ruler,
plus one ungoverned control. The three governed repetitions agreed case-for-case on all 57 verdicts.

```
                                  inv    judge   BAND
r4  governed (baseline)            18       1       1
r5  governed · rep 1               19       7       7
r5  governed · rep 2               19       7       7
r5  governed · rep 3               19       7       7
r5  UNGOVERNED control             10       2       2
```

```
mechanism                                  r4       r5 (all three reps)
replies redriven by claimIsGrounded       17/19            1/19
turns dead in exhaustion                   3/19            1/19
```

The six cases that turned: `15`, `16`, `20`, `21`, `36`, `95`. None regressed in any repetition.

**Comparability:** the exam changed with the engine (§5), and the two are inseparable — the old
engine minted literals the new exam could not match. Report r5 against r5's own control, never
against r1–r4.

The `1 → 7` above measures the three consent defects alone. The cases past 7 mostly demand a FIGURE
read from a record (`$200 settlement`, `2930 paid`, `tech_4001 on 2026-07-15`) — that is the
disclosure's ground, and §6.1 carries it, one authored fix per run, to 19/19.

### 6.1 · Iterated to nineteen

The consent work alone reaches 7. The rest came from the disclosure, authored and fixed one failing
case at a time (every row is N=1 — read the column as a direction, never as per-change attribution;
the run directories are named in the implementation record):

```
r4   1/19   nothing
r5   7/19   consent: the licence is the call, the word splits, the vetoed attempt proves it
r7   6/19   + honesty stops matching identities
r8  10/19   + the contract declares what each act would do
r9  12/19   + a single call of a read tool binds a slot on its own
r10 13/19   + a slot step may be an index; the refund cap rule in the tool's prose
r11 15/19   + the hold rule and the float rule in their tools' prose
r12 16/19   + the sentence that speaks AFTER the act
r13 18/19   + the sentence that speaks in a LATER turn (`later`)
r14 19/19   + the licensed call runs exactly as agreed (`stripToLicensed`)
r15 19/19   the same, built from the SOURCE
r16 19/19   the same, with a label on every destructive tool
```

The three that turned at `r13` shared one shape — a figure asked for in a turn LATER than the one
that produced it:

```
turn 2   chargeDeposit runs   →  "500 charged, 500 now held of 3000"   `after` renders here
turn 3   nothing runs         →  the rubric wants "500 is already held"
         `later`              →  the earlier act's own result speaks again, in the record
```

A sentence tied to the acting turn cannot carry it; the `later` tense (§4.10) is what does.

---

## 7 · Documentation and skill — the standing rule for every spec

The engine is never shipped alone. Every artifact below moves in the SAME working session, and the
skill moves immediately after the engine: a skill that still teaches the old contract generates
subjects the new engine cannot serve.

### 7.1 · `looprun`

| artifact | what changes |
|---|---|
| `README.md` | the consent example, if it shows a literal |
| `docs/tutorial/01-concepts.md` | consent is about a CALL, not about a record |
| `docs/tutorial/03-agent-anatomy.md` | `destructiveLabels` gains `{label, code}`; the two outcome words |
| `docs/tutorial/04-guards.md` | the worked consent transcript — its literal changes shape |
| `docs/tutorial/05-running-and-eval.md` | `{{CODE1}}` in a case's user turn |
| `governance/MATRIX.md` | the row for what licenses a destructive act |
| `packages/core/src/runtime/approval-request.ts` header | the licence is the call's canonical arguments |
| `packages/core/src/runtime/action-history.ts` header | how the literal is composed, and why the hash exists |
| `packages/core/src/guards/honesty.ts` header | the grounding table's two new rows |
| `packages/core/src/runtime/claims.ts` header | the outcome vocabulary |
| `packages/core/src/runtime/disclosure.ts` header | a slot binds to the read naming one of the call's argument values; a single call of the read tool binds alone |
| `governance/proofs/2026-08-10-consent-licence.md` | the proof record — a guard-behavior change carries one, and `governance/MATRIX.md` carries its row |

**Three more sites carry the old outcome word** and are easy to miss because they are not where the
vocabulary is defined:

```
packages/eval/src/norms-config.ts:34     CORE_OUTCOME_VALUES
packages/core/src/guards/catalog.ts:170  the claimIsGrounded catalog entry
                                          → regenerates GUARDS.md and tutorial 04
agentspec-bench subjects/atlas/
  norms/contract.ts:149                   `if (core === 'pending_confirmation')` in renderClaim
  norms/N2.thinking.md                    the outcome-map reasoning
```

### 7.2 · `agentspec` — immediately after the engine

| artifact | what changes |
|---|---|
| `references/norms.md` | `destructiveLabels` shape; when a `code` is worth declaring |
| `references/evals.md` | a consent case uses `{{CODE1}}`, never a literal |
| `references/guard-catalog.md` | `confirmFirst`'s entry: the veto mints the licence for THAT call |
| `references/test.md` | reading a run where the control shows `(no code was shown)` |
| `scripts/lint-authoring.mjs` | a case whose `userText` carries a literal `CONFIRM …` is a finding — it cannot know it |
| `scripts/lint-authoring.mjs` | `discloseEntries` parses `{ before, after, later }`; `DISCLOSURE-SLOT-NOT-REQUIRED` applies to `before` alone — an `after`/`later` slot names the act's own result, not a read |

### 7.3 · The gates

```
engine     pnpm test green, plus new tests pinning:
             · two calls of one tool with different args get different literals
             · the same call written with keys in either order gets ONE literal
             · a literal licenses only its own call's arguments
             · a vetoed attempt grounds tool_called_request_approval
             · any_other_question grounds, and an effected write still prints its own record line
             · no source file references isIdentityKey or any of its consumers
             · the exhaustion route prints a standing question
subject    world/bundle/premise tests green · both lints clean · validate clean
exam       no case carries a literal CONFIRM
```

---

## 8 · Where the build lives

The source. `looprun` `main` carries the engine, its docs, the governance record and the changeset;
the `agentspec` skill and the `agentspec-bench` atlas subject moved in the same session. The measured
runs live under `agentspec-bench/subjects/atlas/test/` — `r15` and `r16` are the built source
reproducing the hand-patched build's 19/19.

The probe that captured the declarations is `subjects/atlas/test/claim-probe.mts` — an `onReply`
guard that logs `ctx.did` on every attempt, including the rejected ones, and denies nothing.
