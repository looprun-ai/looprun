# Lessons Learned

## Summary

After implementing looprun with AI we have constantly noticed several design and implementation problems:

- Use of regex to validate replies from both the model and the user
- Excessive generation of custom guards by the skill, abusing regex and forgetting to use pre-existing guards
- A perfect-world view, with tools that have a simulation mode (dryRun) and always return correct results
- Use of a fixed naming pattern/convention for parameters/data identifiers, which were expected to carry "id", "Id", etc in the name
- Dependence on the order of tool calls and the order of parameters
- Absence of a deterministic mechanism for explicitly returning a piece of information produced by a tool (= dependence on prose + a capable model to show the information, without the disclosure pattern)
- Confusing names (probe, dryRun, etc) — parameters, variables and names that do not CLEARLY state their purpose
- **Entangled code with deep dependencies**, making it extremely complex and hard to debug
- Dubious status names: pending_confirmation became two words: tool_called_request_approval and any_other_question

The list above is incomplete. Below, a summary of the execution of the latest specs/plans for a better understanding:

=====
# consent-dead-ends-design

Session summary — from the problem to the v0.14.0 release

The problem (where it all started)

The consent protocol had two dead ends — conversations that stalled forever:

DEAD END 1  user   "Cancel bk_1001, I'm sure!"
            agent  cancelBooking({ ..., confirmed: true })  → BLOCKED
            reply  "I need your confirmation"
            user   "yes!!"  → blocked again... forever  ∞

DEAD END 2  agent  unsubscribeCustomer({ customerId })  → BLOCKED
                   and the confirmation question is NEVER born
                   → a tool that can never run  ∞

And a third defect: the confirmed field asked for a fact about the user — and the prose "I'm sure" made the fact true, so the model filled it in by itself.

The design decision (your idea, validated in the conversation)

Invert the polarity. Instead of a flag to act, a flag to simulate:

BEFORE  cancelBooking({ id })                     ← does not cancel (its own name lies)
        cancelBooking({ id, confirmed: true })    ← acts (a field prose can fill)

AFTER   cancelBooking({ id, simulate: true })     ← simulates: validates and describes
        cancelBooking({ id })                     ← acts; NO field to fill

One single law: a destructive call without simulate: true requires the code the user typed. With that, the two forms of consent-check collapsed into one — each tool's route is read from its own schema, nothing is declared by the author.

How each dead end closed

DEAD END 1 → DOWNGRADE      the denied act becomes its own simulation: the world validates,
                            describes, and the question is born with a code to type
DEAD END 2 → VETO-QUESTION  the block becomes the question, about the record the
                            call itself names (cust_2001 → CONFIRM CUST_2001)
FIELD → DOES NOT EXIST      the acting call is clean; prose has nowhere to enter

In one sentence: the session took two consent dead ends, closed them by inverting who carries the flag — simulating is an explicit request, acting is a clean call gated by the user's code — and took that from spec to published release, with engine, exam and skill always telling the same story.


=====
# plain-names-design

Session summary — from the seven names to the v0.13.0 release

The problem (where it all started)

Seven concepts carried names written by whoever built the engine. Anyone arriving from outside could not read the consent flow without stopping at every word:

"the ledger stores the challenge the probe raised in the preview of the trunk"
       │                  │            │                │             │
   a record?           a dare?     a sensor?         a peek?       a tree?

Each name cost a paragraph of explanation every time someone who had not written the code arrived.

The decision — seven words nobody needs to decode

ledger      →  actionHistory      what was done in this conversation
probe       →  simulate           "I did nothing — here is what would happen"
preview     →  simulationResult   what that response carries
trunk       →  assembledPrompt    the prompt the agent reads
challenge   →  approvalRequest    the request + the code that answers it
arm         →  variant            one side of the comparison
band        →  range              the spread across repetitions

Three were not synonyms — and that is where the conversation got good

trunk was a tree. A shared trunk, per-agent branches. The law was named after it:

BEFORE  agents share a maximal TRUNK prefix (trunk-static law)
WRONG   agents share an ASSEMBLEDPROMPT prefix (assembledPrompt-static law)
                          ▲ the assembled prompt is the WHOLE per agent;
                            the trunk was the SHARED part
RIGHT   shared-prefix law  ← the law got its own name

probe had three senses. Only two were ours:

① the world's helper           probe()          →  simulate()
② effect-free writing          "(a probe)"      →  "(a simulation)"
③ a MEASUREMENT INSTRUMENT     margin probe     →  stays probe
                                                   "the margin simulate" is not a sentence

confirmationRequest would recreate the collision. The namespace already had 8 names and 150 uses — confirmed, confirmFirst, confirmMechanism, requiresConfirmation… You chose approvalRequest: the user approves the act.

The gate — the law that holds it all

tests/plain-names.test.mjs
   runs in  pnpm test  ·  pnpm test:laws  ·  release gates

And it caught real things, twice:

① a plan from ANOTHER session came in with "The two probe tests become:"
   three lines below code that already said flagsDeclareSimulation

② the release was blocked when the changeset wrote into the CHANGELOGs

Three defects the execution found (all mine)

DEFECT 1   the regex I wrote in the spec did not catch camelCase
           /\bchallenge/i  against  issueChallengeForVeto  →  NO MATCH
           there is no \b between "issue" and "Challenge"
           the gate's self-test fired on the first run

DEFECT 2   the spoken form broke code
           const trunk  →  const assembled prompt   ← TS1005: ',' expected
           new rule: the spoken form only in .md files and in comment lines

DEFECT 3   a recording keeps the keys it was written with
           .battery/measurements.json has "ledger"
           → actionHistory is not iterable
           the reader now maps at the boundary; the record stays intact

Six things keep the old word

In one sentence: the session traded seven engineer names for seven words any reader already has, discovered along the way that three of them were not synonyms — a tree that was a law, an instrument that measures, and an already-crowded namespace —, wrote the gate that holds the decision and proved it by catching someone else's unfinished work, and took everything to the published v0.13.0.
=====

=====
# guard-priority-design

Session summary — from the problem to the v0.15.0 release

The problem (where it all started)

Every guard carries an id. The id's prefix said which layer it belonged to — and the layers no longer existed:

type Layer = 'minimal' | 'base' | 'full' | 'agent';

full was used by no guard at all. And minimal mixed three completely different things:

minimal:noDuplicateCall     ← every spec installs it, always
minimal:claimIsGrounded     ← only if the contract declares writeTools
minimal:writeGate           ← only if the contract declares the gate

A reader saw minimal: and understood "the minimum, always present". Two of those three were domain choices.

The defect this lie was causing

lint-subject runs a census: "does every guard the bundle installed have some test case exercising it?" It excluded from the census everything with the minimal: prefix:

.filter((b) => b.layer !== 'minimal')     // "the engine installs it in every domain"

But only two of the five were that. The result:

BUNDLE declares contract.writeTools
   → engine installs claimIsGrounded + claimIsComplete
   → the census IGNORES both  ("they belong to the engine")
   → no case tests them
   → they pass in BOTH run variants (governed and ungoverned)
   → they count as coverage without ever having fired

A guard that never fires is indistinguishable from a guard that does not exist.

The design decision

The prefix now names the question the guard answers:

BEFORE  minimal · base · full · agent      ← a class ladder that vanished
AFTER   agent · changeAllowed · consent · honesty · always
        ↑                                              ↑
        the author wrote it                 every spec carries it

And the order became readable: agent wins, always is the floor.

minimal:noDuplicateCall   → always:noDuplicateCall        every spec
minimal:degenerationGuard → always:degenerationGuard      every spec
minimal:claimIsGrounded   → honesty:claimIsGrounded       if contract.writeTools
minimal:claimIsComplete   → honesty:claimIsComplete       if contract.writeTools
minimal:writeGate         → changeAllowed:precondition    if contract.changeAllowed
base:confirmFirst         → consent:confirmFirst          if destructiveTools
base:destructiveThrottle  → consent:destructiveThrottle   if destructiveTools

contract.writeGate        → contract.changeAllowed

The census, fixed

.filter((b) => b.priority !== 'always')   // only the two unconditional ones leave

And it immediately accused the tutorial's own bundle:

GUARD-NEVER-TARGETED: 'honesty:claimIsGrounded' on agent scheduler shipped
and no case on that lane targets it

The tutorial taught declaring writeTools and never tested what that installs. Fixed in the only case whose write actually happens.

How the rename proves itself

A gate that runs on every build, with an empty allowlist:

$ node tests/guard-priority.test.mjs
guard-priority: clean (minimal:, base:X, LAYER_ORDER, writeGate, Layer, .layer)

What it did not catch — and what that revealed

The gate bans identifiers. Residue in prose slipped through:

caught      minimal:noDuplicateCall     .layer     contract.writeGate
escaped     "(Minimal layer)"    installMinimal()    auto: 'minimal'

That is how these showed up, one by one, throughout the session:

┌─────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
│              where              │                                   what it was                                  │
├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ GuardProof.auto                 │ 'minimal' | 'base' → 'always' | 'consent', in 16 places                        │
├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ installMinimal() /              │ → installUniversalAndContractGuards() / installConsentProtocol()               │
│ installBase()                   │                                                                                │
├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
│ 4 comments                      │ "(Minimal layer)", "no Minimal/Base/Full ladder", "the minimal integrity       │
│                                 │ layer"                                                                         │
└─────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────┘

The GUARDS.md one was the worst: it explained the class by what it replaced, sending the reader to look for three classes they will never find.

A script that had never run

While fixing the proof generator's kind table, I discovered it did not parse — an unescaped backtick, since before everything:

scaffold-proof-cases.mjs:86    SyntaxError
  // ...whose `message` is NON-empty and
              ^^^^^^^

And its table was wrong in both directions: 8 kinds that no longer exist, 8 that exist and were missing. It is now derived from the catalog and aborts if it disagrees:

In one sentence: the session took a prefix that lied — minimal: said "always" for guards the domain chose —, replaced the class ladder with five priorities that name each guard's question, and the first real effect was a census that stopped certifying as covered guards that no test had ever made fire.

=====
# tool-owned-guards-design

Session summary — from the plan to the v0.17.0 release

The problem (where it all started)

A rule about a tool lived far from the tool — in a system-prompt block — and was declared once per agent, not once per domain:

BEFORE  system prompt (per agent, 6 lanes = 6 declarations of the same rule)
        │ ## Tool rules
        │ - **cancelBooking**: only after getBooking has run; a destructive action: …
        │
        └─ and in native/MCP mode…  NOTHING. The host's tools passed straight through
           (admitted[t] = config.tools![t]) and the prose reached the model through
           NO channel at all.  ← the gravest hole

        changeAllowed was a special contract field, with its own installation
        code — a tool rule with VIP treatment

The design decision

The rule belongs to the tool and is declared once in the domain's contract:

AFTER   the description of the tool ITSELF (the model reads it when choosing the call):

        │ Cancel a booking.
        │
        │ RULES YOU MUST FOLLOW TO CALL THIS TOOL
        │ - read the booking first — the record names the asset
        │ - a destructive action: make the call — it does not run, and the refusal…

        declared ONCE, in the contract, with named sets:

        contract.guards: [{ hook: 'preTool', target: 'writeTools',
                            guard: precondition(…), priority: 'changeAllowed' }]

        'writeTools' expands to a LITERAL list at installation
        (it never becomes a ToolTarget string — 'destructiveTools'.includes('Tools')
         is true: substring would kill the routing)

And native mode closed the hole with a trade: toolDefs became mandatory, the file is reconciled against the live host (renamed name, new field, changed type → construction throws), and the host's tool is served with its own execute + a composed description.

Three ambushes along the way, all from gates the plan did not know: the public surface is pinned at 42 symbols (the composer went to the internal barrel, like renderAssembledPrompt); main was already failing plain-names (a spec committed without running pnpm test — probe→measurement, band→range); and writeGate is a retired identifier (it became frozenWritesBinding in the tests).

In one sentence: the session took tool rules that lived in a per-agent prompt block — and that in MCP mode reached the model through no channel at all — and moved them to the one place every route reads, the tool's own description, declared once in the contract; and took that from plan to the published v0.17.0, with engine, lints, tutorials and skill telling the same story.

=====
# disclosure-design

Session summary — from the spec to the prepared release

The problem (measured, not assumed)

The engine asks the user whether it may perform a destructive act. But the question only names the record — what the act does is left to the model's prose. And the model does not say it.

WHAT THE USER SAW                WHAT WAS MISSING

To confirm ast_ltwr01,           "this takes the equipment out of the
reply: CONFIRM AST_LTWR01         rental fleet for good"
   ↑                                 ↑
   the engine writes it              nobody writes it

Five attempts at making the model state the consequence failed. Only one worked, and only on a 3-tool surface — with 13, the model did not even attempt the call.

The decision: take the model out of the way

The domain writes one sentence per tool, and the engine prints it on top of the question itself:

BEFORE  To confirm ast_ltwr01, reply: CONFIRM AST_LTWR01

AFTER   Retiring ast_ltwr01 (Allmand Light Tower) takes it out of the
        rentable fleet for good.
        To confirm ast_ltwr01, reply: CONFIRM AST_LTWR01

The {slots} are filled by the engine with what that conversation read. The model does not compose, does not soften, does not omit.

The trap the sentence nearly fell into

"Use the last read" sounds obvious. On a real trace, it lies:

the act is updateMemberRole(mem_1004 → owner)

  getMember({memberId:'mem_1004'})  → Sam Whitfield    who is being promoted
  getMember({})                     → Dana Okafor      who is acting

  last-wins        "Promoting Dana Okafor to owner…"     ❌ names the wrong person
                                                            in a privilege-escalation
                                                            question
  bound-to-target  "Promoting Sam Whitfield to owner…"   ✅

The rule became: the read whose result names the question's record.

The hole that appeared midway (and that Marcos caught)

The original design read the results from the world's log. But there are two execution paths:

the world executes the tool   → the world stores the result   ✅
the tool executes itself      → the world stores NOTHING      ❌ every slot yielded "NA"
   (native / MCP)

The seam that sees the result in both cases already existed: the recordToolResult hook, which receives the output wherever it comes from. One line solved it:

  actionHistory.observed.push({
    name, args, ok, turnIndex,
+   ...(ok ? { result: output } : {}),

A failed call stores no result — a refusal grounds no sentence.

The new validate layer distinguishes author error from data condition — offline, spending nothing:

{getInvoice.invoice.amountRefunded}      the field is named `refunded`   → BLOCKS
{getClaim.claim.settlementAmount}=null   the field exists, this record
                                          has no value yet                → yields NA, passes

In one sentence: the session took a consent question that said which record but never what, made the engine say it from the records the turn itself read — bound to the question's target rather than the last read, and served the same whether the world executes the tool or it executes itself — and took that from spec to the release gates, with engine, exam, documentation and skill all telling the same story.


=====
# worst-world-design

Session summary — from the plan to the merge (worst world, owned truth)

The problem (where it all started)

The engine treated a simulation as an act, hid what it knew, and let sensitive data pass raw:

DEFECT 1  agent  cancelBooking({ bookingId: 'bk_1', simulate: true })
          guard  precondition → DENY "blocked by mirror"
                 → the simulation (a READ) died on a guard whose rule
                   the world itself validates in full

DEFECT 2  user   "do not touch releaseDeposit"
          model  reads bk_1003 and replies "I refuse: the claim is open"  ← the right answer
          guard  refused with no attempt → NO evidence → veto → redrive →
                 exhaustion → canned sentence, the block is never named  ∞

DEFECT 3  turn 1  "To confirm bk_1001, reply: CONFIRM BK_1001"
          turn 2  the question vanishes from the delivery — the user forgets it exists

DEFECT 4  world   getCustomer() → { phone: '555-0199', email: 'ops@x.example' }
                  → arrives RAW in the model's context; no law declares what to hide

The design decision (the spec, 4 laws)

1  WORST WORLD     the fixture implements only what the surface documents — nothing kinder
2  OWNED GAP       a guard only for a rule the surface does not document;
                   a schema-licensed simulation is a read and passes the gate
3  RENDERED TRUTH  the engine delivers what it knows: authored report, the open approval
                   in every delivery, closure with authored sentences — never raw data
4  THE EXAM MEASURES THE MODEL  noEffectToolCalls: veto/simulation/failure never score

How each defect closed

1 → ALWAYS_GUARD_KINDS   simulate:true + schema → only noDuplicateCall gates (a loop is a loop)
2 → REFUSAL BY RULE      a read that addressed the entity + no effected write = grounded;
                         and the deny teaches: "Declarable for bk_1003 …: blocked, refused, no_op."
3 → OPEN APPROVAL        renders in EVERY delivery until consumed/closed;
                         approvalsIssuedThisTurn deleted with no alias
4 → FILTER AT 3 SEAMS    sensitiveFields (omit/mask) + scrubTextFields (scrub) at the executor,
                         on the arguments and on the delivery — and the final net touches only
                         the model's prose: "CONFIRM 2026-0801-77" survives, "+1 415 555 0199"
                         becomes •••

What execution caught that the plan did not see

- A camouflaged regression: Task 1 broke a mastra L4 test that only surfaced in Task 8 as "pre-existing" — bisect proved the baseline green; the test asserted the abolished mechanism and was rewritten for the invariant (1 world effect + CONFIRM P002 open).
- A critical in the final review: mask on a non-string leaked raw (phone: 4155550199 arrived intact) — now it becomes '•••'.
- noDuplicateCall disarmed by the scrub (raw ≠ scrubbed never matched) — the gate now sees the written form.

In one sentence: the session took an engine that vetoed reads, silenced what it knew and leaked what it should hide, executed the spec's four laws task by task with a subagent and per-task review across both repos, survived a camouflaged regression and two criticals caught in the final review, and ended with everything merged, green and the spec closed — with the atlas debt priced and addressed to the next plan.


=====
# consent-licence-design

The consent-licence spec — the problem and the solution

The problem: three defects kept the user from even MANAGING to agree

Defect A — the licence was guessed from the argument's NAME. The engine elected "the record" of a call by looking for identity-looking keys (id, *Id), in the order the model serialized them:

transferAsset({ assetId: 'ast_ltwr01', targetWorkspaceId: 'ws_denver02' })
                    └── two identity keys — whichever comes FIRST wins

run 1-2  the model wrote {assetId, ...}   →  question: CONFIRM AST_LTWR01
run 3-4  the model wrote {..., assetId}   →  question: CONFIRM WS_DENVER02   ← same call!

Worse: the licence matched by VALUE — a typed CONFIRM WS_DENVER02 licensed transferring any other machine to that destination. And a world that named the field asset (no Id) generated no question at all: an act forever unreachable, in silence.

Defect B — the exhaustion route swallowed the question. Two routes delivered "the turn exhausted", and only one printed the pending question: in 5 of 174 turns the user got a screen without the question that was open.

Defect C — the word for "I asked" was improbable. The agent declared pending_confirmation (the truth!) and the engine demanded as proof a world result that a vetoed act never produces — the veto happens BEFORE the world:

try 1  {op:'transferAsset', outcome:'pending_confirmation'}  REJECTED
try 2  []                                                    REJECTED
try 3  {op:'transferAsset', outcome:'pending_confirmation'}  REJECTED
       → budget spent → the turn dies exhausted → no question, no act

17 of the 19 cases died on that rule.

The design decision: the licence IS the call

Nothing else is elected, so nothing can be elected wrong:

BEFORE  approval { subject: 'ast_ltwr01' }        ← ONE argument elected by naming convention
        literal: CONFIRM AST_LTWR01               ← derived from the guessed record

AFTER   approval { args: {assetId, targetWorkspaceId} }   ← the WHOLE call
        literal: CONFIRM TRANSFERASSET-5465
                         └──────┬─────┘ └─┬─┘
                           tool name     hash of the canonical args

Three things, three roles: the engine stores the call; the user reads the human label ("transfer a piece of equipment") plus the disclosure sentence; the user types a short gesture. The literal licenses that call and no other — the same call with keys in another order is the same licence, another destination is another licence.

How each defect closed

A → NO ELECTION      the question is born from the call itself; a world that names the
                     field `transferredTo` works the same as one that names it `id`
B → ONE ROUTE ONLY   renderApproval() is called by BOTH delivery routes —
                     an exhausted turn prints every pending question, like the clean route
C → THE WORD SPLITS  tool_called_request_approval  ← the VETOED act is the proof
                     any_other_question            ← talk is not an operation, never checked

And honesty followed: instead of matching the claim's target against identities fished out by key name, the engine derives what each act of the turn honestly supports (vetoed → blocked/tool_called_request_approval; effected → success; …) and each declaration spends one act that supports it — no lying (a declaration with no act left) and no hiding (an act with no declaration).

The measured result

r4  before    1/19   17 turns redriven by the improbable rule
r5  consent   7/19   1 redrive — the model got it right on the FIRST try
r16 all      19/19   + three-tense disclosure + the literal echo removed from the call

In one sentence: the consent question stopped being about a record the engine guessed from a field's name and became about the exact call the model attempted — which made the literal unpredictable by construction (the exam now reads it off the screen, like a real person would), the "I asked" answer probable through the veto itself, and the licence incapable of leaking to any other act.

=====
# honest-report-and-read-disclosure.md

Session summary — from the audited record to the ready release-minor

The problem (where it all started)

The honest report and the disclosure had three defects, all measured on the atlas 100-case exam:

DEFECT 1  the turn    generateQuote ran · createBooking was blocked by the plan's cap
ORDER     reported    "the booking blocked, and then the quote passed"   → DENIED
          reported    "the quote passed, and then the booking blocked"   → PASSES
          (same content — only the order changed; and the deny did not name the tool:
           the engine KNEW it was generateQuote and did not say. With only ONE redrive,
           an unactionable correction = exhaustion closure = the model's words never
           reach the user)

DEFECT 2  the world answered     seatsUsed 2 · seatCap 2
SILENCE   the reply said          "at its seat cap of 2"
          → the turn that REFUSES runs no act, and `after` only printed with
            tookEffect === true: the engine went mute exactly where the operator
            needs the numbers behind the refusal

DEFECT 3  Voiding NA cancels a document of NA; a voided invoice is closed for good.
MARKER    To confirm voiding an invoice, reply: CONFIRM VOIDINVOICE-DCB7
          → the operator invited to consent to an act described by NA in place
            of the record

And a fourth problem, of the instrument: r22 measured nothing — the file: dependency swapped only the top symlink; eval and mastra resolved core from the registry (core@0.19.0). pnpm.overrides closed it: before trusting a run, check which core each PACKAGE resolves.

The design decisions

ORDER     → BOTH SIDES SPEND        one declaration covers ONE act, whichever carries
                                    its word, and is gone. Hiding = an act left with no
                                    declaration. The order belongs to the agent.
                                    And the deny names: "Nothing in your report
                                    accounts for what generateQuote did…"
                                    (the tool and the word are the agent's;
                                    a world fact, never)

SILENCE   → THE RESULT DECIDES      `after` is offered to EVERY ok call, reads
                                    included; it prints only what the result
                                    fills. Refused → silence. And the numbers
                                    sentence moves from the act to the READ:
                                    getPlanUsage.after speaks in the refusal, where
                                    no act runs

MARKER    → FORCED READ             telling the model to read is not a mechanism (like
                                    veto: 2 of 4 cases ended without the question
                                    reaching the user — worse than the NA). The engine
                                    FORCES the call at the flowChain seam (toolChoice:
                                    'required'), through the same guardHooks, blocking
                                    nothing

Exam result: 79 → 85 (r19 v0.19.0 → r24), and the turns printing NA: 15 → 4 → 0 (r24 → r27 → r32). The honesty change is inert on this exam — the order defect is real and is pinned in the unit tests.

In one sentence: the session took an honest report that punished order and silenced the deny, a disclosure tied to effect that went silent exactly on refusal, and a consent question that said NA where the record should be — closed all three by making the declaration spend in any order, the result decide what prints, and the engine force the read the question owes — and audited the spec to the end: skill aligned, contradicted docs corrected, and the release-minor rehearsed and green, with only you left to run it.
