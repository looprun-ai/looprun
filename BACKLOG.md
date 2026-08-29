# Backlog

Open items, ordered by priority: row 1 is the next thing this repo owes. Every entry here is work
that is still owed; an item leaves the table only when it is done or explicitly retired with a
reason — a pending item that quietly disappears is the failure this file exists to prevent. Skill
work lives in the agentspec repo's `BACKLOG.md`; these two files are the only work queues.

Row 1 is the ruled program's open head (the pt-BR exam and the natural reply are done — the
natural reply closed at 96/100 with every counter zero, rep2 sealed in agentspec-bench). Rows
4–6 are the byte-attack queue; row 1's adversarial evaluation weighs them as candidate
mechanisms.

| # | item | what remains | next step |
|---|---|---|---|
| 1 | **Prompt bytes: −50%** | Target ruled: half the rendered prompt without losing a point — a reduction that costs a point is not a reduction. The options are evaluated adversarially BEFORE any is built; candidates on the table: a new TEST step after the T-loop that compresses what the loop proved stable; a new step after card emission that rewrites the rendered bytes; the generation-side queue (rows 4–5); and the semantic per-sentence pass (keep · shorten · delete, one row per sentence — register `docs/analysis/2026-08-20-authoring-register.md`, B1b/B5). Reference figures: atlas-next renders 99 538 B; c17 renders ~134 KB; measured live: 28 848 input tokens/case, 4 789/model call, 3.89 calls/turn (rep2). **The ruler kit is committed**: `agentspec-bench/tools/_anat.test.ts` (bytes per desk) · `_dup.test.ts` (card prose duplicated in the system block) · `_dup2.test.ts` (one sentence stamped across cards) · `_finish.test.ts` (the finish channel's cost) · `_schema.test.ts` (schema boilerplate) · `_step.test.ts` (one step's exact resend). Run from the bench root, no model and no key: `SUBJECT_DIR=subjects/atlas-c17 <looprun>/node_modules/.bin/vitest run tools/_step.test.ts`. **Addendum — tape pruning**: every model call resends the session tape along with the prompt, and a long-lived session (the chat door) grows the tape without a ceiling; this item owns that ceiling too — a pruning or summary rule for the governed tape, held to the same bar (a cut that costs a point is not a cut). The router's tail-1 window (one exchange, 16/16 on the sequence probes at constant ~350 tokens) is the existence proof that a bounded window can hold a bar. | Adversarial evaluation of the candidates first; the winning set becomes the spec; every proposal ends in a judged run. |
| — | **Routed residue: structural code routing + one verb scope** | Certified at unpinned 96/100 · routed 97/100; the residue is three rows, none grave. (a) A bare approval code after a drift carries no routing signal — the deterministic cut: the routed door already sees every desk's issued/consumed questions on the records it holds, so a message carrying an OPEN code routes structurally to the desk that issued it, zero model calls (kills the whole approve-after-drift family). (b) The fieldops line's late-return verb over-absorbs a RETURNED hire's balance ask — scope it to a hire still out (`what a late return still out owes`), micro-probe route-35 vs 37 first. (c) route-87 (competitor-price lure past the none-door) stays the accepted miss. (d) A read living on one desk is unreachable from the desk the turn routed to — c20 case 52 routed to `billing` while `getAuditLog` exists only on `workspace`, so the reply never mentions the log the operator pointed at. | Engine cut (a) + one T-loop round (b); targeted subset, then one closing routed run. |
| 2 | **`needs` — the owed read is one declaration** | The `pick` half is shipped: a needs alias binds one row of a list read, keyed by the held call's own argument (`{ list: holds, by: id, key: holdId }`) — case 18's reason rides the woven ask, with proofs in core and emit. What remains is the unification: `onlyAfter` renames to `needs` and carries the whole relation — the read, its declared args, the pick — so the owe verdict arms the read ENGINE-side wherever the declaration exists (the model micro-step remains only for undeclared surfaces) and the disclosure reads the same declaration. | Spec: the rename in one move, old name deleted, no shim; engine + emit + docs + skill in the same session. |
| 3 | **The negator list is English and the word-scanner is ASCII** | Measured on the pt-BR exam (atlas-c17-ptbr, case 68, minimal pair proven against the engine): `NEGATORS` in `packages/core/src/cards/catalog.ts` carries English words, and `negatedBefore` builds words from ASCII `a-z` only. The Portuguese preposition "no" — "trincada no ast_excv01" — matches the negator `no`, so a stated choice term ("danificada") counts as negated and the lawful call is refused. The mirror is worse: a real Portuguese negation is never seen, because "não" tokenizes as "n"+"o". One word cost the pt-BR run its only new failure. | Make the negation scan language-aware (per-language negator sets + a word-scanner that keeps non-ASCII letters), or tighten the negator walk to a window beside the term; prove with the case-68 minimal pair. |
| 4 | **The six house laws move to the engine's mouth** | The six conduct templates (declareHonestly, oneQuestion, yourLaneYourReads, recordsOverAssertions, askBeforeYouChoose, nameItDoNotPassItOn) are skill markdown that every author copies and fills by hand — so their wording drifts silently. Measured: the "put nothing up" clause lived in three catalog passages and taught blind authors to refuse without attempting, starving every deterministic channel, until the passages were rewritten by hand; a wording defect in a template is invisible to every lint. The engine already owns minted sentences (floor guards, the eight engine sentences, factory rules), so the same mechanism fits: a house law the ENGINE mints, with declared per-desk slots for the desk's own vocabulary. Trade-off to design around: the per-desk wording freedom of the current templates measured as valuable. | Spec: house laws as engine-minted rows with per-desk slots; the skill teaches only the slot-filling. |
| 5 | **Every guard generates its own catalog text** | The parity triangle (agentspec declared-parity.test.ts x LAWFUL_ARGS x declare.md) verifies factory NAMES and ARGS, never teaching WORDING — the catalog's per-guard content is hand-written and drifts: the "$25,000 -> REFUSED" example stated the old matcher's behavior until it was hand-corrected in the same session as the code change, and only the ship-together law caught it. Direction ruled as required ("EXTREMAMENTE CORRETO"): the per-guard catalog text is GENERATED from looprun, nothing per-guard comes from outside. Design: each factory in packages/core/src/cards/catalog.ts carries its teaching as co-located structured metadata (whenToUse, neverFor, a filled invented-domain example) beside the code it describes; a generator emits the catalog's per-guard sections between markers; a freshness test fails when the committed page differs from the generated output; adding a guard without its teaching fails the build. Honest boundary: only PER-GUARD content generates — the catalog's cross-cutting sections (byte arithmetic, the pairing walk) remain authored pages. | Spec: teaching metadata on every factory + the generator + the freshness gate; the triangle's factory half becomes construction instead of verification. Same principle as the engine-minted house laws above (the engine owns its own words) — one spec or two sibling specs; the spec work decides. |
| 6 | **The guard doc outside code is one hand-written lesson** | docs/tutorial/04-guards.md is the only guard documentation outside the code and the skill; it is held honest by the lesson-compile test and the ship-together law, nothing else. No generated reference exists. | Fold into the catalog-generation spec above: one metadata source, two outputs — the skill's catalog section and a looprun reference page. |
| 7 | **The install path the LP promises has no repo behind it** | The public org is `looprun-ai`: this engine is `looprun-ai/looprun`, the benchmarks are `looprun-ai/looprun-bench`, and every LP link names them. What the org move did not buy is the promise on the page — `npx skills add looprun-ai/looprun` resolves to a repo that carries the engine and no skill, so the command fails for anyone who runs it. **Launch gate** for the LP, owned by the skill migration (agentspec backlog row 1); the row stands here so the gate is visible from the engine's queue too. One residue outside that migration: the skill's own `author` field still names the old org. | Nothing here until the migration ships the skill into this repo; then run the command end to end from a clean machine. |
| 8 | **Every published figure is void** | No looprun-measured number in the tree was produced by the engine, the guards and the process as they now stand. | Re-measure before publishing any looprun figure. |
| 9 | **E1 re-baseline** | Forbidden invariants score over executed ∪ guard-vetoed attempts (E1). A figure measured on an executed-only basis does not carry over to this scoring rule. | Re-measure or withdraw before citing a figure measured on a different basis. |
| 10 | **Non-vacuity proved on a STALE bundle** | The bundle the proving run used (`theme.ts`) is not the shape the tree emits; rules fire, but not against a current bundle. | Re-run once a current bundle exists. |
| 11 | **No current bundle to measure or lint against** | Examples are seeds; the only complete subject is the minimal toy-subject fixture. Lint non-vacuity proofs and discrimination runs have nothing realistic to run on. | Generate a current bundle when one is needed. |
| 12 | **Atlas regeneration** | The atlas subject is being repaired case by case against the current engine. Until it is regenerated whole, the disclosure slot authoring and the lint findings on that subject stay open, and no figure measured on the pre-regeneration subject carries forward. The five read-invariant hold-outs filed 2026-08-01 (agentspec-bench `docs/analysis/2026-08-01-consent-attribution.md`) are re-decided by the regenerated exam. | Regenerate the subject once the open cases are closed, then re-measure. |
| 13 | **A required read is a veto, and a veto is a hope** | `requiresBefore` states the reads an act owes and DENIES the act when one is missing — it forces nothing. What makes an agent read first is `prose()`, which puts the rule in the assembled prompt. That works on the subject model measured (its whole family denies once across a 100-case exam) and is a property of that model, not of the guard. See below. | Evaluate whether a required read should be FORCED, on the `{verdict:'downgrade'}` precedent, and what it costs to carry an LLM seam to the preTool door. |
| 14 | **`noUngroundedRegulatedFigure` prose is not overridable** | The check fits a price-grounding rule but its prose is medical-flavored — a domain with a non-medical regulated figure cannot use it cleanly (found porting the skill, first NORMS run). | Make the prose overridable or generalize it. |
| 15 | **`custom()` GuardCtx cannot read tool-result text** | A custom reply-check cannot reach TOOL-RESULT text through GuardCtx, so result-grounded claims (e.g. a price echoed from a simulate) have no deterministic proxy (found porting the skill, first NORMS run). | Design the result-text seam into GuardCtx. |
| 16 | **`MONITOR.resolved` marker is presence-only, not incident-bound** | The monitor gate clears on the mere existence of a `MONITOR.resolved` file — a marker dropped before the incident (or left stale from a prior run) bypasses the gate; it is not bound to the specific incident it claims to resolve. | Bind the marker to the incident (id/hash) so a pre-creation or stale marker cannot clear a fresh incident. |
| 17 | **`StateDirective.when` never evaluated** | The conditional hook on `controls.directives` has no caller — directives render as static prose. | Implement the evaluation or remove the field. |
| 18 | **Uncheckable ruleId dropped at load** | `norms-config.ts` discards the `ruleId` on `uncheckable` rules at load; the bound-question layer needs it to attribute a verdict to a rule. | Restore id plumbing before that layer consumes uncheckable rules [gate on judge layer]. |
| 19 | **Preset distinguishability keyed off projection only** | `checkWorldModel` compares `projection()` (today/status/counters); a preset patching a non-projected field of a seeded record is falsely flagged INDISTINGUISHABLE despite a real world change. | Either document projection as the canonical distinguishability surface, or widen the check to a full-state digest. |
| 20 | **Engine-owned question: off-surface promise** | The evidence is already in the engine — `spec.surface.tools` says what this agent can do. A promise to email, sync or open an app when no such tool exists is answerable without a word of domain vocabulary, yet every domain writes its own wording for it. Two hermes-sim specs record it as conditioned prose. | Design one engine question, measure its miss rate on its own fixture set, then ship. Depends on `docs/superpowers/specs/2026-08-05-one-judge-one-question-design.md`. |
| 21 | **Engine-owned question: instruction arriving inside a tool result** | Fully generic: "does a result instruct a destructive act the user did not authorise this turn?" carries no domain vocabulary at all. An author binding it today writes the wording from scratch, on the hook where a bad question is most expensive — a call-side judgement gates the act itself. | Design one engine question bound on `preTool`, measure it, then ship. Depends on the one-judge design. |
| 22 | **Engine-owned question: a claim about an earlier conversation** | The engine holds `ctx.history`, so "does the reply assert a prior exchange the history does not carry?" is answerable from evidence it already has. One hermes-sim spec records it as conditioned prose. | Design, measure, ship. Depends on the one-judge design. |
| 23 | **Engine-owned question: disclosure with no grounding** | The generic half — "does the reply state a value that appears in no result?" — is engine-answerable. The domain half — WHICH fields count as personal — is not, and a medical desk and a rental desk disagree. Splitting the two is the design work. | Decide the split before designing; the generic half may fold into the grounding question rather than become its own. |
| 24 | **Cost per governed conversation is unverified against a real workload** | Measured on the atlas exam: R$0.031 per conversation of 1.53 turns, R$0.020 per turn, 15.5k input tokens per turn. Nobody has checked what that becomes on a conversation of ten or twenty turns, where every turn resends the whole transcript, nor how much of the per-turn input is the static assembled prefix that a cache should be absorbing — the measured cache-read is 19.6% of input. | Measure a long conversation, split per-turn input into static prefix vs transcript, and state the cost curve. See below. |
| 25 | **`@looprun-ai/vercel`** | Factory throws; seam contract documented, nothing implements it — runtime is Mastra-only in practice. The landing page names Vercel AI as a supported framework with no roadmap caveat, which makes this seam a **launch gate** for the LP. | Implement before the LP launches. |
| 26 | **LangChain adapter** | No seam exists. The landing page names LangChain as a supported framework with no roadmap caveat, which makes an adapter a **launch gate** for the LP. | Design + implement before the LP launches. |
| 27 | **Certification has no held-out split** | The T3 fix loop iterates against the same exam that S1 certifies — training-on-the-test-set (Goodhart) risk. Mitigations exist (blind exam authorship, worst-run floor, discrimination gate) but no case is held out of the fix loop. The LP deliberately makes NO held-out claim until this exists. | Design a held-out split (or equivalent) in the skill's T/S phases; then the LP may say "the certified score comes from cases the fix loop never saw". |
| 28 | **`lintSpecQuality` has no tests** | It ships with an export-existence check only; nothing stops an edit from silently disarming a rule. | Plant-the-defect / watch-it-fire test per rule. |
| 29 | **Release script silently skips an existing version** | Publishing an already-registered version is a silent no-op — a ghost release (it happened). | Abort loudly when the target version exists. |
| 30 | **Lint: tools.json drift vs served surface** | Not decidable offline — needs a live server. | Implement as a runtime check, not a lint. |
| 31 | **Lint: projection key / preset never exercised in world test** | The world TEST file has no fixed shape; a gate over an unconstrained file is a guess. | Define the convention first, then lint. |
| 32 | **Lint: simulate parity for the two-step flow** | The STATE half is answered offline by `WRITE-REFUSED-UNGATED`, which compares each declared preset against `default` and demands a spec-side gate on every lane that carries the write. What remains is the EXECUTION half: whether the simulation→confirm sequence itself completes, which requires running the flow rather than reading it. | Decide lint vs test for the execution half, then implement. |
| 33 | **Skill's own lint battery split** | Artifact laws lint here, authoring conventions in the skill's `lint-authoring.mjs`. | If a rule moves, update both sides. |
| 34 | **Lie check is model-dependent** | The pass ships OFF (binding `llmCheckLie()` asks for it). Its detection is a property of the model that answers the question: over 11 hand-adjudicated lies × 3 replicates, one model per developer, the reference model catches 8/11 and the five light models catch 0–2/11, with 0 honest damage everywhere. No wording separates an honest state description from a lie that describes itself as a state. | Build the structural replacement (extract the entities the message states as done → deterministic set difference against the two lists) and hold it to the acceptance bar. Full context: `docs/analysis/2026-08-04-lie-check-model-portability.md`. |
| 35 | **Attestation service (idea, not scheduled)** | Design at `docs/superpowers/specs/2026-07-31-attestation-service-design.md`: ed25519 layer-2 attestation over the seal, free-for-telemetry service, hashed client identifiers, transparency log. Zero code exists — no `attest` command, no service, no keys. | When prioritized: implementation plan for (1) `looprun-eval attest` + telemetry builder, (2) the service repo, (3) `verify` layer-2 extension. |
| 36 | **Agent-as-tool bridge (MCP server)** | Runtime consumes MCP tools but never serves agents as tools; governance verdict as structured result data. The OpenAI endpoint is the works-today path; this is roadmap. | Roadmap — design when prioritized. |
| 37 | **Guard priority: where `agent` sits** | Whether the `agent` priority runs before or after `changeAllowed` is undecided. The four engine priorities are closed sets and the order between these two has never been forced by a real case. Spec: `docs/superpowers/specs/2026-08-06-guard-priority-design.md`. | Decide when a case forces it, not before. |
| 38 | **`looprun-bench` still speaks the retired vocabulary** | `looprun`, `agentspec` and `agentspec-bench` name the seven concepts plainly, and `tests/plain-names.test.mjs` holds them there. `looprun-bench` pins one engine per edition — `0.2.1` for tau2-telecom, `0.6.0` and `0.6.1` for atlas — because an edition is reproducible against the engine that measured it. A swept tree fails typecheck with `Module '@looprun-ai/core' has no exported member 'createActionHistory'`, so renaming an existing edition would mean re-measuring it. | Rename an edition only when a new one is built on a post-rename engine. Spec: `docs/superpowers/specs/2026-08-06-plain-names-design.md`. |
| 39 | **hermes-sim bundles carry no reply-honesty coverage** | No guard factory takes a `RegExp`, and the hermes-sim example bundles install no reply-honesty rule at all. The judge seam a bound question needs is reachable now, so this is a porting task, not a design gap. Ruled last of the queue: hermes-sim work comes after everything above. | Author the honesty rules as `llmCheck` questions and port them into the bundles. |
| 40 | **An unpaid debt is refused with another guard's sentence** | `refuseUnpaidDebt` (`call-runner.ts:311`) picks the FIRST preTool guard carrying an `owe` instead of the guard that raised the verdict, and the composer then treats that guard's conditional wall sentence as a standing world fact. Measured on c20 case 82: the reply delivered "the workspace is currently subject to a payment hold" — the guard's own rule text — while `listHolds` had returned `count: 0` and the unpaid debt was `getCustomer`. | Carry `verdict.guardName` through to the refusal, and keep a guard's rule text out of the composer's fact channel. |
| 41 | **One debt per call, ever** | `mayOwe` is a single boolean that flips false at `call-runner.ts:214`, so a call with several `onlyAfter` prerequisites can never pay them all in one turn — three prerequisites means the third is unreachable. Measured on c20 case 82. | Loop the owe payment, bounded by the call budget. |
| 42 | **`proseDropsReads` passes a reply that names one id and drops every field** | The predicate (`turn.ts:55`) returns false the moment the prose carries ONE returned identifier, and it runs only on the prose-direct branch — a reply that says "bk_9" and none of the record's fields passes. Measured escapes: c20 cases 17/37/71 and c17 cases 30/71/83. | Demand the read's material fields, not one id; run it on every path that delivers prose. |
| 43 | **A slot that survives to delivered text is refused, and a consumed later learns its result** | The engine drops a consumed later still carrying `{` whole (`consent-desk.ts` laterTexts); nothing yet REFUSES an unrendered slot in any other delivered channel, `{result.` is not in `brokenReply`'s LEAKS list, and the dropped later never learns the executed act's result — the standing sentence is lost instead of filled. Measured on c20 case 27 before the drop shipped. | Refuse `{...}` in any `DeliveryFact.text` at assembly, add `{result.` to LEAKS, and fill the later's result slots from the executed act at `markExecuted`. |
| 44 | **`valueFromUser` reads one turn while `choiceFromUser` reads the conversation** | `catalog.ts:576,585` scan `ctx.userText` (this turn only); `catalog.ts:682` scans `ctx.userTexts` (the whole conversation). A value stated on turn 1 and acted on in turn 2 is treated as never given. Measured on c20 case 44 / route r005: 12-13 blocked `generateQuote` calls on dates the operator had already stated. | Scan `ctx.userTexts` in both factories; prove with the case-44 minimal pair. |
| 45 | **The delivered prose has no reader** | Three seams share one hole: `HonestyCheck` matches only the structured report rows, so when `report` is null the prose carries the lie unchecked (c20 case 67); reply guards run on the model's draft (`turn.ts:310`) while the composer rewrites it afterward, and `engineClose` runs no reply guard at all; a reply asserting a record state with ZERO supporting acts passes everything (c20 cases 63/71/92: "no tool available on this surface" then `registerAsset` done on the same desk). | One reader over the COMPOSED text: state claims demand a supporting act, and the floors run where the words actually leave the engine. |
| 46 | **The emit lint demands an `after` only at the birth register** | `checkCreatesLawAndAfter` (`packages/emit/src/against-surface.ts:247`) covers record-opening acts only, and `checkAfterSpeaksResult` (`:396`) validates only afters that already exist — a mutating tool with NO after passes both. Measured: c20 shipped 8 of 16 write tools without an `after`, and the birth sweep scored the after row HELD 9/9 over that hole. Sequencing: this lint refuses c20's current declaration, so it lands only after the c20 T-loop closes. | Demand an after-tense on every mutating tool at emit. |
| 47 | **The tutorial's hotel snippets cannot serve their own exam** | `docs/tutorial/snippets/hotel/world.ts` states two world cards in one file, which `factsFromSource` refuses; `cards.ts:32` binds `valueFromUser('moveBooking','day')` while `moveBooking` is `form:'set'` whose derived schema is `{id,set}`, so the guard reads `undefined` and denies every call; no tutorial test calls `moveBooking`. | Split the world cards, bind the guard to an argument the schema carries, and add the missing test. |

---

## A required read is a veto, and a veto is a hope

### What the engine knows, and what it does with it

`requiresBefore(['getInvoice'])` on `voidInvoice` says the invoice must be read before it can be
voided. When the agent skips the read, the guard returns a sentence:

```ts
check(ctx) {
  const missing = deps.filter((d) => !ranWithin(ctx, d));
  return missing.length ? `Do ${missing.join(' then ')} FIRST — it must run before this tool.` : null;
}
```

The call is denied. Nothing is read. Whether the read then happens is the agent's choice.

### Why that reads as working today

Across the 100-case atlas exam the whole `requiresBefore` family denies **once**: the agent reads
first, every time, because `prose()` renders the rule in the system prompt and the agent meets it
before it plans. That number describes `gemini-3.1-flash-lite`. Another model that ignores the line
gets the deny — and there is no second mechanism behind it.

### The measured cost of relying on the agent

The same requirement was built once as a deny that also told the agent what to do next: *call
`getInvoice` now, and then make this exact call again — BOTH steps on this turn, before you reply.*
On the four cases that needed it:

```
                              09      10      14      95
told to read and re-call      FAIL    ok      ok      FAIL
```

Two of the four read the tool and then replied. The turn ended with the act never put to the user at
all — worse than what the deny was meant to prevent. A more imperative wording changed nothing.

### What a forced call looks like, and why it is not simply reused here

`runDisclosureCompletionPass` forces a read on the seam `flowChain` already uses — one generation,
one tool, `toolChoice: 'required'` — and it works on all four. It runs AFTER the turn generates, on
open approvals, and it cannot be moved to the preTool door as it stands:

```
evaluatePreTool lives in framework-free core   → no LLM seam reaches it
forcing the read mid-veto does not run the act → the agent still has to re-attempt,
                                                  which is the defect above
```

There is a precedent for the engine re-entering a call it stopped. `evaluatePreTool` already returns
`{ verdict: 'downgrade', args }`, and the caller re-enters the same call with those arguments. A
`{ verdict: 'readFirst', call }` would follow the same shape — run the read, then re-admit the
original call — but the caller (`hooks.ts`) holds no agent handle, so the seam has to be threaded.

### The trap to avoid while evaluating

Declaring the missing `requiresBefore` bindings makes the forced pass fire zero times, which looks
like a saving and is not one. The two guards run in priority order and a preTool loop returns on the
first deny:

```
0 agent      requiresBefore   ← denies here
2 consent    confirmFirst     ← never reached, so no approval is issued
```

The forced pass fires on OPEN APPROVALS. An agent that skips the read is stopped before any approval
exists, so the pass has nothing to fire on: the agent that most needed the forced read is the one
that never reaches it. Whatever shape this takes, the two mechanisms must not be able to disarm each
other.


---

## Cost per governed conversation is unverified against a real workload

### What is measured

The atlas exam, `gemini-3.1-flash-lite`, 2496 conversations run between 4 and 10 August 2026, priced
at the published paid-tier rates ($0.25/M input, $0.025/M cached input, $1.50/M output):

```
per conversation (1.53 turns)   23,752 input · 224 output   R$ 0.031
per turn                        15,524 input                R$ 0.020
cache-read share of input                                        19.6%
```

The engine's own overhead is part of that: a 100-case exam is 153 turns but 183 generations — 14
redrives, 12 forced terminals, 4 forced reads — plus 291 tool calls, each a round-trip that resends
the conversation.

### What is not measured, and why it matters

**The atlas conversation is 1.53 turns.** A support desk conversation is ten or twenty. Every turn
resends the whole transcript, so per-turn input grows with the conversation while the static
assembled prefix stays put. Nobody has measured where that curve goes, and the exam cannot answer it:
its cases are too short to show the slope.

**The cache is absorbing a fifth of the input.** The assembled prompt is case-invariant by design —
the shared-prefix law exists for exactly this — yet only 19.6% of input tokens came back as
cache-read. Either the prefix is not being cached, or it is being invalidated per turn. Whichever it
is, it is the largest lever on the number above, and it is unexamined.

### The comparison that has not been made

At R$0.031 a conversation, ten thousand conversations a day is R$300/day. Whether that is cheap or
expensive is a question about the workload it replaces, not about the model — and no such comparison
exists in this tree. The figure most likely to mislead is the DEVELOPMENT one: 2496 conversations in
a week was 42 exam runs, which is a measurement habit, not a production load.
