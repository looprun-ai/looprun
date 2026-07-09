# Guard catalog — the AgentSpec kind vocabulary (bundled, self-contained)

The vocabulary a drafter picks from in **Stage E2 (ENGINEER: draft)**. Every rule is authored as a **prose+check pair**:
one LLM-facing conditioned sentence (rendered into the prompt, **never read by any check**) and one
deterministic `check(ctx): string | null` (a string = deny + correction; `null` = allow). Pick a
**kind** below; reach for `custom()` only when no kind fits.

> This file is the portable copy that ships with the skill. The authoritative source of truth is
> the **@looprun/core guards** (the package source: the guard factory implementations + the
> `Guard`/`GuardCtx` types); a parity check in the looprun repo fails if this list diverges.

## The five hooks

| hook | fires | a deny does |
|---|---|---|
| `onInput` | before the first model call, on the raw turn | terminal refusal (no LLM call) |
| `preTool` | before a tool executes | blocks the call, feeds the correction back |
| `postTool` | after a tool returns, before the result is shown | rewrites/blocks on the result |
| `onReply` | on a terminal `replyToUser`/`askUser` | re-drives the model with the correction |
| `onReplyMutate` | on the terminal reply text | deterministic egress rewrite (not a gate) |

**The S-1 firewall (non-negotiable):** `GuardCtx` carries **no user text** — args, tool, world
projection, observed calls, turn index, reply text, produced/attachment labels, result, notes. A
check may read ONLY these. This is what makes the guard layer model-independent.

## Class hierarchy — what auto-installs (zero app knowledge)

Resolution order per hook: **agent → full → base → minimal** (first deny wins).

| layer | auto-installs | from |
|---|---|---|
| `AgentSpecMinimal` | `noDuplicateCall`, `emptyReply` | nothing (always safe) |
| `AgentSpecBase` (adds) | `confirmFirst`, `destructiveThrottle` | `cfg.destructiveTools` (no-op if empty) |
| `AgentSpecFull` (adds) | `argRequired` (per `schema.required[]`), `argFormat` (per `properties[].pattern`) | `cfg.toolSchemas` |

So **6 kinds install for free**; every other kind is **agent-layer** (you add it explicitly). Choose
the lowest layer that covers the tools: Minimal for a read-only/reply agent, Base once it holds a
destructive tool, Full when schemas carry required fields / patterns worth enforcing.

## The 26 guard kinds

### preTool — ordering / preconditions / call-shape (dims: spatial · run · input)

| kind | dim | auto | one-line semantics |
|---|---|---|---|
| `requiresBefore(deps)` | spatial | agent | this tool may run only after every `deps` tool ran this conversation |
| `forbidThisTurn(reason)` | spatial | agent | this tool may not run again this turn |
| `precondition(ok, reason, prose?)` | run | agent | deny unless `ok(world)` holds (the general world-state gate) |
| `maxCallsPerTurn(tool, n, reason)` | run | agent | at most `n` calls of `tool` per turn |
| `maxCallsPerConversation(tool, n, reason)` | run | agent | at most `n` ok-calls of `tool` across the whole conversation |
| `noDuplicateCall()` | run | **Minimal** | block a byte-identical repeat call (canonicalized args) |
| `confirmFirst(argFlag='confirmed')` | run | **Base** | a destructive tool needs `confirmed:true`; a `confirmed:false` PROBE is allowed |
| `destructiveThrottle(destructiveTools)` | run | **Base** | at most one destructive action per turn |
| `argRequired(field)` | input | **Full** | deny if `field` is missing/empty in args |
| `argAbsent(field)` | input | agent | deny if `field` IS present (mutually-exclusive args) |
| `argFormat(field, pattern, flags?, reason?)` | input | **Full** | deny if `args[field]` fails the regex (malformed pattern → skipped, never crashes) |
| `labelExists(field)` | input | agent | deny if the referenced label isn't in the world's known set |
| `labelProvenance(field, 'uploaded'\|'generated', reason?)` | input | agent | deny if the label's provenance (upload range vs generated) mismatches |

**Worked example — tool sequencing (spatial).** To enforce an ordered flow
`createPost → saveContent → generateImage`, add one `requiresBefore` gate per downstream tool naming
its predecessors (there is no single "chain" primitive — that's the one-gate-per-tool model;
`requiresBefore` takes a `string[]`):

```ts
spec.addGuard('preTool', ['saveContent'],   requiresBefore(['createPost']));
spec.addGuard('preTool', ['generateImage'], requiresBefore(['createPost', 'saveContent']));
// out-of-order call → deny: "Do createPost then saveContent FIRST — it must run before this tool."
// prompt prose (rendered):  "only after createPost → saveContent has run"
```

`replyToUser`/`askUser` are terminal (runner-owned, the turn ends there) — you never gate them; the
sequence is enforced on the tools **before** the reply.

### postTool — on the tool result (dim: output)

| kind | dim | auto | one-line semantics |
|---|---|---|---|
| `resultInvariant(pred, reason)` | output | agent | deny if `pred(result, world)` is false (the first/only postTool occupant) |

### onReply — reply honesty / shape / coverage (dim: behavior)

| kind | dim | auto | one-line semantics |
|---|---|---|---|
| `emptyReply()` | behavior | **Minimal** | a terminal reply may not be empty/whitespace |
| `noFabricatedSuccess(tool, {claimRe, reason})` | behavior | agent | reply may not claim `tool` succeeded unless it actually ran+succeeded this turn |
| `noFalseFailureClaim()` | behavior | agent | reply may not explain a tool FAILURE when no tool failed this turn |
| `destructiveClaimRequiresSuccess(destructiveTools, claimRe?, exemptRe?)` | behavior | agent | reply may not claim a destructive action happened unless a confirmed call succeeded — **exempts confirm-probes and honest failures** (see below) |
| `pendingConfirmMustAsk()` | behavior | agent | if a tool returned `requiresConfirmation`, the reply MUST ask for confirmation |
| `replyMustMention(keywords, reason)` | behavior | agent | reply must mention every keyword (coverage) |
| `replyConfirmsLabels(labels, reason)` | behavior | agent | reply must confirm each acted-on label |
| `replyMaxOccurrences(ctas, n, reason)` | behavior | agent | at most `n` occurrences of a CTA phrase (anti-nag) |
| `replySingleQuestion(reason)` | behavior | agent | at most one question per reply (recovery turns) |
| `replyNoProductionClaim(claimRe, reason)` | behavior | agent | reply may not claim it produced media when none was produced |

> There is deliberately **NO LLM reply-check kind** in @looprun/core — an impure in-guard judge
> forfeits the determinism certificate. A rule no deterministic check can express is
> language-layer: conditioned prose + an eval dimension. Any future reply-rubric must be
> pre-baked and trusted, never derived from user text (prompt-injection law).

### any hook

| kind | dim | auto | one-line semantics |
|---|---|---|---|
| `custom({...})` | any | agent | escape hatch — a hand-written `check`+`prose`; reviewers read the code. Use ONLY when no kind fits |

### The mutator (not a gate)

| factory | hook | semantics |
|---|---|---|
| `jargonScrub(map)` | `onReplyMutate` | deterministic egress rewrite of internal jargon → user words. In every shipping spec |

### Controls (not guards) — on the spec's `controls`

`maxSteps` (default 16) · `redrives` (default 1 — bounded onReply re-drives before the exhaustion
terminal) · `terminal` (the exhaustion reply policy) · `directives` (positive forcing prose rendered
each turn). Termination is bounded by `maxSteps + 2 + redrives`.

## When / how much to guard (the usage math, distilled)

Full treatment: the determinism proof in the lineage (see CONTEXT.md). The operational
distillation:

1. **The two-layer law.** An agent turn splits into an **action layer** (which tools run, in what
   order, with what args, gated on world state) and a **language layer** (the wording of the reply).
   The action layer is a **decidable function of the guard-observable surface** → determinize it with
   guards (this is what the determinism theorems certify: guard-layer determinism, per-call
   safety+termination, replay determinism, model-independence exactly on the guarded subset). The
   language layer is **not** request-independently decidable (the proved lemma: a check that cannot
   read the user's text cannot enforce request-dependent wording for every model) → leave it to
   conditioned prose + the eval, never to a brittle reply-regex.

2. **Guard the decidable frontier, and only it.** For each requirement, ask: *is it a computable
   predicate over (args, tool, world, observed, result)?* If yes → it gets exactly **one** gate on
   its natural hook (order → `requiresBefore`/`forbidThisTurn`; precondition/quota → `precondition`;
   call-shape → `argRequired`/`argFormat`/`argAbsent`; destructive protocol → `confirmFirst` +
   `destructiveThrottle`; result shape → `resultInvariant`; reply honesty keyed on
   existence/success → the `noFabricated*`/`destructiveClaim*`/`pendingConfirm*` family). If no
   observable predicate expresses it → it is language-layer: write conditioned prose + an eval
   dimension so the miss is at least measured.

3. **Minimal set, not maximal.** More guards ≠ safer. Each gate must key on an **observable
   discriminator**; a guard that can't tell "did this turn" from "already existed" (a claim-regex
   without a state key) is worse than none — it blocks honest replies (the measured #1 fail). Encode
   each decidable requirement **once**, at the right hook, on the right key. Prefer the shared kinds
   over ad-hoc `custom` claim-regexes (the shared ones carry the exemptions below).

4. **The exemptions that keep honest replies alive** (baked into the shared kinds; replicate them if
   you must go `custom`):
   - **Confirm-probe:** a two-step destructive tool run with `confirmed:false` is a legal PROBE. Any
     "claims X happened" reply-gate must exempt a reply that seeks confirmation — a `?` OR
     confirm-phrasing (`confirm / are you sure / please confirm / tem certeza / deseja / quer /
     gostaria / posso prosseguir / autoriz…`).
   - **Honest failure/negation:** exempt failure-phrasing (`already / cannot / not / could not /
     não / já`) BEFORE the affirmative claim regex — a truthful `"não gerei"` / "cannot void a paid
     invoice" must pass. This is the `exemptRe?` param on `destructiveClaimRequiresSuccess`.

5. **Act directly; don't over-gate.** The requested non-destructive action (book, generate, record)
   is the goal — only genuinely destructive tools (cancel/pay/delete/submit) get `confirmFirst`. A
   `precondition`/`confirmFirst` that blocks a REQUIRED single-turn call fails the eval; the eval is
   the arbiter, not the owner's stated ideal. Keep an end-to-end flow's tools in ONE agent so a gate
   isn't split across agents.

6. **STOP at the bar.** Guards are deterministic and composable; prose is non-local. Once the judged
   aggregate clears the bar, stop adding reply prose — past the bar the marginal case is almost always
   language-layer, and tuning it trades one fail for a sibling (measured net-negative). Re-measure the
   FULL bucket after any reply-prose edit; revert if it doesn't net-improve.
