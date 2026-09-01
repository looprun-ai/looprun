# TO-BE Implementation — Phases 3–6 Build Design

> **SUPERSEDED — 2026-09-01.** The deliverables were built directly on `packages/*` after the
> `856ac18` move (CLI facade, mastra adapter, server, eval's two halves, models, the phase-5
> closing driver) — this route died with the tree it targeted. The standing map remains
> `2026-08-12-to-be-blueprint-v3.md` as amended by the review resolution.

> **Status: OPEN — phases 3–6 unbuilt; parked behind the current program.**

The TO-BE design is `2026-08-12-to-be-blueprint-v3.md`. The cross-phase frame (parallel
tree at `packages/next/*`, one branch per phase, name gate scoped until the swap) is
`2026-08-17-to-be-phase-1-implementation-design.md` §1. Phases 1 and 2 are merged to main
with their gates green. This document designs the build of everything that remains:
**phases 3, 4a, 4b, 5, 6a and 6b** — one spec, one gate per phase, and one implementation
plan PER PHASE, each plan authored when its phase starts, informed by what the prior gate
revealed.

```
 phase │ builds                                        │ gate
───────┼───────────────────────────────────────────────┼──────────────────────────
  3    │ native tool-result seam in core +             │ scripted E2E through the
       │ packages/next/mastra (facade + adapters) +    │ public doors: facade,
       │ packages/next/server                          │ HTTP, MCP, live tools —
       │                                               │ zero network
───────┼───────────────────────────────────────────────┼──────────────────────────
  4a   │ packages/next/eval, static half (targets ·    │ validate + static lints
       │ SubjectLoader · Validator · lints) + the      │ GREEN on the ported
       │ Atlas subject ported in agentspec-bench       │ subject — zero spend
───────┼───────────────────────────────────────────────┼──────────────────────────
  4b   │ eval, execution half (verbs over the run      │ unit proofs per verb +
       │ dir) + packages/next/models                   │ 1–2 scripted E2E threads
───────┼───────────────────────────────────────────────┼──────────────────────────
  5    │ ~zero new code: the measurement               │ Atlas ≥ 85/100 on
       │                                               │ gemini-3.1-flash-lite +
       │                                               │ skill-requirements
       │                                               │ delivered
───────┼───────────────────────────────────────────────┼──────────────────────────
  6a   │ the swap: next/* → packages/*, old engine     │ repo-wide triple gate +
       │ deleted, R11 docs, verification workflow      │ repo-wide name gate green
───────┼───────────────────────────────────────────────┼──────────────────────────
  6b   │ the agentspec skill regenerated + the Atlas   │ skill-authored Atlas:
       │ re-authored BY the skill and measured         │ validate + lints green,
       │                                               │ score ≥ 85 within the
       │                                               │ noise margin of phase 5
```

After 6b, and only after: hermes-sim — last of everything, outside this spec.

---

## 1 · CROSS-PHASE DECISIONS

Inherited from the phase-1 build design, restated because every phase below leans on them:

| decision | consequence here |
|---|---|
| parallel tree `packages/next/*` | phases 3–4b only ADD packages there; main always holds paid gates only |
| one branch per phase | `to-be-phase-3` … `to-be-phase-6b`, merge exactly at gate green |
| name gate scoped to `next/**` until the swap | goes repo-wide inside the 6a swap commit |
| docs and skill untouched until 6a/6b | R11 is paid in 6a (docs) and 6b (skill), never earlier |

New rulings this spec fixes:

| ruling | what it forbids |
|---|---|
| the full Atlas runs ONLY on `gemini-3.1-flash-lite`, the subject model named in `ask/targets.json` | any second model in any measurement seat; any full Atlas on a local model |
| the judge is the agent in the session (the standing law, restated) | a judge model, configurable or not; any file calling a third-party model |
| local models validate the IMPLEMENTATION only | serving smoke per tier (recipe up, warm prompt cache, speculative decoding where it pays, ~50 tok/s); never a campaign |
| the eval surface is VERBS over a run dir | a pausable campaign state machine; a `resume()`; any in-memory state between verbs — the run dir is the only state |
| the dry-run is a TEST, not a feature | gate items dressed as a product capability; in practice no measurement ever dry-runs |

---

## 2 · PHASE 3 — the facade, the adapters, the server

Build order (fixed): **seam in core → adapters → assembly + facade → server → gate
battery.** The seam is the only change that touches merged code; it is paid first, with
the 132 phase-1/2 proofs re-green before any adapter exists.

### 2.1 The native tool-result seam

The engine composes tool results as user-role text; the seam moves rendering to the
ModelPort, where each seat speaks its own dialect:

```
 the engine composes                  │ the seat renders
──────────────────────────────────────┼──────────────────────────────────────
 a typed acts message in the          │ MastraModelPort → the provider's own
 StepInput message sequence           │   tool-call + tool-result messages
 (ordering preserved: the model sees  │ ScriptedModel → ignores it (plays
 what its calls did, inside the turn) │   typed steps by position)
```

The four touch points, verified against main:

| touch | where | change |
|---|---|---|
| `Msg` gains a typed acts member | `packages/next/core/src/contract/vocabulary.ts:62` | `Msg = { role: 'user' \| 'assistant', text } \| { role: 'acts', acts: readonly ActView[] }` |
| pre-loop composition (licensed executions) | `packages/next/core/src/run/turn.ts:115` | the text block becomes the typed acts message |
| in-loop composition (the model's own calls) | `packages/next/core/src/run/turn.ts:149` | same swap |
| `brokenReply` leak list | `packages/next/core/src/cards/catalog.ts:153` | drop `'TOOL RESULTS (engine record):'` — the literal stops existing, so nothing can leak it; `'<tool_call>'`, `'</tool_call>'`, `'<|'` stay |

What the seam does NOT change, verified:

- no test asserts the removed literal (a sweep over `test/` finds zero occurrences);
- `ScriptedModel` never reads its input — the 25 suites that use it keep their meaning,
  only the import path moves;
- `injectionCheck` is a judged guard (a yes/no question about the reply, `catalog.ts:384`),
  not a scanner of the removed block — M6 keeps its substance: the planted note still
  arrives inside a result, now typed.

`ScriptedModel` is promoted from `test/fixtures/scripted-model.ts` to `src/` in the same
task: the scripted member of `ModelChoice` (§2.2) needs it below the mastra layer, and
eval reuses it from there.

**Done criterion for the seam task: the full phase-1/2 suite green with typed messages.**

### 2.2 The scripted seat, without opening the config

`ModelChoice` in the contract leaf is a union of DATA — a port never appears in a public
type, and the facade config stays CLOSED:

```typescript
type ModelChoice = string                       // provider model id (mastra resolves it)
  | { scripted: { steps: readonly ModelStep[];
                  judgeAnswers?: readonly ('yes' | 'no')[] } };

type LoopRunConfig = {                          // the whole key set — closed, no index signature
  spec: AgentSpec; contract?: DomainContract; model: ModelChoice;
  world: WorldCard | McpWorldCard | LiveWorldCard;
};
```

`AgentAssembly` maps the scripted member to `ScriptedModel`; the E2E gate battery enters
through this door. Resolution by measured target or local tier arrives with eval/models in
4b — phase 3 knows only these two members.

### 2.3 `packages/next/mastra`

| unit | one-line responsibility |
|---|---|
| `MastraModelPort` | one generation step per call; `llmParams` verifiably reach the provider; a provider error is a `TurnFailure`, never raw provider text in prose; renders typed acts as native tool messages |
| `HostToolPort` | native/MCP tools behind `ToolPort.call`; the done law is protocol facts only — a tool-level error answers `done:'no'`, a clean write without protocol attestation answers `done:'unknown'`, this port never answers `'yes'` on its own; applies the surface card's declared proxy mapping (rename maps back; compose executes its declared reads and merges) |
| `McpConnect` | `{ url, headers }` (host env, never the cards) → the live tool map |
| `AgentAssembly` | `LoopRunConfig → EngineConfig`, one shot, keyed by the surface card kind: `world` builds locally and derives facts; `mcpWorld` connects first; both live kinds pass `SurfaceGate` (reconcile · deny-by-default · certification) and get `HostToolPort`; never names a port in its public type |
| `LoopRunAgent` | IS a `@mastra/core` Agent: `generate`/`stream` + `guards()`/`excluded()`/`endSession()`; one serializing queue per session |
| `UngovernedAgent` | the same closed config through the factory's ungoverned door; byte-identical prompt; the class NAME is the disarming |

The end state phase 3 exists to create:

```typescript
const agent = new LoopRunAgent({ spec, contract, model: 'gemini-3.1-flash-lite', world });
const out = await agent.generate('cancel booking bk_9', { session: 's1' });
// out.loopRun: TurnRecord — the [CONFIRM xxxxxx] question comes from the SAME engine
// phases 1–2 proved

await Server.start({ agents: { hotel: agent }, auth: { apiKeys: ['k1'] } });
// POST /v1/chat/completions { model: 'hotel', ... } → OpenAI envelope, TurnRecord in meta
```

### 2.4 `packages/next/server`

| unit | one-line responsibility |
|---|---|
| `wire.ts` | OpenAI chat-completion envelopes + SSE of a COMPLETED turn; usage always `estimated: true` |
| `WireSessions` | a typed pair (credential hash, caller session id) in a nested map; naming another caller's session answers 404 |
| `WireHandler` | auth REQUIRED in the type: `{ apiKeys } \| { auth: 'disabled' }` — secure-by-omission is unrepresentable; a failed turn is a typed HTTP failure, never a 200 |
| `Server` | `node:http`, loopback bind default, TTL sweep calls `endSession` |

### 2.5 The phase-3 gate — scripted E2E, zero network

```
 G1 │ the M1 consent case via LoopRunAgent.generate: [CONFIRM xxxxxx] in the
    │ delivery, the approval executes engine-side — the same case phase 2
    │ proved, now through the public door
 G2 │ the same case via HTTP: server up, POST /v1/chat/completions → envelope
    │ + TurnRecord in meta; no key = 401; another caller's session = 404
 G3 │ mcpWorld against an in-process MCP fixture (in-memory transport):
    │ SurfaceGate reconciles, denies by default, one governed call round-trips
 G4 │ liveWorld with host tool fixtures: clean write without attestation =
    │ done 'unknown'; tool error = done 'no'; proxy rename AND compose proved
 G5 │ native-format proof: composed messages carry tool-role results and no
    │ block literal; a note planted in a result still trips the M6 defense
 G6 │ UngovernedAgent through the same door: prompt byte-identical to governed
 G7 │ stream(): the turn governs to completion, THEN the composed delivery flows
```

---

## 3 · PHASE 4A — eval's static half + the subject port

### 3.1 Units (`packages/next/eval`)

| unit | one-line responsibility |
|---|---|
| `targets.ts` | `ask/targets.json` schema + loader; everything DECLARED per target (provider kind, model, key env-var, local tier, runaway brakes) — never inferred from an id's spelling |
| `SubjectLoader` | loads a subject dir (cards, surface card, cases, targets) with structural preflight + the byte-identical prompt proof across ALL presets; records provenance — which engine build each package resolved, verified before any run counts |
| `Validator` | the offline validate, zero spend: schema, references, premise-coherence replay on a FRESH world per phase and per case, disclosure-slot derivability, world laws for every preset; EVERY finding blocks; one blocking set at every entry point |
| `lints.ts` | purity (regex only in its four homes) · prose-residue (a prose guard restating a checked guard is rejected) · name gate (empty allowlist, scoped to `next/**` until the swap) · the guard-coverage census is DEFINED here and executes wherever dumps exist (4b's E2E threads exercise it; phase 5 requires it) |

Concrete — what the gate consumes and returns:

```jsonc
// ask/targets.json — the subject model, the one standing-law exception
{ "targets": [{ "id": "gemini-3.1-flash-lite", "provider": "gemini",
                "keyEnv": "GEMINI_API_KEY", "brakes": { "maxTurns": 12 } }] }
```

```typescript
SubjectLoader.provenance()
// → { '@looprun-ai/next-core': '<resolved build>', '@looprun-ai/next-mastra': '<...>' }

Validator.run(subject)   // a blocking finding, for example:
// { guard: 'disclosure', problem:
//     "binding names read 'getGuest' but no read tool accepts the held target" }
```

### 3.2 The subject port — mechanical, in `agentspec-bench`

The ported subject lives in a NEW directory beside the current one; the current one stays
intact until the swap. Mechanical means the MEANING never changes — only the home of each
fact:

| in the AS-IS subject | goes to (TO-BE) |
|---|---|
| the agent's persona / voice / rules | `AgentSpec` (words only) |
| conversation-global rules | `DomainContract` |
| tool plumbing (effect, target, simulate, label, sensitive) | the world card's data blocks — never the cards |
| exam scenarios | `ExamCase` files (turns + typed approve/decline + `split: 'fix' \| 'held-out'`) |
| the exam's model | `ask/targets.json` |

Port rules:

- where the old vocabulary has no direct equivalent, the port RECORDS the mapping in a
  mapping table inside the subject directory instead of re-authoring the rule —
  re-authoring would change what the ≥ 85 compares;
- **case 72 is the tripwire**: ported byte-for-byte in meaning; any "improvement" to it is
  a port defect;
- the mapping table is a living artifact: phases 5 and 6b update it with every port-level
  correction, and the skill regeneration (6b) inherits it as its skeleton.

### 3.3 The phase-4a gate

`Validator.run(portedSubject)` → zero findings, AND the static lints green (purity ·
prose-residue · name gate · byte-identical prompt across presets). All offline, zero
spend, no model touched.

---

## 4 · PHASE 4B — eval's execution half + models

### 4.1 The surface is verbs over a run dir

There is no campaign state machine, no pause, no `resume()`. Each verb reads the run dir,
does ONE thing, writes files, exits. The run dir is the only state; "resuming" is invoking
the next verb.

```
 eval validate <subject>      # zero spend; the 4a gate, re-runnable anywhere
 eval run <subject> --reps K  # plays cases via ExamRunner; dumps into the run dir
 eval monitor <run-dir>       # typed incidents; an open incident blocks certify
 eval judge-inputs <run-dir>  # writes judge-input.part*.jsonl and EXITS
   … the agent in the session reads the parts and writes verdicts.jsonl …
 eval fold <run-dir> && eval certify <run-dir> && eval seal <subject>
```

### 4.2 Units

| unit | one-line responsibility |
|---|---|
| `ExamRunner` | plays scripted multi-turn cases through the REAL path: constructs a `LoopRunAgent` per case and calls `generate` — no second loop exists; runs governed AND ungoverned variants; the typed approve step reads the open question's code from the records' question fold (issued − consumed − closed across ALL prior `TurnRecord`s); `approve.args` selects among open siblings of one tool — two open siblings and no `args` is a loud case error, never a guess |
| `JudgeInputBuilder` | blind, chunked judge inputs: no variant/model/rep label anywhere, COMPLETE as evidence (user text, rule events, vetoed calls, results untruncated or the truncation declared) |
| `Folder` | folds verdicts under ONE closed vocabulary `pass \| fail \| unreadable`; a missing verdict is a loud FAIL; a conflicting duplicate is a loud divergence; sync joins on canonical-call identity, never `JSON.stringify` |
| `Monitor` | classifies incidents from TYPED `TurnFailure` kinds (never a regex over a message); an unresolved incident blocks certification; a resolution marker is bound to its incident's hash |
| `Certifier` | floor-law certification over K reps PER MODEL; consumes provenance first; held-out discipline (held-out cases excluded from every fix-loop report, included in certification); a case flip inside the noise margin is a near-tie, not a prose bug |
| `Seal` | sha256 over EVERY governed artifact, enumerated from the subject manifest — never a hand-kept list; verify voids on any post-certification change |
| `reports.ts` | the closed report shapes; no `any` on any exported surface |

The typed approve step, concretely:

```typescript
{ id: 'atlas-31', split: 'held-out',
  turns: ['cancel my booking bk_9',
          { approve: { tool: 'cancelBooking' } },   // args only to split open siblings
          'thanks'] }
```

A judge-input line — blind but complete:

```jsonl
{"case":"?","turn":3,"user":"cancel my booking bk_9","reply":"...",
 "acts":[{"call":"cancelBooking","args":{"id":"bk_9"},"done":"yes"}],
 "ruleEvents":["held→licensed"],"vetoed":[]}
```

### 4.3 `packages/next/models`

| unit | one-line responsibility |
|---|---|
| `tiers.ts` | every serving fact DECLARED per tier as `TierSpec` data: speculative-decoding kind, KV-cache precision, context sized to the assembled prompt, warm-slot sizing — each with an env escape hatch |
| `LlamaCppRuntime` | the shipped `ModelRuntimePort`: pinned build resolution, the measured launch recipe (warm prompt cache across agent switches; macOS DYLD via child env), health check bound to the REQUESTED model identity |
| `Downloader` | GGUF pull with HTTP-Range resume AND integrity: size + sha256 verified before rename; a hash mismatch deletes and throws |

### 4.4 The phase-4b gate

Unit proofs per verb and desk, plus 1–2 scripted E2E threads — the dry-run, which exists
only as a test:

```
 unit │ fold: missing verdict = FAIL; conflicting duplicate = divergence
 unit │ monitor: a planted TurnFailure blocks certify until resolve(hash)
 unit │ seal: one changed byte after sealing → verify voids
 unit │ census: an installed guard with no case that fires it = finding,
      │ exercised against the E2E threads' own dumps
 unit │ models: tiers as data · Downloader against a local HTTP fixture
      │ (mid-file resume + corrupted sha256 deletes and throws) · health
      │ check bound to the requested identity — no real model served
 E2E  │ 1–2 threads: a mini-subject (the hostile fixtures packaged as a
      │ subject dir) through the whole verb chain with ScriptedModel and a
      │ canned verdicts.jsonl — proves the seams between verbs close;
      │ proves the MACHINE, not the judging
```

---

## 5 · PHASE 5 — the measurement

**STATUS: CLOSED.** `agentspec-bench/subjects/atlas-next/test/2026-08-19-full100-r2`
certifies 0.95 · 0.95 · 0.95 over three reps at the 0.85 bar, every rep judged in
session, monitor clean, `seal.json` freezing the ten authored artifacts. The
ungoverned twin is `test/2026-08-19-ungoverned/rep1` at 54/100 — a premium of 41
points. `skill-requirements` is delivered, with its worked-out companion
`2026-08-19-authoring-lessons.md`.

Almost zero new code. The sequence, by verbs, nothing waiting in memory:

```
 0 · SMOKE REP: 1 case × 1 rep × gemini-3.1-flash-lite — the real adapter,
     the real judging and the real subject meet HERE, at the smallest
     possible increment, before any campaign
 1 · eval validate <subject>
 2 · eval run <subject> --reps K        (ONLY gemini-3.1-flash-lite)
 3 · eval monitor <run-dir>
 4 · eval judge-inputs <run-dir>
 5 · the agent in the session reads the parts, writes verdicts.jsonl
 6 · eval fold && eval certify && eval seal
```

K is not invented here: it is the K of the v0.20 baseline protocol, read from the bench's
norms configuration — changing K would change what the ≥ 85 compares against.

### 5.1 The three-bin fix discipline

Every phase-5 adjustment falls in exactly one bin; there is no bin for rewording a rule,
weakening a case, or changing meaning:

| bin | what it is | concrete example |
|---|---|---|
| ENGINE | the case failed because the engine is wrong → fix in `packages/next/*`; the subject is not touched | a rep fails because the delivery drops the approval's after-tense → a ConsentDesk defect |
| PORT | the translation is wrong → fix it AGAINST the AS-IS original, update the mapping table in the same commit | the ported card reads "cancel" where the AS-IS rule reads "cancel or modify" → fix the translation, cite the original line |
| APPEAL | the case demands something the baseline layer table calls ill-formed → argue IN WRITING against the arbiter file (`agentspec-bench/docs/analysis/2026-08-12-atlas-baseline-v020-the-fifteen.md`); the case is never edited | the blueprint's own escape: "≥ 85 OR the moved case is argued ill-formed" |

Case 72 intact is the tripwire for the whole discipline.

### 5.2 The local lane — minimal, never blocking the ≥ 85

One smoke per tier, validating only the serving implementation: the recipe comes up and
answers · prompt cache stays warm across agent switches · speculative decoding on where it
pays · ~50 tok/s. No Atlas on a local model, ever.

### 5.3 Gate deliverables

1. certification ≥ 85/100 on `gemini-3.1-flash-lite`, sealed;
2. **`skill-requirements`** — the regeneration charter for 6b, assembled from what the
   window already produced:

| input | produced by | becomes |
|---|---|---|
| the mapping table (old → new home) | the 4a port, updated by every PORT-bin fix | the skeleton of the skill's `references/**` |
| the ported Atlas subject, certified | 4a, proved in 5 | the worked example — real, never invented |
| the PORT/APPEAL-bin decisions | phase 5 | the "authoring mistakes the skill prevents" section |
| the regeneration strategy (§7) | this spec | the execution plan of 6b |

---

## 6 · PHASE 6A — the swap

**STATUS: CLOSED.** The engine carries the published names from `packages/*`; the previous
one is deleted. `pnpm build`, `pnpm typecheck` and `pnpm test` are green repo-wide — 71 test
files — and the three repository gates report clean over the whole tree. The certified
subject loads on the moved engine and re-certifies unchanged: 0.95 · 0.95 · 0.95 at the 0.85
bar, the same five cases failing. The `agentspec` freeze stamp is live.

Four rulings the swap took, none of them in the plan above: the proof-record apparatus is
retired with the suite it counted (the evidence is now the suites `pnpm test` runs); the
tutorial's guard chapter is hand-written, because the new catalog carries no metadata and the
generator's entry point is a retired name; the eval CLI is gone, since its `resume` is the
thing §1 forbids; and `examples/hermes-sim` leaves the workspace carrying a FROZEN stamp
until its own phase.

Writing the tutorial found two engine holes and closed them: the census reported an empty
rewrites list while the compiled agent carried three, and the held-call line wrote its status
word in place instead of reading the resolved wording.

One working session, one plan:

```
 1 │ looprun: move packages/next/<n> → packages/<n>, restore @looprun-ai/<n>,
   │ rewrite import specifiers, DELETE the old engine — one commit; the name
   │ gate and the structural lints go repo-wide inside this commit
 2 │ looprun: R11 — README, tutorial lesson by lesson, governance, the
   │ source-file headers that state the law
 3 │ agentspec: a one-line FREEZE commit in the same session — "FROZEN —
   │ being regenerated for the new engine; do not author against this" —
   │ so nobody is served stale teaching between 6a and 6b
 4 │ bench pins updated to the final package names
```

**Gate:** repo-wide triple gate green · repo-wide name gate green (zero retired
identifiers survive) · bench pins resolve · the freeze stamp is live.

---

## 7 · PHASE 6B — the skill, regenerated and measured

### 7.1 The regeneration strategy

| part of the skill | strategy | material |
|---|---|---|
| `references/**` (the authoring contract) | REWRITE from scratch | the blueprint §2 hello world + the mapping table — amending text that teaches "declare the tool plumbing in the spec" until it reads "there is no plumbing in the spec" produces a patchwork costlier to audit than a rewrite |
| the worked example | REUSE | the ported Atlas subject — real, certified in phase 5 |
| the skill's lints | DELEGATE | call the eval package's Validator and lints instead of duplicating rules — a reimplemented lint is a second truth, and second truths diverge |
| the case-writing methodology | KEEP | how an exam is written does not change; only the vocabulary of the artifacts does |

### 7.2 The comparison loop — phase 5 is the ground truth

The skill's own quality gate: the skill must be able to REPRODUCE the certified subject.

```
 1 │ the skill authors the Atlas from scratch, as an author would, following
   │ only what the skill teaches
 2 │ level 1 (free): the skill-authored subject passes validate + lints, and
   │ the structural diff against the phase-5 reference shows only legitimate
   │ authoring variation (wording) — never a governance fact
 3 │ level 2 (the run): the skill-authored subject runs on
   │ gemini-3.1-flash-lite, same K protocol; score ≥ 85 and within the noise
   │ margin of the phase-5 result; case 72 intact in the authored subject too
 4 │ divergence = a SKILL defect (a teaching gap): fix the skill, re-author,
   │ repeat — the phase-5 reference is FROZEN; touching the measuring stick
   │ voids the comparison
```

**Gate:** the skill-authored Atlas green on level 1 and level 2, and the skill unfrozen in
the same session the gate passes.

---

## 8 · OUT OF SCOPE

- **hermes-sim** — runs LAST, after 6b, by standing ruling; its own plan when its turn comes.
- any second host facade (`@looprun-ai/vercel`, `@looprun-ai/langchain`) — reserved L5
  packages, added later without touching L0–L4.
- token-level streaming on the wire — the declared non-requirement stands; SSE encodes a
  completed turn.

---

## 9 · THE FOUR MANDATORY SECTIONS, MAPPED

| section the law demands | where this spec pays it |
|---|---|
| the measurement | the per-phase gates; the phase-5 certification and the 6b comparison run are the real-trace measurements, run dirs named at execution time |
| the implementation | one plan per phase (3, 4a, 4b, 5, 6a, 6b), authored at each phase start |
| the documentation | phase 6a step 2 — R11 in full: README, tutorial, governance, source headers |
| the skill | phase 6b — regenerated from `skill-requirements`, measured against the phase-5 ground truth |
