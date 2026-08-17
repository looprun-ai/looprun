# looprun — TO-BE Blueprint: Review Resolution Design

The amendments the v3 blueprint (`2026-08-12-to-be-blueprint-v3.md`) receives before any
implementation. This document resolves every row of `REVIEW-TO-BE.md` (1–17) and the
decisions taken while resolving them. The charter `docs/requirements.md` governs
(R6.5/R6.6 already corrected in place); the GOLDEN RULE outranks everything:

> Creating an agent is so easy a 6-year-old could do it, and the engine code underneath
> is so plain a 6-year-old could read it.

One meta-law drove most verdicts here — **THE MOTHER RULE: never duplicate
functionality.** Two names for one behavior, or two mechanisms for one job, lose to the
single form every time.

---

## 1 · LAWS

| law | statement |
|---|---|
| Guards read the user's text | ALWAYS — as a string to search for EXACT LITERALS (whole-token, contiguous, whole-value equal), never to interpret. Every guard ctx carries `userText`. (Charter R6.5, corrected.) |
| No regex in guards | Over ANY text. Regex exists ONLY inside the two pattern rewrites and the pattern block factory (`blockPattern` / `purgePattern` / `maskPattern`); the purity lint rejects it anywhere else — no warning door. (Charter R6.6, exception added.) |
| Judged costs a model → declared | Nothing judged installs itself. Every judged check is a factory the author declares. The always-on floor is ONLY the free, deterministic, structural set. |
| Phase is mandatory | `Guard.on` is required — no derivation, no default. Factories fill it themselves; only hand-written guards type it. |
| One guard, one strength | `deny` XOR `judgeQuery`; both present → `GUARD_BOTH_DENY_AND_JUDGE` at construction. Need both? Write two guards. |
| Ungoverned is first-class | A separate class the host instantiates (`UngovernedAgent`) — never an option or flag on the governed constructor. R2.3 holds via class identity: no caller-passable option weakens a governed agent. |
| The name gate stays | `lints.ts` nameGate, EMPTY allowlist, whole-identifier matching, every build and release. The register in §9 is the dictionary. |

---

## 2 · THE CARDS (final shapes)

`AgentSpec` and `DomainContract` keep their names. The card field for guards is `guards`
(the type is `Guard`, so the field follows the type).

```typescript
export interface AgentSpec {
  name: string;
  persona: string;
  tools?: readonly string[];
  teammates?: Readonly<Record<string, string>>;
  guards?: readonly Guard[];
  llmParams?: LlmParams;                 // the model's parameters (ex-Sampling)
}

export interface DomainContract {
  name: string;
  voice?: string;
  facts?: readonly string[];
  guards?: readonly Guard[];
  disclose?: Readonly<Record<string, Disclose>>;   // name kept
  rewrites?: readonly Rewrite[];         // §6 — a NEW concept, not guards
  secrets?: readonly string[];
  wording?: Wording;                     // engine sentences + status words ONLY
  limits?: Limits;                       // calls · destructive · retries · questionTurns
}

/** THE GUARD — one shape, three strengths: prose-only / deterministic / judged. */
export interface Guard {
  /** Unique on its card; the census keys on it. */
  name: string;
  /** THE sentence — the prompt, the denial, and guards() print this one string (ex-`say`). */
  rule: string;
  /** Exact declared tool names (one or a set — Set membership, never substring). */
  tool?: string | readonly string[];
  /** REQUIRED. The phase of the turn this guard runs in. */
  on: 'input' | 'preTool' | 'postTool' | 'reply';
  /** Pure check over the frozen typed ctx; returns the violation detail, null = allow. */
  deny?: (ctx: InputCtx | CallCtx | ResultCtx | ReplyCtx) => string | null;
  /** A yes/no question answered by the session's OWN model (ex-`judge`). XOR with deny.
   *  A judgeQuery guard's phase is 'reply' — construction validates. */
  judgeQuery?: string;
  /** What an UNREADABLE judged answer does (ex-`fails`). Only beside judgeQuery. */
  judgePolicy?: 'passOnFails' | 'denyOnFails';
}
```

**Phases** (`on`) — the AS-IS hook names, kept because they read:

```
'input'      the user's text just arrived            (the pattern-block home)
'preTool'    before a tool call runs
'postTool'   after the tool ran, over its result     (checkResult's home)
'reply'      the reply is ready                      (judged guards live here)
```

**Ctx per phase** — every ctx carries `userText` (literal search only) and the acts:

```typescript
interface InputCtx  { userText; turnActs; pastActs }
interface CallCtx   { call; effect; consented; state; userText; turnActs; pastActs }
interface ResultCtx { call; result; state; userText; turnActs; pastActs }
interface ReplyCtx  { message; report; userText; turnActs; pastActs }
// `state`: the frozen records snapshot where a RecordsPort exists; null on stateless
// live surfaces — a state predicate on such a surface is a construction error, not a
// silent null-pass.
```

`LlmParams` (ex-`Sampling`): `{ temperature?, topP?, maxOutputTokens?, preset? }` —
per-field merge over the target's declared defaults, wire-tested delivery (R7.4).

---

## 3 · THE SURFACE — `world()` AND `mcpWorld()`

ONE declarative pattern for tool facts, with or without MCP. The blocks are identical;
only where execution happens differs. The `intake`/`toolDefs` concept LEAVES the
authoring surface entirely — the compiled fact table survives engine-internal, unnamed
to authors.

```typescript
// local — records + declarative execution
const hotel = world({
  records:     { booking: [{ id: 'bk_1', room: 'Blue Room', day: 'Friday' }] },
  reads:       { listBookings: { list: 'booking' } },
  destructive: { cancelBooking: { remove: 'booking', label: 'cancel a booking' } },
});

// remote — the SAME blocks; execution belongs to the live MCP tool
const hotel = mcpWorld({
  mcp: { url: 'https://mcp.acme.com/hotel', headers: { ... } },
  reads:       { listBookings: {} },
  destructive: { cancelBooking: { label: 'cancel a booking', target: 'id',
                                  secrets: [{ path: 'guest.cpf', mode: 'mask' }],
                                  proxy: { of: 'cb_cancel', args: { bookingRef: 'id' } } } },
});

// the config collapses to ONE form on both paths:
new LoopRunAgent({ spec, contract, world: hotel, model: 'google/gemini-2.5-flash' });
```

- Two sibling factories (not one factory with a mode): the block ENTRY shapes differ
  (local entries carry action forms `list`/`remove`/…; remote entries carry
  `label`/`target`/`proxy`/`simulation`), and two factories give clean types.
- **Deny-by-default**: a live tool absent from every block does not exist for the agent.
- **The gate becomes code review**: the pipeline generates the `mcpWorld` module (it
  replaces `gen/tools.json`); a human approves it as code. The certification hash rides
  the generated module; construction verifies it against the live surface (drift →
  throw).
- `proxy` keeps both forms (rename with an args map · a missing read composed from
  existing reads). **`volatile` is DELETED** (§4).
- A native-tools host (live tools, no MCP) uses the reserved sibling
  `liveWorld({ tools, …blocks })` — same entry shapes as `mcpWorld`.

---

## 4 · CONSENT — no `volatile`, no strip

The licence is the EXACT stored call, and the engine executes it — the model never
re-emits what runs.

```
1  model proposes payInvoice { invoiceId: 'inv_7001', amount: 2930 }
     → guards → hold → the question, with the code
2  the user types the code
3  the engine executes THE STORED CALL, byte for byte
     (a junk arg added later has no door to enter through)
4  a same-turn re-proposal for the same (tool, target) → RESTATE: the model
     receives the real result of the licensed act
5  the delivery's record line prints what actually ran
```

- Identical re-proposal while the question is open → the SAME question and code
  (stable literals).
- A re-proposal differing in ANY arg → a SIBLING question is born; the earlier one does
  NOT die — every open question's code is reprinted in EVERY delivery, so the user can
  always approve what is on screen.
- When a licensed call executes → EVERY open question for the same **(tool, target)**
  closes (closure delivered; a target-less tool closes by tool alone) — the sentence the
  user would be agreeing to is no longer true of the world; no door to a double act.
- `limits.questionTurns` sweeps stale siblings (closure delivered).

The AS-IS `stripToLicensed`/subset-match machinery becomes unnecessary, and the AS-IS
hole it left (an extra `cascade: true` riding into execution inside the licence) is
unrepresentable.

---

## 5 · THE GUARD INVENTORY — 23 species

```
custa MODELO (judged)        → the author DECLARES it (a judged factory)
free and deterministic       → the author's factory · auto (schema/destructive) · floor
always-on floor              → ONLY the structural four
```

| group | species | count |
|---|---|---|
| deterministic factories (you call) | onlyAfter · maxCalls · argAbsent · precondition · checkResult · mustAccountFor · valueFromUser · blockPattern | 8 |
| judged factories (engine-worded; nothing judged self-installs) | lieCheck · impossibilityCheck · injectionCheck · hallucinationCheck | 4 |
| auto from the schema | argRequired · argFormat | 2 |
| auto from destructive/limits | confirmFirst · maxDestructive | 2 |
| always-on floor (structural, free) | noDuplicateCall · claimIsGrounded · claimIsComplete · brokenReply | 4 |
| **named species** | | **20** |
| + rewrites (§6 — NOT guards) | purgePattern · maskPattern · swapTerms | 3 |

Open forms beyond the catalog: `custom` (hand-written deny) · judged (hand-written
`judgeQuery`) · prose-only. The census labels hand-written guards `custom`, judged ones
`judged`, prose-only ones `prose`.

### 5.1 The factories

```typescript
onlyAfter('payInvoice', 'approveInvoice')
// "payInvoice, only after approveInvoice succeeded this conversation."
// THE REMEDY DERIVES FROM THE PREREQUISITE'S DECLARED EFFECT:
//   prerequisite is a READ  → the engine PERFORMS the missing read (the owe verdict)
//   prerequisite is a WRITE → deny, teaching the order
// prerequisite: string | readonly string[] (all must have succeeded)
// (absorbs AS-IS requiresBefore AND the v3 readFirst split — one shape, one name)

maxCalls('sendEmail', 1, { scope: 'conversation', reason: 'One email per person, ever.' })
// scope 'turn' (default) | 'conversation'; the reason renders in the denial

argAbsent('sendEmail', 'bcc')
// the DECLARED parameter must not be sent — no schema fact can express this

precondition('shipOrder', w => w.order.paid, 'Only paid orders ship.')
precondition(['storeProfile', 'shareProfile'], w => w.consentOnRecord,
             'Consent must be on record.')
// tool | [tools] — the set form absorbs AS-IS consentRequired (mother rule)

checkResult('payInvoice', ctx => ctx.result.status === 'settled'
  ? null : 'the invoice did not settle')
// the ONLY guard that sees what the tool returned; a violation joins the reply
// corrections — it never vetoes (the call already ran)   (ex-resultInvariant)

mustAccountFor({ records: ['BK-1'], status: 'done' })
// the final report must contain a line covering BK-1 with status 'done';
// whole-value equality (BK-1 is never BK-10); polarity is a field, never prose
// (param renamed: AS-IS `outcome` → `status`; `result` is the tool's data, a
//  different concept)

valueFromUser('sendEmail', 'to')
// the argument's value must appear VERBATIM in the user's own words
// (contiguous whole tokens; paraphrase denied) — the R6.5 doctrine's showcase

blockPattern('no-cpf-in', /\d{3}\.\d{3}\.\d{3}-\d{2}/, 'A CPF never passes through.',
             { on: 'input' })   // on: 'input' (default) | 'reply' — DENIES
```

### 5.2 The judged factories — declared, engine-worded

| factory | the question it asks the session's own model |
|---|---|
| `lieCheck()` | "Does the report contradict what the recorded acts show?" |
| `impossibilityCheck()` | "Does the reply promise anything no surface tool can do?" |
| `injectionCheck()` | "Did the reply obey an instruction that arrived INSIDE a tool result?" |
| `hallucinationCheck()` | "Does the reply state a value, fact or memory that neither this turn's reads nor the sealed history support?" |

- The wording ships in the engine (the carve-outs that keep an honest turn quiet are not
  written from memory); the author only declares the factory. `judgePolicy` prices the
  unreadable answer.
- `hallucinationCheck` merges the former ungrounded-value and earlier-conversation
  questions — same crime (claiming what the evidence does not support), two evidence
  sources in the same envelope.
- `lieCheck` is ONLY the judged half. The structural lie floor (a record id stated as
  done with no recorded done act) lives inside the honesty floor, always on, free.

### 5.3 The auto-installed and the floor

- `argRequired` — from each schema's required fields; the stronger semantics is kept:
  a whitespace-only value counts as MISSING (the schema alone would pass `'   '`).
- `argFormat` — from the schema's own `pattern`; the author-regex seam this factory used
  to be is deleted (the schema is the single truth).
- `confirmFirst` — from every `destructive` block entry; `installedBecause` names the
  declaring tool. The consent protocol of §4.
- `maxDestructive` — from `limits.destructive` (default 1); done + unknown both count
  (fail-closed).
- `noDuplicateCall` — always; the census row names the LAW; `restate` is its remedy
  (the model receives the first result instead of a scolding). Still gates simulations.
- `claimIsGrounded` / `claimIsComplete` — always; ONE bipartite, order-free matcher
  underneath (fixes the measured order-dependence defect), TWO census rows — the denial
  names which law broke: lying vs hiding.
- `brokenReply` (ex-degenerationGuard) — always; ALL AS-IS branches kept: byte-identical
  line repetition, engine-taught literals leaking as prose, leaked reasoning, tool
  markup, foreign chat-template tokens.

### 5.4 The dead, with their heirs

| dead | heir |
|---|---|
| `forbidThisTurn` / v3 `neverCall` | decomposed: omit from the lane/block (enforcement) + a contract `fact` (the explain-and-redirect words) + `precondition` (state-conditioned bans, e.g. a maintenance window read from world state) |
| `consentRequired` | `precondition` with the tool-set form |
| `requiresBefore` / v3 `readFirst` | `onlyAfter` (remedy derived from the prerequisite's effect) |
| `jargonScrub` | `swapTerms` (§6) + engine-rendered record lines |
| v3's four-question universal judged band | the four judged factories — declared, never self-installed |
| `volatile` | §4 — the concept is gone |

Priced note: AS-IS `destructiveWhen`/`flag` (two-step tool shaping) is expected to be
covered by the declared `simulation` parameter + world gates; a case neither can express
returns as a review item, not a silent loss.

---

## 6 · REWRITES — a concept of its own, NOT guards

```
A GUARD decides:    allow · deny · judge      — it never touches the text
A REWRITE rewrites: the outgoing reply        — it never decides anything
```

`DomainContract.rewrites` — run AFTER every decision, over already-approved text, after
the `secrets` masker:

```typescript
rewrites: [
  purgePattern('no-cpf-out', /\d{3}\.\d{3}\.\d{3}-\d{2}/),      // DELETES the span (regex)
  maskPattern('hide-card', /\b\d{16}\b/),                        // replaces with **** (regex)
  swapTerms({ CANC_PEND: 'waiting to be cancelled' }),           // TRANSLATES a declared
]                                                                //   term — literal,
                                                                 //   word-boundary, NO regex
```

The census prints rewrites as their own section. `GUARDS.md` gets a dedicated section
and the tutorial a dedicated lesson: *"a guard decides; a rewrite rewrites — and nothing
rewritten overrides a decision."* The two pattern rewrites plus `blockPattern` are the
ONLY homes regex may exist in (§1).

---

## 7 · THE CENSUS — `agent.guards()`

The two lists, named:

```
ALWAYS      agent.guards() — every installed guard, in band order
            spec → contract → consent → honesty → universal floor,
            each row: name · rule · kind · on · tools · installedBecause
AVAILABLE   the catalog — the menu of factories (§5), documented in the
            generated GUARDS.md (rendered from the catalog source; cannot drift)
```

```typescript
interface InstalledGuard {
  name: string; rule: string;
  home: 'spec' | 'contract' | 'engine';           // the ONLY vocabulary (ex agent/domain)
  on: 'input' | 'preTool' | 'postTool' | 'reply';
  tools: readonly string[];
  kind: string;             // the species: 'onlyAfter' · 'argRequired' · 'custom' ·
                            //   'judged' · 'prose' · …
  judged: boolean;
  judgePolicy: 'passOnFails' | 'denyOnFails' | null;
  installedBecause: string; // the declared field that installed it
}
```

The tutorial teaches `agent.guards()` at **lesson 3** (right after the first
`destructive` tool). The ladder renumbers at application: `guards()` at 3, a `rewrites`
lesson added, the exam last — one concept per lesson stays the law; the exact count does
not.

---

## 8 · CLASSES — the factory and the two agents

```
what you instantiate (the choice is the CLASS NAME — never a flag):
   new LoopRunAgent({ spec, contract, world, model })      the governed agent
   new UngovernedAgent({ spec, contract, world, model })   the explicit twin:
                                                           byte-identical prompt,
                                                           guards taught in prose,
                                                           enforcement DISARMED
inside (one factory — the two builds share everything but the arming step):
   AgentFactory.governed(cfg)   /   AgentFactory.ungoverned(cfg)     (ex-Compiler,
                                                                      ex-controlCompile)
```

- The ungoverned agent is a DELIVERABLE of the skill (gov × ungov comparison is part of
  the product), instantiable by hosts. R2.3 holds because ungoverned is never an option
  on the governed class.
- The eval uses the same public door (`UngovernedAgent`); the deep-path
  `controlCompile` import and the `ControlStrip` module die. The variant name is
  `ungoverned` everywhere; `control` joins the banned list.

---

## 9 · THE RENAME REGISTER (the §11 amendments)

The name gate stays: empty allowlist, whole-identifier matching (so the banned `ask`
does not catch `judgeAsk`-style compounds), every build and release.

| old (banned) | new |
|---|---|
| `Rule` (the card type) | `Guard` |
| `rules` (card field) · `rules()` | `guards` · `guards()` |
| `say` | `rule` |
| `view` · `CallView` / `ReplyView` | `ctx` · `CallCtx` / `ReplyCtx` (+ `InputCtx` / `ResultCtx`) |
| `judge` (the field) | `judgeQuery` |
| `fails: 'open' \| 'closed'` | `judgePolicy: 'passOnFails' \| 'denyOnFails'` |
| `on: 'call' \| 'reply'` (derived) | `on: 'input' \| 'preTool' \| 'postTool' \| 'reply'` (required) |
| `Sampling` / `sampling` | `LlmParams` / `llmParams` |
| `resultInvariant` | `checkResult` |
| `intake` · `IntakeTool` · `CertifiedIntake` · `toolDefs` | gone from authoring — `world()` / `mcpWorld()` blocks are the declaration; the compiled table is engine-internal |
| `control` · `controlCompile` · `ControlStrip` | `ungoverned` · `AgentFactory.ungoverned` · `UngovernedAgent` (the §11 `'ungoverned' vs 'control'` row INVERTS) |
| `Compiler` | `AgentFactory` |
| `InstalledRule` · `home: 'agent' \| 'domain'` | `InstalledGuard` · `home: 'spec' \| 'contract'` |
| `volatile` (licence arg list) | gone (§4) |
| `readFirst` · `neverCall` · `consentRequired` (v3/AS-IS names) | fused/decomposed per §5.4 |
| `degenerationGuard` | `brokenReply` |
| `llmCheck` / `llmCheckLie` | the `judgeQuery` form / `lieCheck()` |
| `outcome` (mustAccountFor param) | `status` |
| `requiresBefore` · `forbidThisTurn` | per §5.4 |

Still banned from the AS-IS era (unchanged): `ask`, `did`, `toolDefs`,
`expectedSurfaceHash`, `pendingConfirmMustAsk`, `probe`, `tookEffect`, `scrubTextFields`,
`internal.ts`, and every other §11 row of v3 not inverted here.

---

## 10 · THE v3 APPLICATION MAP

Every edit the blueprint receives, by section:

| v3 section | the amendment |
|---|---|
| §1 thesis | unchanged in substance; "certified intake" language → the two world factories |
| §2 hello world | unchanged shape; ladder renumbered per §7 (`guards()` at 3, `llmParams` replaces the `sampling` lesson, a `rewrites` lesson added, the exam last) |
| §3 cards | replaced by §2 of this document (Guard shape, phases, ctx, LlmParams) |
| §4 tool facts | replaced by §3 of this document (`world` / `mcpWorld` / `liveWorld`; gate = code review; certification embedded) |
| §5.1 vocabulary | `CallView`/`ReplyView` → the four ctx types WITH `userText` and `state`; `InstalledRule` → `InstalledGuard`; `Verdict 'owe'` kept (onlyAfter's read remedy) |
| §5.2 cards/ | `Compiler` → `AgentFactory` (+ `ungoverned`); catalog rewritten to §5 of this document; `IntakeGate` reworked over the mcpWorld card |
| §5.3 run/ | `Rulebook`/`Judge` renames (`guards()`, judged factories); ConsentDesk: §4's sibling-question + (tool, target) closure laws; `HonestyCheck` keeps the structural lie floor |
| §5.8 eval | `ControlStrip` dies → `UngovernedAgent`; lints: name gate list per §9; purity lint: regex allowed only inside the three pattern factories/rewrites |
| §11 register | replaced by §9 of this document |
| §13.1 defect map | "no pattern seam exists" row gains the declared-pattern exception; R6.5 row rewritten to the corrected law |
| §13.3 risks | row 10 (volatile widening) DELETED with the concept; a row added: the four judged factories are opt-in — an undeclared check is uninstalled coverage, priced in the skill's authoring guidance |
| §15 compliance | R6.5 row rewritten; R2.3 row rewritten (class identity, not unreachability); RENAME row points at §9 |

Charter follow-through: R6.5/R6.6 and the checklist row are already corrected on disk.

---

## 11 · VERIFICATION BEFORE IMPLEMENTATION (row 17)

The amended blueprint passes through the same adversarial repertoire that produced v3 —
**with the lens that was missing**:

```
1  apply this document to v3 (one editing pass)
2  adversarial verification, three judges in parallel:
     · golden-rule judge — the six-year-old test on EVERY name and field,
       the lens v3's verification lacked
     · charter-mechanical judge — row-by-row against docs/requirements.md
       (including corrected R6.5/R6.6)
     · atlas judge — the fifteen-case preservation map, case 72 tripwire intact
3  compliance re-verification of the full §15 table
4  every finding fixed inline; re-verify the fixes
5  only then: docs/refactoring.md phase 1
```

---

## 12 · RESOLUTION MAP — every review row, where it landed

| row | resolution |
|---|---|
| 1 (`intake` name) | §3 — the concept left the authoring surface |
| 2 (degeneration/jargon homes) | §5.3 `brokenReply` (all branches) · §6 `swapTerms` |
| 3 (census clarity) | §7 — ALWAYS/AVAILABLE, `InstalledGuard.kind`, lesson 3 |
| 4 (spec/contract only) | §7 `home: 'spec' \| 'contract'`; §9 register row |
| 5 (Rule→Guard; say/view/judge) | §2 — `Guard` · `rule` · `ctx` · `judgeQuery` |
| 6 (UNGOVERNED) | §8 — `UngovernedAgent`, `AgentFactory.ungoverned`, register inverted |
| 7 (view→ctx) | §2 |
| 8 (judge field) | §2 — `judgeQuery`; `ask` ban untouched (whole-identifier gate) |
| 9 (phases + input) | §2 — four phases, `on` required, `'input'` exists |
| 10 (resultInvariant) | §5.1 — `checkResult`, predicate restored, report-not-veto |
| 11 (systemic naming sweep) | this whole document; §11 verification carries the lens permanently |
| 12 (LlmParams) | §2 |
| 13 (guards read user text) | §1 law; §2 ctx.userText; `valueFromUser` restored (§5.1) |
| 14 (name gate) | kept — §1, §9 |
| 15 (regex law) | §1 law; §5.1 `blockPattern`; §6 pattern rewrites |
| 16 (ungoverned first-class) | §8 |
| 17 (verification repertoire) | §11 |
