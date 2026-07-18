# REVIEW.md — agentspec run provenance (homeservices, stages A→G→E→N)

- **Skill install method:** repo copy at `.claude/skills/agentspec/` (SKILL.md + references/ + scripts/).
- **Inputs used:** the purpose sentence (Q0) + simulated-user defaults — NO external material,
  no gold/certified specs, themes or evals were read (anti-contamination law).
- **Pipeline executed:** A → G1 (tool genesis, isolated; artifacts flowed to the engineers —
  single-pass default) → G2 (world + presets + config wiring) → G3 (evals, debate-validated) →
  E1 (decompose) → E2 (draft ×2) ∥ E3 (theme) → N (5 reviewers + verifier, 2 rounds).
  T (measured loop) and S (certification) are deliberately NOT run in this session.

## Stage A — questionnaire record (verbatim)

| ask | answer |
|---|---|
| Q0 purpose | "Assistant for a home-services company (cleaning, plumbing, electrical repairs): manage service requests, quotes, job scheduling, technicians and customer notifications." |
| A1 tool surface | "none" → G1 tool genesis ran |
| A2 docs / persona | "default" → derived silently: professional, friendly, concise; fictional neutral company name **BrightNest Home Services**; locale English; register = office operations assistant (serves the office team). Derivations logged here per questionnaire.md |

## Stage G1 — tool genesis debate record (Advocate = Toolsmith; 2 independent judges; T=2)

Draft: 17 tools from the dimension decomposition (entities/lifecycles, jobs-to-be-done, honesty
reads, writes/destructive, money-quotas — see `WORLD-MODEL.md`).

| finding | judge | ground | resolution |
|---|---|---|---|
| Notification honesty READ missing ("was the customer notified?" has no read tool → fabrication class) | J1 | completeness/recall | REFINED: added `listNotifications` |
| No tool records the customer's quote decision — blocks the documented main flow (accepted → schedule) | J2 | completeness/recall (lifecycle hole) | REFINED: added `recordQuoteDecision` |
| "customer accepted by phone → book it" would split across agents | J2 | cluster viability (flow-split lesson) | REFINED: `recordQuoteDecision` shared into the scheduling cluster |
| Surface at 19 > the ~14–18 aim after refinements | J1+J2 | redundancy | MERGED: `getQuote` folded into `getServiceRequest` (returns the quote summary); `getJob` stays out (`listJobs` is the job read — avoids a homonym pair) |
| `handle*`-style intent tools | J1 | magnet risk | none present — PASS |
| Deterministic implementability of all tools (pure in-memory, no clock/entropy) | J1 | determinism | PASS |
| Schemas: destructive `confirmed` flag, required[], id patterns, protocol-bearing descriptions | J1 | schema quality | PASS (cancelJob carries the two-step protocol in its description) |

Round 2: both judges AGREE with the refined 18-tool surface → **VALID**. Dropped tools: none.
Artifacts: `tools.json` + `WORLD-MODEL.md`.

## Human gate #1 — approval table (simulated-user defaults applied; recorded in full)

**Agents (E1, by TOOL-NEED — never intent):**

| agent | tools (n) | jobs owned |
|---|---|---|
| `intake-quoting` | listServices, findCustomer, createCustomer, createServiceRequest, getServiceRequest, listServiceRequests, createQuote, sendQuote, recordQuoteDecision, sendNotification, listNotifications (11) | catalog Q&A · customer records · request lifecycle · quote create/send/decision · notifications |
| `scheduling` | scheduleJob, rescheduleJob, cancelJob, assignTechnician, listJobs, listTechnicians, getTechnicianAvailability, getServiceRequest, listServiceRequests, findCustomer, recordQuoteDecision, sendNotification (12) | booking · reschedule · cancel (destructive) · technician assignment/availability · overdue visibility |

Shared read/record tools (allowed to repeat): findCustomer, getServiceRequest,
listServiceRequests, recordQuoteDecision, sendNotification — keeps both documented end-to-end
flows (request→quote→decision; accepted→book/move/cancel) whole inside one agent each.

**Tool surface:** the 18 generated tools of `tools.json` (destructive marked: `cancelJob`).
**Destructive list:** `cancelJob` only — confirm-first + one-per-turn (layer-installed).
**Theme summary:** locale English; voice = BrightNest operations assistant (professional,
friendly, concise); 7 core invariants (anti-fabrication first, honesty-on-failure last, two-step
cancel, professional boundary, confidentiality, scheduling validity, id discipline); personas:
intake-quoting = catalog/customers/requests/quotes/notifications; scheduling =
booking/reschedule/cancel/technicians.
**Free-text row ("any hard rule missing?"):** simulated user replies "ok" → APPROVED as derived.

## Stage E — engineering decisions

- Layers: `intake-quoting` = AgentSpecMinimal (no destructive tool); `scheduling` = AgentSpecBase
  (cancelJob) — nothing the layers install was hand-added.
- No `flow` edges emitted: the trunk renders flow as "call the tools in THIS order — do not skip a
  step", a standing directive that misfires on read-only turns (Bucket-A pre-emption); the
  ordering that matters is carried conditionally by `requiresBefore` proses under Tool rules.
- Anticipated measured lessons at draft time: shared `pendingConfirmMustAsk` +
  `destructiveClaimRequiresSuccess` (probe/negation exemptions) instead of ad-hoc claim regexes;
  "act directly" prose for non-destructive actions; end-to-end flows kept in one agent.
- DROPPED during self-check at draft time: a `noPhantomQuoteSend` reply-regex for the intake agent
  — it cannot distinguish "sent THIS turn" from "was already sent" (quote status is 'sent' in
  both), the exact claim-regex dead end of the guard-catalog math (rule 3). Honesty there is
  language-layer: conditioned prose + eval cases 04/05/06.

## Stage N — adversarial review record (5 reviewers + verifier, 2 rounds)

| id | reviewer | finding | verifier verdict | resolution |
|---|---|---|---|---|
| N1-1 | magnet red-team | all checks read args/world/observed/reply-claims only; stateBlock reads projection() keys; no intent-keyed scoping | — | NO FINDINGS (release not blocked) |
| N2-1 | Bucket-A auditor | all behavior lines + precondition proses state their CONDITION; theme invariants are protocol/never rules, no state snapshots | — | NO FINDINGS |
| N3-1 | composition adversary | scheduleJob veto chain (requiresBefore → acceptedQuoteRequired) costs redrive steps before the correct refusal | PLAUSIBLE | ACCEPTED (corrections converge; maxSteps 16 headroom) |
| N3-2 | composition adversary | rescheduleJob deliberately has NO requiresBefore(availability) — the legal direct-move sibling (case 18) must not be denied; the world still validates the slot | REFUTED (as designed) | logged |
| N4-1 | coverage critic | "never book/move into the past" is checkable-from-state (args.date vs projection().today) but had NO gate | **CONFIRMED** | FIXED: `noPastDate` custom preTool guard on scheduleJob+rescheduleJob, prose+check pair (scheduling-spec.ts) |
| N4-2 | coverage critic | confidentiality (theme invariant 5) has no eval case | PLAUSIBLE | ACCEPTED residual (case budget at 22 cap; logged in EVALS.md) |
| N4-3 | coverage critic | one-active-quote create-side rule has no dedicated prose line | REFUTED | covered by the generic honest-failure bullet + world error + cases 06/08 |
| N4-4 | coverage critic | notification tools lack a dedicated case | PLAUSIBLE | ACCEPTED residual (no stated rule keys on them; cap guard exists) |
| N5-1 | purity/firewall lint | `looprun-eval lint src evals --spec-laws` + portable `lint-guards.mjs` | — | CLEAN (0 violations, before and after the N4-1 fix) |

Round 2 (touched surface only — the `noPastDate` guard): N1 clean (args+projection only),
N2 clean (conditioned prose), N3 clean (today-date booking still allowed: `<` not `<=`;
malformed dates abstain to the world's own validation). **Review closed after round 2.**

## Residuals accepted at N (for human gate #2 at stage S)

1. Confidentiality invariant: prose + judge-rule coverage only (no dedicated case).
2. Notification tools exercised only incidentally.
3. Language-layer honesty on "already sent" phrasing rides prose + eval, not a reply-regex (the
   claim-regex would block honest replies — measured dead end).

## Gates (all green at review close)

- `npx looprun-eval lint src evals --spec-laws` → clean
- `npx looprun-eval check` → green (WARN: GOOGLE_GENERATIVE_AI_API_KEY not exported in the lint
  shell — the key lives in `.env` for the run stage; not a config defect)
- `npx tsc --noEmit` → clean
- `node .claude/skills/agentspec/scripts/lint-guards.mjs src/agents/homeservices evals` → clean

## Next (not run here — cost control)

Stage T: `npx looprun-eval run` (N=1 screen) → LLM-judge → classify → fix (≤3 iterations) →
Stage S: `npx looprun-eval certify` (N=3, bar ≥ 0.90).

## Measured loop (Stage T) — iteration log

**Screen r0 (gemini-3.1-flash-lite-thinkoff, N=1): 19/22 = 86.4%** (invariant autofail: 13; judge fails: 11, 20).

- **Iteration 1 — class 3 (scope):** case 13 failed because the model LAUNDERED the accepted-quote
  gate: with `recordQuoteDecision` in the scheduling surface (and the guard's own deny prose
  inviting it), it recorded a fabricated acceptance and then booked. Fix: removed
  `recordQuoteDecision` from scheduling (only case 09 — intake — requires it), rewrote the deny
  reason + behavior line to route out-of-band acceptances to intake. Re-screen: 13 PASS.
- **Iteration 2 — classes 4+5 (prose + claim gate):** case 11 — the scope prose existed but did not
  hold; strengthened it AND added a deterministic `noFabricatedSuccess({ banRe })` cancellation-commitment
  gate (safe here by construction: intake has no cancel tool, so ANY commitment form is out of
  scope; negation/handoff phrasings do not match). Case 20 — added the conditioned skill-filter
  prose (empty skill-filtered roster ≠ person does not exist; read the full roster first).
  Re-screens: 11 PASS, 20 PASS.

Screening aggregate after iterations: 22/22. STOP rule respected — no further prose edits. → Stage S (certify N=3).

## Stage S — certification (human gate #2)

**N=3 vs gemini-3.1-flash-lite-thinkoff: 65/66 = 98.5% → CERTIFIED** (r0 100%, r1 100%, r2 95.5%).
Zero invariant auto-fails across all 66 runs. The single fail (02-new-customer-request#r2,
`records-created`: reply confirmed the request id but not the customer id) is a partial-rep
completeness coin — passed 2/3 reps, no 0/3 deterministic fail → accepted as residual per the
language-coin class. Bundle: eval-results/2026-07-10-homeservices-cert/.
