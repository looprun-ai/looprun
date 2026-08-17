# looprun TO-BE — Requirements Charter

The contract every TO-BE design is judged against. **A TO-BE design is valid ONLY when 100% of
the requirements are satisfied, proven by a MANDATORY item-by-item check**: the design document
ships a compliance table with one row per charter item (every R1.x through R11, the
rename-register enforcement, and every line of the mechanical rejection checklist), each row
stating PASS with a pointer to where the design satisfies it — a section, a signature, a
diagram — and, for every authoring-visible change, WHERE the skill and the tutorial absorb it
(R11). A row without a pointer is a FAIL; a
missing row is a FAIL; any FAIL rejects the whole design mechanically — no partial credit, no
"add it later". Sources: the agentspec skill
(`agentspec/skill/SKILL.md` + references — the pipeline the engine exists to serve), the
s15 design record in `neurono-bench` (the measured WHYs behind the AgentSpec shape), the
AS-IS capability record (`docs/analysis/2026-08-12-blueprint-as-is.md`), and the
maintainer's laws.

```
WHO THE ENGINE SERVES

  a business ──► agentspec pipeline ──► AgentSpec files + eval set ──► looprun engine
  (one purpose      ASK → GEN → EVALS →      (generated, certified)       (runs them,
   sentence +        NORMS → TEST → SHIP                                   governed)
   tools.json/MCP
   + docs)

  The pipeline is the engine's PRIMARY customer. An engine the pipeline cannot
  generate for — or that a generated bundle cannot certify on — fails this charter.
```

---

## R1 · Authoring — the golden rule, half one

The current `AgentSpec` and `DomainContract` shapes are NOT requirements: wherever a different
field name, grouping, or structure improves understanding or fixes a defect, change it freely.
What binds is R1's two-card count, R4's carrying capacity, and R6's laws — never today's fields.
The rename register at the end of this charter lists the known candidates by defect.

| # | requirement |
|---|---|
| R1.1 | The whole authoring surface is TWO names: 1 agent = 1 `AgentSpec`; everything conversation-global = 1 `DomainContract`. An author (human or the agentspec skill) never constructs engine classes, never wires ports or collaborators. |
| R1.2 | A minimal working agent (persona + a couple of tools) is authorable in ~10–20 lines of obvious declarative code with zero engine concepts. Every advanced capability is an optional field with a sensible default — that progression IS the tutorial: one concept per lesson. |
| R1.3 | Authored in TypeScript, not a DSL — functions are what make any guard expressible; safety comes from purity linting and review, never from a closed format. |
| R1.4 | `persona` is per-agent and required; the shared business `voice` lives on the contract and the contract carries NO persona (a shared persona is the measured "Theo duplication" defect: one text with two owners). |
| R1.5 | Protocol guards (consent, throttle, honesty, duplicate-call, degeneration floor) install automatically from declared fields — and stay VISIBLE: one inspection call lists every installed rule with who installed it and the declared field that caused it. The inspection list IS the code: it returns the same array the enforcement pipeline iterates (plus judged rules and resolved limits — ALL governance counted), never a parallel copy; and a rule's sentence has ONE home, read identically by the prompt, the denial, and the inspection row. |
| R1.6 | Spec mistakes surface at construction, all at once, each with a named code and a fix-stating sentence — never mid-conversation. A misconfigured guard THROWS: an inert guard that reads as coverage is worse than an absent one. |
| R1.7 | Multi-agent domains are first-class: several `AgentSpec`s share one `DomainContract`; each spec carries its own scope (lane + the other lanes' labels); when a domain is split, the split is by tool-need. The engine imposes NO tool-count ceiling: ≤15 tools per agent is a RECOMMENDED default (the weak-model action wall), and the author decides — a single agent carrying every tool is a valid design, and the pipeline asks the author instead of splitting on its own. |

## R2 · Engine code — the golden rule, half two

| # | requirement |
|---|---|
| R2.1 | The engine code itself is ultra-simple: small classes (~200 lines as the declared target, 400 as the ceiling), short methods, boring straight-line code a maintainer steps through without meeting a framework. |
| R2.2 | No abstraction towers, no indirection where one behavior hops through three classes, no generics gymnastics. If a mechanism seems to need a complex class, the MECHANISM gets simplified. |
| R2.3 | Exactly ONE turn machine. Adapters/backends implement single-step seams and structurally cannot loop, override enforcement, or duplicate the machine. No caller-passable option can weaken governance. |
| R2.4 | Strict one-way dependency layers, no import cycles, no god modules (the AS-IS `turn.ts` — 1045 lines, 13 imports, two diverged loop copies — is the named anti-pattern). |
| R2.5 | Every shape that crosses a package boundary has one home; hand-mirrored types cannot exist. |
| R2.6 | External seams are named single-step PORTS declared in a dependency-free contract layer; a port carries no options object and no field through which governance or a third-party judge could enter. Authors and host devs never see a port — composition lives inside the engine's own construction, beneath the host facades of R9. The ENGINE owns call scheduling: what a guard sees of same-step sibling calls is engine-enforced ordering, never an assumption about the host framework's scheduler. |
| R2.7 | The turn orchestrator sequences and decides nothing: every decision lives in a named single-responsibility collaborator, and the orchestrator may import only its declared collaborators (lintable). The design states a size estimate per class and the estimate is a commitment — a class that cannot land near it gets decomposed along a responsibility line, or its mechanism simplified; a class is NEVER split just to duck the number (fragmenting one behavior across classes is the R2.2 defect, not a fix). |
| R2.8 | **Strong typing is law.** No `any` on any exported surface: public functions take and return named types (`generate` returns the typed turn result, never `Promise<any>`). No index-signature passthrough on a config (`[key: string]: any` is both the typing hole and the R2.3 governance hole — the same signature). Closed vocabularies (outcomes, verdicts, corrections, priorities) are ONE closed union/enum each, shared by record, report, wording and exam — never free strings, never string-prefix families. Decisions switch on discriminated unions exhaustively, never on a name's string. External input enters as `unknown` and is narrowed at the boundary. Strong typing ≠ generics gymnastics (R2.2 stands): named, closed types — one mapped type over a declared args table is the ceiling of cleverness. ENFORCED IN ESLINT, failing the build: `@typescript-eslint/no-explicit-any` at error (no `eslint-disable` for it anywhere), `no-unsafe-assignment`/`no-unsafe-return` on `src/**`, and `tsconfig` strict with `noImplicitAny` — the law runs on every build, not in review. |
| R2.9 | **Immutability at every seam.** Every object that crosses a boundary travels deep-frozen (`Object.freeze`) and `Readonly`-typed: the ctx guards read, sealed turn history, the executor's records view, the compiled cards (compiled once, frozen — the runtime never re-reads the authored form), recorded acts, and the stored consent licence (a mismatched retry is denied whole — arguments are never pruned in place). Mutation is legal in exactly one pattern: a component's OWN private state behind its own methods (the world's store via patches, the session queue). Freezing is in-place and copy-free; a CLONE happens only when exposing a view of live mutable state (the custom executor's records), never per reader — append-only frozen data is shared by reference, which is what makes derived renders memoizable and keeps the R7.3 prompt prefix byte-identical across turns. No immutability library — `freeze` + `Readonly` are the whole mechanism. |
| R2.10 | **Failure is a first-class outcome.** Every external seam (model provider, tool executor, judge) has TYPED failure handling. A turn that cannot complete FAILS LOUDLY as a typed error to the host (R9.1's HTTP failure is its wire form) — never silence, never model prose over a failure, never a provider error message leaking raw into user-facing text. Turns are atomic against session state: a failed turn seals NOTHING — history, open approvals and budgets stay exactly as the last completed turn left them, so a retry starts clean. Provider failures (quota, auth, network) are the host's to see and the monitor's to classify; an unresolved incident blocks certification (the R4/TEST monitor is mandatory, not optional) — and an incident's resolution marker is BOUND to that incident (id/hash): a marker created before the incident, or left stale from a prior run, can never clear a fresh one. |

## R3 · The company's tool surface — immutable, and it works

| # | requirement |
|---|---|
| R3.1 | The pipeline's primary input is a business-provided `tools.json` / tools directory / MCP endpoint (skill phase A2). The engine MUST run governed agents over that surface. "No tools" is the secondary path (tool genesis). |
| R3.2 | The provided surface is never silently rewritten. Findings go to a human gate with four exits: fix at source · emend via mechanical PROXY · exclude from the agent surface · contest. "Accept a defect as-is" does not exist. |
| R3.3 | Proxies are mechanical translations only: tighten a schema, sanitize an injection-shaped description, compose a missing read from existing reads, rename an EXISTING dry-run parameter (`dryRun`, `validateOnly`, `preview`, …) to the engine's canonical simulation form. A wire layer maps the proxied call back to the real call. Never invent a `simulate`/`confirmed` parameter the real API does not have. |
| R3.4 | A surface with NO dry-run parameter still works fully: every destructive call is gated through consent — the two-step exists because governance creates it, not because the tool offers it. |
| R3.5 | Every governance-relevant fact about an external tool (effect class, destructiveness, target argument, sensitive fields, user-facing label) is DECLARED in the governed layer (the gate-approved intake output) — never inferred from the tool's name, its description prose, or its result shape. |
| R3.6 | An external executor that cannot attest its effect gets defined, fail-closed, non-lying handling: the engine never reports a confirmed success it cannot see, and never reports "nothing changed" over a write that may have landed. Concretely: the executor answers ONE tiny question at the seam — `done: yes \| no \| unknown` — beside the result data, and never speaks engine vocabulary. The engine derives the single user-facing word from it: `status: done \| not-done \| unknown` plus a `reason` when not-done (`held`, `refused`, `blocked` — illustrative; the design picks the words). Vetoed and held calls never reach the executor and get their status from the engine alone. One rule: the engine never guesses — `unknown` is never delivered as success and never as "nothing changed" (it reads like "I sent it; the service did not confirm the result"), and on a destructive tool `unknown` counts as dangerous for consent and throttle purposes. Where the engine can read state (a world with visible records), attestations are verified by snapshot diff: a change under a `done: no` answer corrects the record to done and mints a named correction; a simulation that mutated state additionally revokes that tool's simulation route for the session — it falls back to plain consent. Trust is graded, verification is engine-side, and a caught lie never crashes the turn. |
| R3.7 | Recordless or argument-poor destructive acts still get a consent question, worded from the declared label — a tool name never appears on the user's screen as the question. |
| R3.8 | **Credentials never enter the governed layer.** The MCP/host connection is constructed and authenticated by the host (client + env/headers); a native tool's `execute` carries its authenticated connection by closure. The two cards and the certified intake are versioned artifacts and carry NO secret. The certified intake (`gen/tools.json`) travels BESIDE the connection and is enforced at construction: reconciliation against the live host (renamed tool, new field, changed type → construction throws), deny-by-default surface intersection (a host tool off the spec's surface is never active; a spec tool the host lacks throws), and the certification fingerprint gate (`expectedSurfaceHash` mismatch → the seal is void, construction throws). The fingerprint is computed over a CANONICAL schema form — stable across key order and validator-library versions, never a `JSON.stringify` of a live validator object. Deny-by-default exclusions are reported STRUCTURALLY (a typed field the host reads), never only on stderr. |

## R4 · The pipeline is the customer — what each phase needs from the engine

| phase | the engine must provide |
|---|---|
| ASK | a machine-readable targets file (`ask/targets.json`) the runner reads: provider, model, key env-var name, local serving tier — cloud AND local (llama.cpp) models. Every routing-relevant fact about a target (provider kind, local tier, runaway brakes) is DECLARED there — never inferred from the model id's spelling or a hostname literal (a llama.cpp box reached over LAN is as local as localhost). |
| GEN | a deterministic, in-memory, worst-world fixture world authorable as declared data: implements only the documented surface, simulation ≡ act by shared code path, gates on every tool kind, refusals as honest results, no clock/randomness/network. Custom executors extend the world without an attestation escape hatch: an executor receives coerced args and a deep-frozen copy of the records (`Object.freeze` over a clone — mutation throws, the live store is never handed out) and returns `{result, patches}` — the world applies the patches itself through the shared gated, audited, attesting path, so a custom tool's `done` is true by construction and simulation works on it unchanged. |
| EVALS | scripted multi-turn cases playable through the REAL turn path, with a typed step for approving a pending consent question (the code is random per run — a case can never regex it out of prose). The exam carries a guard-coverage census: every rule the bundle installs has a case that makes it FIRE, and the census keys on each rule's real install condition — an exclusion list keyed on a label certifies never-fired guards as covered (a guard that never fires is indistinguishable from one that does not exist). |
| NORMS | the two authored cards (R1) expressive enough to carry: the split, the shared contract, per-agent specs, guard bindings (contract-level for tool rules any lane would owe; lane-level for how one desk works), disclosure sentences, outcome wording, sensitive-field declarations. |
| TEST | an offline `validate` (schema + references + premise coherence, zero spend); a governed run and an enforcement-stripped ungoverned CONTROL run of the same cases; blind per-turn judge inputs for the agent in session; verdict folding; margin discipline (a case flip inside noise is a near-tie, not a prose bug; the bar is a floor). The judge input is blind to variant/model/rep labels but COMPLETE as evidence: user text, guard events, attempted (vetoed) calls, and results untruncated or with the truncation declared. The instrument itself carries no silent sampling: static gates cover EVERY preset, and validation replays run each phase on a fresh world instance. Run provenance: before a run counts, the harness records and verifies WHICH engine build every package resolved (the measured r22 ran the registry's core, not the tree's, and measured nothing). |
| SHIP | a certification record + an artifact seal that hashes EVERY governed artifact (a world file outside the seal is a hole, not a detail). |

## R5 · The eight governed mechanisms (the Atlas baseline's load-bearing set)

Stated as behavior; the design chooses the homes, every mechanism gets a signature-level one.

| # | mechanism |
|---|---|
| R5.1 | **Consent.** A destructive act runs only after the user types back an engine-issued literal bound to the EXACT attempted call; the licence covers that call and nothing else; the open question renders in EVERY delivery until consumed or closed; a consent given for one record can never reach another. **Approval is never a bypass**: the approved call still passes every other rule (agent rules, change-window rules, throttles). Two dead-ends are forbidden by construction: an approval loop that can never be satisfied, and a destructive tool whose question can never be born. The question's lifecycle is a named state machine: `open → consumed \| closed(declined \| superseded \| expired \| vetoed)`. One open question per canonical call (a re-attempt returns the SAME question and code, never a second live code); the code carries a per-issuance nonce so a stale quoted code can never consume a newer ticket; and EVERY closure is delivered — a question never disappears silently, expiry included. The code carries real entropy and is UNIQUE among open questions (re-drawn on collision): one typed reply can never license two open acts — and consumption matches exactly one question, never "every open approval whose token the message carries". |
| R5.2 | **Disclosure.** The domain authors what an act would do / did — three tenses (before agreeing, after the act, standing in later turns) — filled from data bound to the question's target record, never last-read-wins. The reads a consent question needs are guaranteed by the ENGINE deterministically, never requested from the model in prose. Figures reach the user even when the model's prose omits them. This guarantee generalizes: EVERY owed read (consent-owed AND rule-owed, e.g. read-before-act) is engine-guaranteed — a deny that merely hopes the model reads next is not a mechanism (measured: 2 of 4 told-to-read-and-recall turns ended with the act never put to the user). And the mechanisms must not disarm each other: a deny that stops the approval from being born must not starve the forced-read pass that fires on open approvals. |
| R5.3 | **Honest report.** The model closes every turn through one structured channel declaring what it did; the engine renders the user-facing operation record from VERIFIED declarations, never from prose; matching is order-free; hiding = leftover act, lying = unsupported claim, and the denial names the tool; a vetoed attempt is itself valid proof approval was asked; the record ships on every turn. Every act of the turn carries an engine-minted identity; declarations are matched against those acts and a claim matching no act is a deterministic deny — a fabricated outcome has no identity to stand on. Whether the MODEL references acts by id is a design choice priced under R10.4 (protocol re-measurement on local tiers); the identity itself is engine-internal law. The design also homes the STRUCTURAL lie check: extract the entities the reply states as done and set-difference them against the records (deterministic) — the judged lie question is model-dependent (measured 8/11 on the reference model, 0–2/11 on light tiers) and a deterministic replacement held to the same acceptance bar retires it. Every declaration is TARGET-BOUND (a targetless claim grounds nothing), and every outcome word has a DEFINED evidence class: `refused`/`blocked` require a recorded refusal or veto event — an addressed read alone never licenses them — and a declared figure corroborates against declared fields, never key-blind against any numeric leaf. A prose-improvement pass sits ABOVE the deterministic floor and can only improve delivery, never carry honesty: with the pass off or answering wrongly, the record still ships and still contradicts the lie. The replacement's acceptance bar is concrete: honest damage 0 on EVERY model (non-negotiable), detection at the reference floor on at least 3 models of DIFFERENT developers. |
| R5.4 | **Downgrade-to-simulation.** An unapproved destructive call becomes its own side-effect-free preview (when the surface supports it — R3.3/R3.4), and the approval question is born from that preview. |
| R5.5 | **Sensitive data.** Declared fields are omitted/masked at every seam — tool results, call args, stored records, delivered text; free-text scrubbing applies only to model-authored prose and only via declared/collected values, never a shape guess over arbitrary text. The filtered form is the ONLY stored form: masking runs once, before an act is recorded, so history, honesty, disclosure, delivery and the wire read safe data by construction — a raw copy never exists downstream of the seam. |
| R5.6 | **Rule ordering + determinism.** Agent-authored rules outrank change-window rules outrank consent outrank honesty outrank universal rules (the agent-vs-change-window boundary is declared OPEN: no real case has ever forced the order between those two — the design keeps it decidable and decides it only when a case forces it); deterministic rules are pure (no I/O, no clock, no model call); the ONLY model-judged escape runs on the session's own model through a structured answer — no interface can carry a third-party judge endpoint (the no-external-model law). The judged answer's format is CLOSED and deterministically readable (fixed tokens or lines — schema-enforced only where the backend has structured output, convention-parsed elsewhere), and UNREADABLE is a first-class verdict priced by the rule's fail mode — never a silent "no violation". |
| R5.7 | **Terminal protocol.** One structured closing channel; premature/superseded closings handled by the engine; bounded correction retries where the FULL violation set persists until fixed (no one-shot enforcement); on exhaustion the engine composes a closure that is a pure function of verified observations — never empty, structurally unable to fabricate, and never "nothing changed" over a write it cannot see. Taught = validated: the terminal channel's description is rendered from the same schema object the validator checks — a taught key the validator rejects cannot exist, on the terminal and on every structured channel the engine teaches the model (one `z.strictObject` serving both uses is the natural form). |
| R5.8 | **Worst-world.** Fixture worlds implement only what the surface documents; being documented in a pipeline-emended file is NOT a license; the engine delivers rendered truth, never raw sensitive data; every state change is attributable to a recorded act. |

## R6 · The guard layer laws (the s15 measured record)

| # | law | the measured why |
|---|---|---|
| R6.1 | Every rule is ONE object carrying both halves: the prose the model reads and the check the machine runs. A tool-scoped rule's prose reaches the model on EVERY execution path — the tool's own description is the channel that survives native/MCP mode. | two homes drift; the pair doctrine is symmetric — prose-without-check collapses on weak models, check-without-prose costs autofails with zero speed gained; the measured MCP hole: host tools passed through with the prose reaching the model through no channel at all |
| R6.2 | Prose ≠ reason: the prose is a followable pre-action RULE (present/imperative, derived from the rule's parameters); it never accuses, never speaks in the past tense. | accusatory pre-action prose measurably drove over-caution (re-asking after an explicit "yes") |
| R6.3 | Parity: a model that obeys the prose literally is never denied; one that violates it literally is always denied. Prose broader than the check is safe residue; prose NARROWER than the check is a defect. | a denied-yet-obedient model learns nothing and burns a retry |
| R6.4 | Checks are pure functions of typed observable state — no clock, no randomness, no network, no model call, no stateful pattern. | one impurity voids determinism silently |
| R6.5 | Guards ALWAYS read the user's text — and never interpret it, nor any other text. The user's text enters a guard as a string to search for EXACT LITERALS only (whole-token, contiguous, whole-value equal): a code the engine minted (consent codes), or a value an argument must carry verbatim. Beyond that literal search, guards read state, calls, results, and the model's own output. A rule that turns on judging meaning is a judged question on the session's own model — never a pattern over conversation text. | the intent-magnet firewall (D3) + prompt-injection defense; literal search, never interpretation, is what keeps the guard layer model- and language-independent |
| R6.6 | The engine ships NO linguistic pattern and accepts none (no regex over reply/request as a validation decision; no shared lexicon module). The ONE exception: a dedicated pattern guard whose entire job is one very specific declared pattern (e.g. PII formats), declared as that guard — never a general text filter. Language-specific judgment belongs to judged questions or to the bundle's own declarations. | multilingual fragility measured; a pattern list is always a partial language; a declared format pattern (PII) is structural, not linguistic |
| R6.7 | Auto-installed rules are exactly the zero-app-knowledge set; everything needing app parameters (labels, quotas, rubrics) is authored — reusing the catalog before writing anything custom, and a custom rule requires a written admission of which catalog kind fails and where. Four judged questions are CANDIDATES for that set — each answerable from evidence the engine already holds, zero domain vocabulary — and the design must consider homing them: a promise off the tool surface (`spec.surface.tools` is the evidence); an instruction arriving inside a tool result (the defense side of R10.6's first attack class); a claim about an earlier conversation (`ctx.history` is the evidence); an ungrounded stated value (the generic half only — WHICH fields count as personal stays domain-authored). | the AS-IS custom-guard sprawl; an auto-schema layer was evaluated and rejected; two hermes-sim specs hand-write these as conditioned prose today |
| R6.8 | `behavior`/prose rules are the declared residue: only what NO check can decide. A prose line restating a checked rule is drift risk and is rejected. | two copies of one rule, only one coupled to the check |

## R7 · Model reality — weak and local models are first-class targets

| # | requirement |
|---|---|
| R7.1 | The subject model may be a small local tier (Qwen via llama.cpp) — the engine's protocol (terminal payload, corrections, consent) must be learnable by it; redrive rates are measured, not assumed. A target declared LOCAL arms the runaway brakes as a set: pinned decoding (explicit temperature and cap — an unpinned GGUF decodes on its embedded sampler, temp 1.0, no cap), a hard output-token cap per generation, and the repeated-call stop. The brakes arm from the DECLARED tier (R4·ASK), never from a hostname heuristic. |
| R7.2 | Bounded everything: tool calls per turn, correction retries, consent-question lifetime — the walls that turn flailing into an honest closure. A forced structured close exists when the model will not close on its own. |
| R7.3 | The prompt is byte-stable and cache-shaped: business-common content shared across a domain's agents with per-agent divergence as late as possible (the shared-prefix law — layout is a measured lever, prompt-cache reuse is paid for by it). |
| R7.4 | Per-agent sampling settings that actually reach the provider (the measured Mastra silent-drop defect), mergeable over conversation-level params. Provider-specific execution modes ship as NAMED engine presets in each provider's own dialect (e.g. Gemini thinking-off via its thinking-budget knob — a knob other providers do not have), measured and verified to reach the wire — never an incantation the author remembers per provider, and never a generic param silently ignored by the wrong provider. |
| R7.5 | **Multi-model execution.** Certifying several models means running several models: the model seat accepts a SET of certified targets with a declared routing strategy — `sequential` (ordered fallback chain), `random` (spread), `rate-limit` (rotate away from a target answering 429/quota), `backup-only` (primary until it fails, then the backup), `round-robin`. Laws of the set: only CERTIFIED targets may enter it (certification is per model — an uncertified model in the seat voids the seal); a switch happens BETWEEN turn attempts, never mid-turn (a failed attempt seals nothing, R2.10, and the retry may route elsewhere); every turn record names WHICH model served it; the judge (R5.6) runs on the model that is serving the session at that moment. |

## R8 · Determinism and identity

| # | requirement |
|---|---|
| R8.1 | You determinize ACCEPTANCE, not generation: the model proposes; the engine disposes. |
| R8.2 | One canonical call identity (order-insensitive on object keys, typed values) backs every duplicate check, licence match, and record lookup. No `JSON.stringify` identity, no serialization-order dependence, no greedy first-fit matching anywhere a valid assignment exists. |
| R8.3 | Concurrent turns on one session serialize; session identity is caller-supplied only (no fingerprint merging of strangers' conversations). |
| R8.4 | Success/effect is keyed on attested facts, not on "the call executed" (`ok` means the call ran, never that the action succeeded). |

## R9 · Host surfaces the engine must keep serving

| # | surface |
|---|---|
| R9.1 | The OpenAI-compatible server facade: governed agents behind `GET /v1/models` + `POST /v1/chat/completions`; the full typed turn meta available to raw-HTTP consumers; a failed turn is an HTTP failure, not a 200. Secure by default: authentication is REQUIRED unless explicitly disabled (never optional-by-omission), and a session belongs to the credential that opened it — a caller can never attach to another caller's session by naming it. |
| R9.2 | The local-model supply chain (`models`): a registry of measured local tiers where every serving fact is DECLARED PER TIER as data — speculative-decoding type (MTP head on the tiers where it pays, measured; absent where draft ≈ token cost), KV-cache precision (f16 as the measured law, q8_0 as a RAM escape hatch), context sized to fit the assembled prompt, and prompt-cache sizing. Serving preserves the R7.3 investment locally: the launch recipe keeps assembled prompts WARM across agent switches (idle-slot RAM cache + context checkpoints + per-agent slot state) — an unwarmed switch is a measured 11–22 s full re-prefill. The runtime behind it is ONE port: llama.cpp is the shipped implementation and MLX/ollama/vllm implement the same single-seam port and plug in unchanged (R2.6). Platform quirks in the measured recipe (macOS DYLD fallback via child env) ship inside the runtime, invisible above the port. Download with integrity and resume. Every declared fact keeps an env escape hatch. |
| R9.3 | Programmatic hosts: construct from the two cards, call one chat entry, receive the whole typed turn record. |
| R9.4 | The exam runner (R4/TEST) as a public, scriptable surface. |
| R9.5 | **Drop-in agent replacement is mandatory.** For each supported host framework (Mastra today; Vercel and LangChain as reserved slots), `LoopRunAgent` IS that framework's Agent — same class contract, same `generate`/`stream` call shape, registrable wherever the host registers agents (`new Mastra({ agents })`, Studio, workflows). A dev swaps the class and the construction takes the two cards; everything downstream keeps working. The only calls that stop working are the ones R2.3 forbids: options that weaken governance. |

## R9-EX · Construction — the canonical host wirings

The two shapes every host dev writes. Both are the SAME class swap (R9.5); the difference is
only where the tools execute.

**Path A — deterministic world (exams, fixtures, declarative domains):**

```ts
const agent = new LoopRunAgent({
  spec,                                   // card 1 — the agent
  contract,                               // card 2 — the domain
  world: (sessionId) => buildWorld(),     // declarative world; executes + attests every call
  toolDefs,                               // the tool surface as data
  model: 'google/gemini-2.5-flash',
});
```

**Path B — the company's live tools over MCP (the most common production case):**

```ts
import { MCPClient } from '@mastra/mcp';

// The HOST owns the connection and the credentials — env/headers, never the cards (R3.8).
const mcp = new MCPClient({
  servers: {
    calendar: {
      url: new URL('https://mcp.acme.com/calendar'),
      requestInit: { headers: { Authorization: `Bearer ${process.env.ACME_MCP_TOKEN}` } },
    },
  },
});

const agent = new LoopRunAgent({
  spec,                                   // card 1
  contract,                               // card 2
  tools: await mcp.listTools(),           // the live host tools; each executes itself,
                                          //   authenticated by closure
  toolDefs,                               // the CERTIFIED intake (gen/tools.json) — reconciled
                                          //   against the live host at construction (R3.8)
  expectedSurfaceHash: CERT.hash,         // certification drift gate: mismatch → throw
  model: 'google/gemini-2.5-flash',
});

await agent.generate('delete the 3pm meeting');   // from here on, plain Mastra
```

What the author never writes: an executor, a port, a hook, a loop. What construction enforces
before any turn runs: surface reconciliation, deny-by-default intersection, the certification
fingerprint (all R3.8 — the fingerprint gate is OPTIONAL: omitted, the agent runs uncertified;
present, a mismatch throws because the seal is void).

**Path B sugar — the connection passed directly (the engine builds the client):**

```ts
const agent = new LoopRunAgent({
  spec,
  contract,
  mcp: {
    url: 'https://mcp.acme.com/calendar',
    headers: { Authorization: `Bearer ${process.env.ACME_MCP_TOKEN}` },  // still host env —
  },                                                                     //   never the cards
  toolDefs,                                 // the certified intake — same R3.8 gates
  model: 'google/gemini-2.5-flash',
});
```

Sugar over Path B, nothing more: the engine constructs the MCP client and lists the tools
itself; the three R3.8 gates and the host-owned credential rule are unchanged by it.

## R10 · The measurement gate

| # | requirement |
|---|---|
| R10.1 | The Atlas exam in `agentspec-bench` scores ≥ 85/100 on the rebuilt engine, or every moved case is argued ill-formed against the baseline layer table (`agentspec-bench/docs/analysis/2026-08-12-atlas-baseline-v020-the-fifteen.md`). |
| R10.2 | Case 72 is the tripwire: the world and invariant are correct; if its verdict changes, something moved that must not have. |
| R10.3 | The eval is the arbiter — no design claim about model behavior stands without a measured run; a flip inside the noise band is a near-tie, not a defect. Any wording change to a judged question or an engine sentence is measured on at least TWO model families before it ships, honest-damage reported beside detection — a wording change measured on one model is noise wearing the clothes of an improvement. |
| R10.4 | Known re-measurement duties carry into the design's risk register: new terminal payload redrive rates on local tiers; consent-turn transcript shape; engine sentence changes; the prompt-cache claim — the measured cache-read share is 19.6% of input against a prefix designed to be case-invariant, so the rebuilt engine (byte-stable frozen prompt, R2.9/R7.3) must measure its cache-read share and the cost curve of a LONG conversation (10–20 turns), where the transcript grows and the static prefix does not. |
| R10.5 | The TO-BE design document ships three maps or is not reviewable: (1) a defect map — every AS-IS defect class → the design rule that makes it unrepresentable, with a concrete before/after; (2) an Atlas preservation map — the fifteen baseline cases one by one, where the design addresses each, what is expected to move, case 72 marked as the tripwire; (3) a priced open-risks section — every obligation the runtime cannot enforce, stated plainly, each with WHERE it is caught instead (lint, exam, review). |
| R10.6 | The exam ships a RED battery: adversarial cases as a first-class section, one per attack class at minimum — injection via tool results, injection via user text, record-borne instructions, stale-code replay, licence widening, exhaustion abuse, error-message leakage, cross-session confusion. Red cases run in BOTH variants like any case; a red case that passes only under governance is the measurement working. New attack classes discovered during design or implementation are ADDED to the battery, never fixed silently. |
| R10.7 | **Held-out discipline.** The fix loop iterating against the same exam that certifies is training on the test set (Goodhart). The design addresses a held-out split (or an equivalent mechanism) for the skill's T/S phases — or states in writing that it does not, and why; until it exists, no "cases the fix loop never saw" claim may be published. |

## Rename register — names the TO-BE must not carry

Examples, not an exhaustive list (sources: the AS-IS blueprint's `confusing-names` and
`dubious-status-names` sections; `docs/lessons-learned.md`). A name that does not CLEARLY state
its purpose to a reader who did not build the engine is a defect. The TO-BE picks the new names;
what is registered here is WHY each one fails.

| name today | why it must change |
|---|---|
| `did` / `Intention` / "claims" / "the declaration" | ONE structure under four names; `did` reads as a boolean at every use site |
| `target` (taught) vs `targetName`/`targetValue` (validated) | the respond tool's description teaches a key the validator rejects — a redrive burned on the engine's own advice |
| `tool_called_request_approval` · `any_other_question` · `ask` | three interchangeable encodings of "asking the user"; one vetoed act supports all three |
| `pendingConfirmMustAsk` | a phantom guard kind: named in two headers, exists nowhere |
| `forbidThisTurn` | misnamed by its own catalog doc — the ban holds for the binding's lifetime, not one turn |
| `Dim`: `spatial` / `input` / `run` | five names, three behaviors — these three map to identical hook lists; the distinction enforces nothing |
| `AgentSpec.mode` | undocumented, unvalidated free string; its only consumer echoes it back |
| `scrubTextFields` | dual semantics under one name: field-scoped scrub on results, global regex switch on prose |
| `chain` (session mutex) vs `controls.chains` (flow rules) | two unrelated concepts answering to one word in the same functions |
| world audit outcome `custom` | names the mechanism, not the result — a failing custom executor audits like a succeeding one |
| corrections tag grammar (`'terminal-rejected'`, `'redrive:kind'`, `'output:kind:tool'`, …) | three shapes in one vocabulary; consumers pattern-match per tag |
| `'pass' \| 'FAIL'` + `'unjudged'` + `overall` alias | mixed-case pair; `unjudged` is both placeholder and effective FAIL; free-string verdict with a silent alias |
| `'ungoverned'` vs `'control'` | the same variant under two names in one pipeline — joins require knowing the alias |
| `expectedSurfaceHash` | says neither "certification" nor "throws on drift"; reads like a checksum option |
| `toolDefs` | it is the CERTIFIED INTAKE — the name says "some tool definitions" |
| `stateView` / `modelParams` / `terminalProtocol` / `stopOnRepeatedToolCall` / `redrives` | constructor fields naming mechanisms, not purposes |
| `tookEffect` / `effectInferred` | truth flags whose names do not say who attested them (the R3.6/R8.4 distinction) |
| `internal.ts` ("no-compatibility-promise re-export of the whole machine") | a seam whose name promises nothing and whose content is everything |
| `probe`-family residue (`dryRun` taught as generic) | the lessons-learned register: a simulation parameter is the tool's OWN, under the tool's own name — the engine's canonical word must not leak into tool schemas |

The register is ENFORCED: the TO-BE ships a name gate in the test suite (empty allowlist, running
on every build and release) that bans the retired identifiers — a rename without a gate lasts until
the next borrowed plan reintroduces the old word (measured: the gate caught exactly that, twice).

## R11 · The engine never ships alone

The stone rule, carried into this charter: every TO-BE change to the engine ships with the
matching update to the OTHER TWO artifacts, in the same working session — not "later".

| artifact | what must move with the engine |
|---|---|
| the `agentspec` skill | its `references/**` and its lints — a skill still teaching the old contract generates subjects the new engine cannot serve |
| the docs | README, `docs/tutorial/**` LESSON BY LESSON (the tutorial IS R1.2's one-concept-per-lesson progression — a renamed field or new default rewrites its lessons), `governance/**`, and the source-file headers that state the law |

Scope is two repositories and their benchmark: `looprun`, `agentspec`, and the subject under
`agentspec-bench`. The design's compliance table (preamble) includes this row: for every
authoring-visible change, WHERE the skill and the tutorial absorb it.

## Non-requirements — explicitly out of scope

| item | status |
|---|---|
| True token streaming | out — run-to-completion delivery; a future streaming API streams the composed delivery only |
| Session persistence / cross-process sessions | out — in-memory, per-process |
| Generated end-user docs (skill S2) | out — design-pending in the skill, never emitted |
| Backward compatibility | out — pre-1.0, no external consumers, break freely in one move |
| A third authored card / per-tool contract files | forbidden — R1.1 |

## Mechanical rejection checklist

A TO-BE design is auto-rejected if ANY line below is true:

```
[ ] hello-world needs > ~20 obvious lines, or lesson 1 needs an engine concept
[ ] the author writes any fact twice, or hand-writes an engine/contract object per tool
[ ] any engine class cannot honestly be estimated under 200 lines
[ ] a company tools.json/MCP surface cannot run governed without editing the company file
[ ] any semantics inferred from a name's spelling, description prose, or result shape
[ ] any validation decision runs a pattern over model or user text (the one exception: a declared dedicated pattern guard, e.g. PII)
[ ] an approved/consented call bypasses any non-consent rule
[ ] a consent dead-end exists (unsatisfiable approval loop, or an unbirthable question)
[ ] an unattestable external write can be delivered as confirmed success — or as
    "nothing changed"
[ ] a fact the engine knows reaches the user only through model prose
[ ] identity or matching depends on call order or serialization order
[ ] two turn machines, an import cycle, or a hand-mirrored type exists
[ ] a caller-passable option can weaken governance
[ ] any path can reach a third-party judge model
[ ] a mechanism of R5 has no signature-level home
[ ] a pipeline phase of R4 has no serving surface
[ ] the compliance table is missing, or any row lacks a PASS pointer to a section,
    signature, or diagram (preamble: 100% item-by-item, evidence or FAIL)
```
