# Stage N — NITPICK: adversarial review (5 reviewers + 1 verifier, ≤2 rounds)

Per spec, launch 5 INDEPENDENT reviewers in parallel (subagents; each gets the spec source, the
tool schemas, the docs, and ONLY its own charter). Findings go to one verifier; CONFIRMED →
drafter revises; re-review only the touched surface; hard stop after 2 rounds (remaining findings
are logged in REVIEW.md, the measured loop is the backstop).

The generated domain THEME is reviewed with the specs: every reviewer also receives
`src/agents/<domain>/theme.ts`. N2 audits `coreInvariants` for Bucket-A violations, N4 diffs the
docs' business-common rules against them, N1 confirms `stateBlock` reads projection keys only, and
any `persona` key on a theme is an automatic CONFIRMED finding (the persona-on-spec law — persona
is per-agent, on the spec).

Reviewers convert measured iterations into static ones — each charter targets a failure class the
lineage's first manual generation run hit and could only catch by running evals.

## N1 — MAGNET RED-TEAM (hard block)
Charter: prove any check, scope decision, or directive reads user intent/text — directly, via a
smuggled ctx field, via a regex over the reply that proxies the REQUEST rather than the agent's
CLAIM, or via tool-scoping that only makes sense as intent routing.
Verdict CONFIRMED = release-blocking (the magnet law / S-1 firewall). No fix budget: the construct
is deleted or re-keyed to state.

## N2 — BUCKET-A AUDITOR
Charter: hunt fixed-state assertions in always-rendered prose (behavior lines, precondition
PROSE, directives). Every rule must state its CONDITION, not a snapshot ("no style exists",
"quota is 3"). Flag any line that becomes FALSE in a reachable world state.
(The measured misfire: an unconditioned format directive broke onboarding cases.)

## N3 — COMPOSITION ADVERSARY
Charter: for each gate, construct the SIBLING scenario it could wrongly deny — the legal flow
that shares a prefix with the blocked one (a measured lesson: the fix for one case must not break
its legal sibling). Check gate placement (earliest point where the condition is decidable, not
later), interactions between gates on the same tool, and terminal policies that could trap a
legitimate askUser turn.

## N4 — COVERAGE CRITIC (recall — the metric that matters)
Charter: diff the docs/policies/questionnaire answers against the spec. Emit the list of stated
rules with NO check and NO conditioned prose; classify each as (a) checkable-from-state (must
become a gate), (b) uncheckable (must become conditioned prose + an `// UNCHECKABLE` header note
+ an eval dimension), or (c) out of this agent's scope (must appear in ANOTHER agent's spec —
verify it does). Also: tool-need gaps — jobs the docs promise that need a tool absent from the
surface (a measured lesson: a missing read tool makes the model fabricate).

## N5 — PURITY / FIREWALL LINT (mechanical)
Run the mechanical gate on the generated source: `npx looprun-eval lint <paths…> --spec-laws` —
banned impure tokens (no Date.now/Math.random/new Date/fetch in checks), stateful-regex flags,
the S-1 firewall (no user-text reads), the theme-persona law, plus the config-level spec laws
(persona present, ≤15 tools, no own systemPrompt, caseMap sane). A violation = CONFIRMED finding,
no debate.

**No looprun project (spec drafted stand-alone)?** Run the self-contained lint on the file:
`node scripts/lint-guards.mjs <path-to-spec-or-dir>` — pure node, re-encodes the same banned-token
+ stateful-regex + S-1-firewall + theme-persona rules, exits non-zero on any violation. (In a
project, prefer the full `npx looprun-eval lint --spec-laws`, which also covers the config-level
laws.)

## The verifier
Each N1–N4 finding gets an independent CONFIRMED / PLAUSIBLE / REFUTED verdict — recall-biased:
when unsure whether a coverage gap is real, CONFIRM it (a false fix costs one review round; a
missed rule costs eval iterations). N5 findings skip verification (the lint IS the verdict).

## Output
`REVIEW.md` next to the specs: every finding, its verdict, its resolution (fix commit / rejected
+ why / logged residual). This file is part of the provenance S ships.
