# CONTEXT — provenance of the governance skill

The proof methodology this skill automates — per-guard positive/negative/neutral cases over a scripted
fake LLM and a fixture world, proven both in isolation and collectively (super-agent non-interference),
gated by a computed coverage ratchet — was **developed and validated in a private research harness
before being productized here**. That is the maximum specificity this file records: the method is
portable and it arrives already exercised; the harness itself is not part of looprun and is not
referenced anywhere in this repository.

What is native to looprun:

- The proof suites live in the packages they prove: `packages/core/test/proofs/` (L1 pure-check) and
  `packages/mastra/test/proofs/` (L3 full-loop + collective).
- The shippable testing kit is `@looprun-ai/core/testing` (fixture world + proof types) and
  `@looprun-ai/mastra/testing` (scripted fake LLM + loop runner).
- The record + matrix + gate tooling is `scripts/proofs/*` and the policy is `governance/GOVERNANCE.md`.

Nothing here is speculative — every guard kind's contract is the one in `packages/core/GUARDS.md`, and
the coverage floor is computed from the proofs themselves, so this skill's claims are only ever as
strong as a green `pnpm proofs:run`.
