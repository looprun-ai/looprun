# The Front Desk and the Chat Door — Design

**Status: OPEN** — design approved in session; implementation not started.

A multi-desk subject becomes ONE addressable agent. A lean, neutral front desk reads every
operator message and names the desk that will handle it — on intention, never on words — and a
terminal chat door lets a person talk to the routed house by hand. The front desk only exists
when the declaration carries two or more desks; a single-desk subject composes exactly as it
does today.

```
                     ┌──────────────────────────────────────────────┐
 operator ──────────►│ RoutedAgent (exists only with 2+ desks)      │
                     │                                              │
                     │  FRONT DESK (core)                           │
                     │  window: handles lines + current desk        │
                     │          + last exchange + new message       │
                     │  one forced call: route({desk|none})         │
                     │    │                                         │
                     │    ├─ none ─► front refusal, no desk touched │
                     │    └─ desk ─► governed turn on that desk     │
                     │                 │ notMine door (first call   │
                     │                 │ only; one return per msg)  │
                     │                 └─► re-route with the reason │
                     └──────────────────────────────────────────────┘
   core: route types + window composition + decision validation (pure)
 mastra: RoutedAgent — executes the route call over MastraModelPort
server: mounts the routed agent as ONE wire model id + the chat REPL
```

---

## 1 · The measurement that shaped this design

Three probes against the subject model (`google/gemini-3.1-flash-lite`, temperature 0,
thinking off, forced tool choice — the engine's own defaults), all rows two repetitions,
**zero flaps across 152 calls**. The scripts and result JSONL ran in-session (scratchpad);
the tables below carry every verdict verbatim, and §3 carries the measured window verbatim,
so the probes reproduce from this page alone.

### 1.1 Stratified single-message probe — 14 messages, 5 families

Mechanism A = the message lands on a default desk whose prompt carries a hand-off door.
Mechanism B = a dedicated router names the desk before any desk sees the message.
Desk lines: the declaration's own `teammates` one-liners.

| family | example | expected | A | B |
|---|---|---|---|---|
| clear ×6 | "Has invoice inv_204 been paid?" | one desk each | 5/6 | 5/6 |
| vague ×2 | "the Hendersons called about the thing…" | judged | both guessed, differently | — |
| no desk ×2 | "What's the weather at the yard Saturday?" | none | 1/2 | 1/2 |
| two could ×2 | "Put a hold on the Jenkins account." | claims; second row judged defensible | 2/2 | 2/2 |
| sequence ×2 | "Cancel booking bk_31 **and refund** the deposit." | the FIRST desk | 1/2 | 2/2 |

Both mechanisms missed the SAME two rows (a technician-schedule question routed to the
roster; a weather question routed to the yard), and all three misses flipped green — 2/2,
both mechanisms — under three wording amendments alone (§2, §3). **The desk lines decide the
accuracy; the mechanism does not.** The one reasoning miss was A's own: at the rentals desk,
"cancel and refund" went to billing when the cancel is rentals' own first step.

### 1.2 Sequence probe — 4 conversations, opening to solution, 16 turns

Both mechanisms saw the same scripted transcript; the trajectory follows the expected path so
every decision is measured on the same ground.

| conversation | turns | A (lane door) | B (router per message) |
|---|---|---|---|
| single-desk booking | 4 | 3/4 — "what would that **cost**?" handed to billing, which bounced it back | 4/4 |
| drift to billing | 4 | 4/4 | 4/4 |
| incident across three desks | 5 | 4/5 | 4/5 (same shared miss) |
| outside-world interruption | 3 | 3/3 | 3/3 |
| **total** | 16 | **14/16** | **15/16** |

Every B miss is also an A miss — **B's errors are a strict subset of A's** — and A's extra
miss is the lane reading through its own persona ("cost" pulled billing) at the price of two
wasted full-prompt desk arrivals. The bounce data shows a receiving desk judges a misdelivery
correctly in one hop.

### 1.3 History-window probe — the router's window, three modes, same 16 turns

| window | score | input tokens | growth |
|---|---|---|---|
| full transcript | 15/16 | 312 → 474 | linear, ~+40/turn, no ceiling |
| **tail-1** (last exchange only) | **16/16** | 312 → 377 | **constant** |
| none (current-desk line only) | 14/16 | 312 → 346 | constant, loses accuracy |

The router's question is local — does the new message continue the current desk's work or
move? — and the last exchange is exactly that question's context. Older history only adds
inertia pull (the full-window miss kept a claim resolution at billing); no history at all
lets the word-lure back in (the weather question went to the yard). Tail-1 lost nothing
anywhere and costs the same at turn 4 as at turn 400.

### 1.4 The laws the probes bought

| law | evidence row |
|---|---|
| Routing accuracy lives in the desk lines, not the mechanism | the two shared misses, flipped by wording alone |
| A neutral seat outroutes the lane's own lens | B ⊇ A on every judged row of both probes |
| One exchange of history beats the whole transcript, at constant cost | 16/16 vs 15/16 vs 14/16 |
| An enum-forced call cannot name a desk that does not exist | 152/152 well-formed decisions |
| A misroute costs latency, never a wrong act | the receiving desk's closed surface and card guards stand as they always do |

### 1.5 What a routing decision costs

One router call is 310–380 input tokens, constant. One desk CALL is ~4,840 tokens (measured,
rep3: 2,884,352 input ÷ 596 calls), and one desk TURN is ~18,900 (~3.9 calls through the
governed loop). **The router prices at ~2% of a desk turn; a single misrouted desk arrival
costs 13–50× the router call that prevents it.**

---

## 2 · The declaration: one new field

Each desk gains `handles` — the one-line answer to "what does this desk perform?", read only
by the front desk:

```yaml
desks:
  - name: fieldops
    handles: 'the yard: job schedules, technician assignments, hand-overs and returns'
    persona: >- ...
```

**Validation (emit, against-surface style):** two or more desks ⇒ every desk carries
`handles`; a declaration with one desk composes no router and the field is refused as
unreachable words. The emitter writes `handles` into the emitted subject artifacts, so a
loader composes the routed house from the subject door alone — no per-subject wiring exists
anywhere. The `teammates` maps stay untouched — they serve the desk's own conduct;
folding the two is registered out of scope (§11).

**The line law** (taught by the skill, §10): a `handles` line names the ACTS the desk
performs, never just its nouns. The measured pair:

| | line | "Which technician is on the Henderson job tomorrow?" |
|---|---|---|
| fails | `the yard: technicians, hand-overs and returns` | routed to the roster |
| holds | `the yard: job schedules, technician assignments, hand-overs and returns` | routed to the yard, 2/2 |

## 3 · The route step (core)

A pure unit — `front-desk.ts` beside the engine's other desks — composes the window and
validates the decision; it holds no I/O. The window, verbatim as measured (16/16):

```
You are the front desk at {contract.name}. Your only job is to read the
conversation and route the operator's NEW message (the last one) to the desk
that will handle it. Route on what the operator intends, never on the words
they used.

Desks:
- {name}: {handles}          ← one line per declared desk

{opening: "The conversation is just opening."
 else:    "The conversation so far sits at the {currentDesk} desk. A message
           continuing that desk's work stays there; a message whose intent
           belongs elsewhere moves."}
{when returned: "{desk} returned this message: {reason}"}
When more than one desk could serve, pick the most likely. When the task takes
several desks in sequence, pick the desk that acts first. When no desk's
surface performs what is asked — anything outside the house's own records and
operations — the answer is none, however close a desk's territory sounds.
```

Messages: the last exchange of the conversation ledger (one user text + one delivered reply),
then the new message. Nothing else — no personas, no cards, no acts, no records.

The call: one forced single-tool step through the ModelPort — the same mechanism as the
forced finish and the owe micro-step — with
`route: { desk: enum[...declared desk names, 'none'] }`. A desk outside the declaration is
unrepresentable. Temperature 0; thinking off is the engine default and the router declares no
preset.

The decision is typed and rides the record: `TurnRecord.routing = { desk: string | null,
returned: null | { by: string, reason: string } }` — `desk: null` is the none-refusal, and
`returned` names the desk that sent the message back and the reason it gave.

## 4 · The routed conversation (mastra)

**`RoutedAgent`** — a sibling of `LoopRunAgent` with the same `generate(text, { session })`
surface, so the wire holds either without knowing which. Construction takes the desks'
`LoopRunAgent`s, the `handles` map, and the model; two or more desks or it is not
constructed.

Per session it owns:

```
ledger:      [{ desk, userText, replyText }]   — delivered TEXT only, in order
currentDesk: the desk the conversation sits at (null on opening)
```

**Three memories, three owners.** The governed sessions stay PER DESK — each desk keeps its
own tape, its own records of its own acts, its own consent debts. The world is one and shared,
as it already is. The router sees the ledger's tail; the desks see the ledger's text through
`before`:

- **`before` — foreign exchanges.** When a turn is delivered to a desk, the ledger entries of
  OTHER desks since that desk's last visit ride in as plain user/assistant text — delivered
  words, no acts, nothing executable. This is how billing finds `bk_91` in "now raise the
  invoice" without a dead which-booking turn: model memory is the delivered text.
  `LoopRunAgent.generate` gains the typed key `before: readonly Exchange[]` (pre-1.0, the
  closed key set changes in one move).
- **An open consent debt stays at its desk.** The approval message routes back as a
  continuation — the ask IS the last exchange, so the tail carries it.

**The notMine door.** A routed delivery carries one extra tool on the turn's surface:
`notMine({ reason })`, valid only as the turn's FIRST call — after any act the door is a
guard refusal ("the return door closed once work began"). When a desk calls it, no reply is
composed; the front desk re-routes once with the desk's reason line added to the window, and
the re-delivery **does not carry the door** — the one-return cap is structural, not an
instruction.

## 5 · The wire and the chat door (server)

- `ServerConfig.agents` accepts `LoopRunAgent | RoutedAgent`. A multi-desk subject mounts as
  ONE wire model id (`atlas-equipment-rentals`); its desks stop being the caller's problem.
  Mounting a desk directly stays possible — the exam's desk-pinned paths do not change.
- **`chat.ts`** — a generic, programmatic terminal REPL: `startChat({ agent })` reads lines,
  prints the reply, and prints the routing as a dim line per turn —
  `[router → billing]`, `[claims returned → billing]`, `[none]` — straight from
  `TurnRecord.routing`. Commands: `/desks`, `/exit`. The server package knows no subject.
- **The chat opens ANY subject from the standard door — no per-subject wiring.** Every
  skill-generated subject already exports the same door (`subject.ts`: contract, specs,
  world; `ask/targets.json`: the model), and `SubjectLoader.load(subjectDir)` already
  composes it generically for the exam. The chat rides the same two pieces:
  `RoutedAgent.fromSubject(subject)` (mastra) builds one `LoopRunAgent` per desk, reads
  `handles` from the emitted artifacts, and returns the routed house — or the lone
  `LoopRunAgent` itself when the subject declares one desk. One generic bench tool serves
  every subject, present and future:

  ```
  SUBJECT_DIR=subjects/atlas-c17   node tools/chat.mjs
  SUBJECT_DIR=subjects/any-new-one node tools/chat.mjs      # only the dir changes
  ```

## 6 · Errors

| failure | treatment |
|---|---|
| router call fails at the provider | `TurnFailure('network', …)` — the channel that exists |
| malformed route (no desk) | one forced retry; then `TurnFailure` — never a silent guess |
| route = none | front refusal naming what the house does; no desk touched, no act run |
| second notMine on one message | structural: the door is absent from the re-delivery surface |
| wrong desk despite it all | the desk's closed surface + card guards hold every act; worst case is one turn of latency and the refusal text becomes the router's signal next turn |

## 7 · Out of the governed record, nothing

The routing decision, the returned reason and the none-refusal all ride `TurnRecord.routing`;
the chat door prints from the record, and the judge reads the same record. No side channel.

## 8 · Testing and the closing measurement

**Dry units (scripted model, no key):** window composition byte-exact against §3; enum
validation; `notMine` accepted as first call and refused after an act; the structural absence
of the door on re-delivery; `before` carrying exactly the foreign entries since last visit;
single-desk subjects composing no router.

**The closing measurement:** a routed exam set — the four §1.2 sequences, word-lure rows,
none-traps, and an opening per declared desk — run on the ladder **12 → 40 → 100**, judged in
session, deterministic counters as always. The bar: every message of a case lands on the
right lane, with defensible sets declared in the ruler BEFORE the run; a routed case passes
only whole. Router token cost is asserted constant across turn depth.

## 9 · The documentation

README gains the routed door and the chat door; every new file header states its law in AS-IS
voice (`front-desk.ts`: the window and what may never enter it; `chat.ts`: prints from the
record, no side channel). This page is the standing reference for the routing contract.

## 10 · The skill (same session as the engine change)

- `declare.md`: the `handles` field — required with 2+ desks, refused with one.
- `norms.md`: the line law — *name the acts, not the nouns* — with the §2 measured pair as
  the example; the none-door law: the outside world routes nowhere, however close a desk's
  territory sounds.
- lint: a 2+ desk declaration missing any `handles` refuses at emit.
- Nothing subject-specific enters any page.

## 11 · Out of scope, registered

| item | where it lives |
|---|---|
| folding `teammates` into `handles` | looprun BACKLOG (needs-unification family) |
| tape pruning for long sessions | looprun BACKLOG row 1 addendum (prompt token program) |
| more than one return per message | the cap is the design; widening it needs its own measured case |
| router history beyond tail-1 | tail-1 measured best AND cheapest; revisit only on a measured miss |
| one session whose spec swaps per turn | per-desk sessions + `before` is the smaller cut; the swap is surgery without a paying defect |

## 12 · Rulings recorded from the design session

| ruling | decision |
|---|---|
| routing granularity | every message, dedicated neutral router |
| router window | tail-1 + current-desk line, constant |
| return door | yes — notMine, first-call-only, one return per message, structural cap |
| router existence | only with 2+ desks; single-desk subjects unchanged |
| router model | the subject's own model, temperature 0, thinking off (engine defaults) |
| chat door | generic REPL in server; subject glue lives in the bench |
