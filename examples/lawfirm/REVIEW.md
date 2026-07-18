# REVIEW — provenance of the lawfirm bundle (agentspec skill, stages A→G→E→N)

Run date: 2026-07-10. Executor: the coding agent running the agentspec skill (single-pass — the G1 artifacts flowed to
the engineers per the measured default). The measured loop (T/S) has NOT run yet; this file covers
authoring + adversarial review only.

## Install method / inputs (anti-contamination statement)

- Skill install: repo copy at `.claude/skills/agentspec/` (SKILL.md + references/ + scripts/).
- Inputs used: (1) the skill's own reference files, (2) the `looprun` / `@looprun-ai/eval`
  node_modules import surfaces (type declarations + CLI + guard implementations), (3) the
  simulated user's answers below.
- NO external material: no gold/certified specs, themes, or eval sets were read; every business
  string in this repo was derived fresh from the purpose sentence. (The skill's
  `references/spec-template.ts` is a fictional plant-nursery domain — format only.)

## Stage A — questionnaire (simulated user, answers verbatim)

| ask | answer |
|---|---|
| Q0 purpose | "Assistant for a small law firm: manage clients, legal matters, documents, court/filing deadlines and billable time entries." |
| A1 tool surface | "none" → G1 tool genesis ran |
| A2 docs/persona | "default" → derived silently: professional, careful, confidentiality-aware; neutral firm name **Hartwell & Vega Legal**; users = firm staff; locale = English |

Derived silently (per questionnaire.md): destructive candidates from verbs/`confirmed` flags
(closeMatter, cancelDeadline); reply language English; flow edges from produces/consumes pairs;
topology from E1 clustering (below).

## Preflight

`npx looprun-eval init --domain lawfirm` scaffolded `looprun.eval.config.ts` + `evals/` — the stub
was then REPLACED with the real wiring (SPECS/THEME/worldFactory/TOOL_DEFS/CASES/CASE_MAP).

## G1 — tool genesis (isolated draft → BARRED debate, 2 independent judges, T=2)

Artifacts: `tools.json` (**19 tools** — 17 drafted + 2 debate-mandated) + `WORLD-MODEL.md`.

**Round 1: both judges DISSENT.** Confirmed findings and refinement 1:

| finding (judge) | resolution |
|---|---|
| Billing lifecycle dead-end: `billed` gates closeMatter but no tool sets it — matters with time entries permanently unclosable (J1 blocker, J2 central defect) | ADDED `markTimeEntriesBilled(matterId)`; invoice itself documented as the accounting system's job |
| No notification read → fabrication risk (J1 high) | ADDED `listNotifications(clientId?)`; busy-docket preset seeds ntf_801 |
| `conflictFlagged` had no setter — unreachable state (J1 medium, J2 confirmed) | REMODELED: conflicts are DERIVED (party is an opposing party on a firm matter, or prospective opposing party is an existing client) — no stored flag; runConflictCheck stays honestly read-only |
| `markDeadlineFiled` irreversible without confirm (J1 high; J2: keep non-destructive, document the edge) | KEPT non-destructive with the rationale in the description + verify-first instruction + the unreconstructable past-due warning |
| Cancelled deadline state invisible to reads (J2) | listDeadlines/getMatter show status pending/filed/cancelled; world rule 11 |
| Probe-vs-validation order undefined (J2) | Documented + implemented: validation precedes the probe |
| updateClient / rescheduleDeadline / deleteTimeEntry missing (J1 medium, J2 lower) | NOT added: documented out-of-scope with the honest-refusal path; judge-prompt.md makes refusal + routing the passing behavior |
| Schema minors: hours min/max, email pattern, docType enum, withinDays min, notifyClient "preference" phrase, date-math wording, id-collision rule (both) | ALL fixed; `confirmed` kept optional (absent ≡ probe, fail-safe — J2's "recommend, don't demand") |

**Round 2: both judges DISSENT narrowly with converging required fixes** (all round-1 blockers
cured; grounds 1/2/3/5/6 AGREE for J1). Refinement 2 (final — convergence, no further round):

| round-2 finding | resolution |
|---|---|
| `markTimeEntriesBilled` irreversible/financially consequential and ungated (J1 F1; J2 #1) — gate it two-step OR justify + one-way description | Took the offered OR-branch on BOTH judges' terms: description now states ONE-WAY nature + review-first + bill-only-when-asked; WORLD-MODEL rule 9 carries the rule-5-style justification (records a user's bookkeeping decision vs destroying work product); the spec layer adds `requiresBefore(listTimeEntries)` + the `billingIsUserDecision` anti-laundering gate. Two-step confirm NOT added — it would break the act-directly law on the explicit "bill then close" single-turn request (guard-catalog rule 5; the eval is the arbiter) |
| closeMatter failure text routed the AGENT to bill ("bill them first with markTimeEntriesBilled") — deny-prose must route the USER (J2 #1) | FIXED in world.ts error text ("ask the user how to proceed"), tools.json + tools.ts descriptions ("report the amount and ask the user — billing is the user's decision"), and WORLD-MODEL rule 3 |
| Tool-count claim 18 vs actual 19 (J1 F5; J2 #2) | RECONCILED: 19 documented in WORLD-MODEL (17 drafted + 2 debate-mandated; both agents ≤15 — 11 and 12) |
| Conflict-derivation semantics unpinned: closed matters? name matching? (J1 F2; J2 #3) | PINNED in WORLD-MODEL: exact match after trim+case-fold normalization; opposing parties on CLOSED matters still conflict (implementation already matched) |
| Contactless-client preset exercising rule 10 (J2 #4) | ALREADY PRESENT: busy-docket `cl_iris` has no email/phone; eval case 18 exercises it; WORLD-MODEL preset row now says so explicitly |
| Contactless dead-end note (J1 F3) / all-or-nothing billing (J1 F4) | Documented-path accepted by the judge; createClient accepts email/phone at capture; contact EDITS stay out-of-scope (office manager) |

**G1 verdict: VALID at convergence** (both judges' round-2 required fixes applied; both signaled
all structural grounds cured).

## G2 — world/presets/config

- `src/world/world.ts` — `LawFirmWorld` + `worldFactory(preset, seed)`; fixed
  `REFERENCE_NOW = '2026-07-01T09:00:00.000Z'`; pure integer date math (no Date object); probes
  side-effect-free; validation precedes probe; `advanceTurn()` = turn counter only; terminal tools
  acknowledged in `exec`; `{success:boolean,...}` results; `requiresConfirmation:true` on
  destructive probes; deny texts route the USER. Guard accessors: isMatterOpen, matterExists,
  deadlineStatus, matterUnbilledHours, todayStr, clientDirectory, matterClient.
- `src/world/presets.ts` — 8 boundary presets (fresh-intake, conflict-prospect, imminent-deadline,
  unbilled-hours, closed-matter, filed-deadline, busy-docket, empty-docket).
- `src/world/tools.ts` — TOOL_DEFS mirroring tools.json (19 tools).

## G3 — eval generation

22 cases (11 per agent), boundary-biased across the 8 axes; debate record + dimension map in
`evals/EVALS.md`. Judge 2: VALID 22/22 round 1. Judge 1: round-1 dissent on case 16 → 3
refinements (16 reworded per the judge's formulation; 10 softened; 02 trimmed + hardened with
forbidden createClient) → **round 2: 02/10/16 all VALID — OVERALL VALID**; title of 16 also
cleaned (nit). `evals/judge-prompt.md` = domain RULES only. Independence: cases authored before
any spec existed; the post-E2 UNCHECKABLE sweep added no case (rules already covered: 10, 22).

## E1 — decomposition (human gate #1 table; simulated-user default = approved as derived)

| agent | tools (n) | jobs owned | destructive |
|---|---|---|---|
| `client-matters` | createClient, listClients, getClient, runConflictCheck, openMatter, closeMatter, listMatters, getMatter, recordTimeEntry, listTimeEntries, markTimeEntriesBilled (11) | intake (conflict check → register → open), matter reads, record/bill time, close-matter flow (bill→close whole in one agent) | closeMatter |
| `docket-documents` | createDeadline, listDeadlines, markDeadlineFiled, cancelDeadline, registerDocument, listDocuments, notifyClient, listNotifications, listClients, listMatters, getMatter, getClient (12) | docket lifecycle (create → file / cancel), documents, reminder job (window read → notify), notification reads | cancelDeadline |

Shared read-only tools (listClients, listMatters, getMatter, getClient) repeat across agents by
design (listClients added to docket per N4 — the notify-by-name flow needs the same locate read
the eval's own goldSeq implies); every write has ONE owner. Both agents ≤15; clustering by
TOOL-NEED (both G1 judges' cluster dry-runs converged on this split). Destructive list:
closeMatter, cancelDeadline (two-step `confirmed`). Theme summary: locale English; invariants =
anti-fabrication, id discipline, two-step destructive, professional boundary, confidentiality,
validity walls, honesty-on-failure; personas = one role line per agent (on the spec).
Free-text row ("any hard rule missing?"): simulated default — 'ok'.

**Gate #1 status: approved with simulated-user defaults (per the task brief).**

## E2/E3 — drafting notes (the load-bearing choices)

- Both specs are `AgentSpecBase` (each owns one confirmed-flag destructive tool); nothing a layer
  installs was hand-added.
- **The KNOWN PITFALL (gate laundering) was designed out**: closeMatter's unbilled gate CAN be
  cleared by `markTimeEntriesBilled`, which the same agent owns (the flow must stay whole —
  bill→close is the firm's intended protocol). Mitigations: (1) world + tool deny/description
  prose routes the USER and never instructs the agent to bill; (2) conditioned spec prose: report
  the amount and ASK — never bill unless the user asked; (3) the deterministic
  `billingIsUserDecision` preTool gate denies markTimeEntriesBilled in any turn where a
  closeMatter attempt for the SAME matter already failed (the laundering signature, keyed on
  observed calls — no user text), with recovery-ordering steering in the deny text (bill FIRST
  after approval, then re-attempt the close). The legal sibling ("bill the hours, then close it")
  bills FIRST, so the gate never fires on it.
- Claim reply-checks are negation/probe/status-aware: `destructiveClaimRequiresSuccess` with
  domain claimRe + exemptRe covering honest failures AND truthful status reports ("is/was
  closed|cancelled" — N3 F4), `pendingConfirmMustAsk`, and a custom `noPhantomNotification` whose
  failure-phrasing + history-read (listNotifications) exemptions run BEFORE the affirmative regex
  (measured lessons 1–2, 8; N1 aside; N3 F3).
- Deterministic confidentiality half: `confidentialNotification` preTool gate denies a
  notification whose message names ANY other client (clientDirectory) or references a matter id
  the recipient does not own (matterClient) — the wording half stays language-layer
  (`// UNCHECKABLE` + eval 22).
- No standing directives; every rule is a precondition/gate or conditioned prose. No terminal
  policy (askUser stays legal).

## N — adversarial review (5 reviewers + verifier; round 1 findings → fixes → gates re-run)

| reviewer | verdict | resolutions |
|---|---|---|
| N1 magnet red-team | **CLEAN, FINDINGS: 0** (all checks/scopes read args/world/observed/reply only; reply regexes are claim-proxies; decomposition is tool-need). 4 precision asides | 2 asides fixed (noPhantomNotification history-read exemption; billingIsUserDecision same-matter keying); 2 logged (full-name substring match OK on shipped presets; `\?` exemption intentional per catalog) |
| N2 Bucket-A auditor | **FINDINGS: 4** (F1/F2 "the tool returns a confirmation question" asserted unconditionally in both specs; F3 phantom example ids inside the theme's id invariant; F4 invariant 3 presupposed a question exists) | ALL FIXED: both bullets + invariant 3 now conditioned ("when it returns a confirmation question…"); invariant 2 rewritten to id PREFIXES only |
| N3 composition adversary | **FINDINGS: 4** + 5 advisories | F1 (billingIsUserDecision aliasing + under-steering) FIXED: same-matterId keying + aliasing-safe deny text + bill-first-then-reattempt ordering hint; F3 (noPhantomNotification vs truthful history reads) FIXED: listNotifications exemption; F4 (status reports vs claim regex) FIXED: is/was/remains-status exemptions both specs; F2 (library destructiveThrottle counts probes — consented re-probe-then-confirm costs +1 turn) ACCEPTED residual (library-owned, rare path, safe direction). Advisories A1–A5 logged below |
| N4 coverage critic | **FINDINGS: 9** (recall gaps) | ALL ADDRESSED: hours-range input gate; requiresBefore(listTimeEntries) on billing; fileOnlyPending status gate; out-of-scope conditioned prose in both specs (+UNCHECKABLE notes); reschedule-in-place prose (docket); matter-id ownership added to the confidentiality gate (+ world.matterClient); listClients added to docket surface; empty-read honesty prose (client-matters) |
| N5 purity/firewall lint | `npx looprun-eval lint src evals --spec-laws` clean; portable `lint-guards.mjs` 5 files clean (re-run after every fix round) | none needed |

Verifier verdicts: every N2/N4 finding CONFIRMED (recall-biased); N3 F1/F3/F4 CONFIRMED, F2
CONFIRMED-but-accepted (library layer); N1 asides treated as PLAUSIBLE precision fixes (2 applied).
Re-review of the touched surface = the mechanical gates (N5) re-run green; hard stop after this
round (the measured loop is the backstop).

### Logged residuals (accepted, for human gate #2 at Stage S)

- destructiveThrottle counts success-true probes → a same-turn "re-probe then confirm" after
  consent costs one extra turn (library behavior; safe direction). (N3 F2)
- confirmFirst / conflict-check gates are not arg-keyed: a probe/check for X procedurally
  legalizes an action for Y — the WORLD re-derives and fails real violations, prose carries the
  procedure. (N3 A1/A2)
- confidentialNotification: full-name substring matching has a latent wrong-deny only if a
  mid-conversation createClient mints a name-prefix collision (unreachable on shipped presets);
  surname-only mentions pass deterministically and remain covered by prose + eval 22 + the judge.
  (N1 aside, N3 A3)
- One-notification-per-turn paces multi-recipient jobs across turns. (N3 A4)
- Base guards run before filedIsImmutable on a doomed filed-cancel → extra intra-turn steps only.
  (N3 A5)
- Theme coreInvariant 1 names read tools of both agents (trunk-static by design — byte-identical
  head across the domain's agents; not a state snapshot). (N2 note)

## Acceptance gates (final run, all green — outputs verbatim)

```
=== GATE 1: looprun-eval lint --spec-laws ===
lint: clean
exit=0
=== GATE 2: looprun-eval check ===
WARN: GOOGLE_GENERATIVE_AI_API_KEY is not set — `looprun-eval run` with the default gemini subject will fail.
check: green — /Users/marcos/Dev/js/looprun/lawfirm/looprun.eval.config.ts
exit=0
=== GATE 3: tsc --noEmit ===
exit=0
=== GATE 4: lint-guards.mjs ===
✓ guard purity lint: 5 file(s) clean (banned-token + stateful-regex + S-1 firewall + theme-persona)
exit=0
```

(The GATE 2 warning is environmental — `.env` carries the key; the CLI reads the shell env only.
It does not block `check`, and `looprun-eval run` was NOT executed per the run scope A→G→E→N.)

## What remains (Stage T/S — not in this run's scope)

`npx looprun-eval run` (N=1 screen) → LLM-judge → classify/fix per the taxonomy → ≤3
iterations → `certify` (N=3, bar ≥0.9) → human gate #2 on the residuals above.

## Measured loop (Stages T+S)

**Screen r0 (gemini-3.1-flash-lite-thinkoff, N=1): 22/22 = 100%** — zero invariant fails, zero judge
fails, zero fix iterations needed (the generation-time adversarial review + the designed-out
gate-laundering paid off).

**Certification (N=3): 66/66 = 100% → CERTIFIED.** Zero invariant auto-fails; every critical rubric
item passed in all reps (destructive two-steps, filed-deadline immutability, closed-matter refusals,
confidentiality: rep 0 sanitized message / reps 1-2 refusal+rewrite — all compliant under the domain
rules). Bundle: eval-results/2026-07-10-lawfirm-cert/.
