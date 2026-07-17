# lawfirm-example

## Unreleased

### 2026-07-17 — agents regenerated FROM SCRATCH (corrected agentspec skill)

- Re-authored `src/agents/lawfirm/` (theme, lexicon, client-matters, docket-documents) from scratch
  against the corrected `agentspec` skill — the specs are DERIVED from this business's `WORLD-MODEL.md`
  / `tools.json` (no gold-spec copying), showcasing the current released looprun + corrected skill:
  - **Iron-rule blunt conditioned prose** for load-bearing lines (each anti-pattern named as a failure,
    the adversarial confirm-probe caveat inlined ONCE at the theme), load-bearing protocol lines first.
  - **Prompt-budget / dedup**: the domain-common floor lives ONCE in the theme's coreInvariants; each
    spec's `behavior[]` only SPECIALIZES it (never re-declares), keeping agents inside the ~600-tok envelope.
  - **Lifecycle-law block** per agent (matter open→closed terminal; time recorded→billed one-way;
    deadline pending→filed one-way / pending→cancelled; FILED terminal) + **state-wins** truthfulness
    line (now a shared theme invariant) + **name→id** resolution stated for every consumed id.
  - **falseFailureClaimRe** uses the guard-catalog DEFAULT TEMPLATE (attempted-work-failure phrasing
    only) — replaces the prior broad `cannot|unable|could-not-process` regex that would kill honest
    policy refusals (the delivery-stub fail class).
  - Guards paired with prose; args+accessor RUN gates where a world accessor exists (deadline
    immutability, past-date, confidentiality); two-step destructive auto-installed from `destructiveTools`
    (closeMatter, cancelDeadline); `maxCalls(scope:'turn')` for the one-notification cap.
  - PROFILES convention documented in each spec header (RULES+GUARDS never fork per model; default =
    certified natural-prose render).
  - Validated: `tsc --noEmit` clean + `looprun-eval lint --spec-laws` clean. (No eval run — needs API key.)

## 0.0.6

### Patch Changes

- Updated dependencies
  - looprun@0.5.0

## 0.0.5

### Patch Changes

- Updated dependencies [a9357d3]
  - looprun@0.4.0

## 0.0.4

### Patch Changes

- Updated dependencies
  - looprun@0.3.0

## 0.0.3

### Patch Changes

- Updated dependencies [1f46c90]
  - looprun@0.2.1

## 0.0.2

### Patch Changes

- Updated dependencies [01c45ee]
  - looprun@0.2.0

## 0.0.1

### Patch Changes

- Updated dependencies
  - looprun@0.1.2
