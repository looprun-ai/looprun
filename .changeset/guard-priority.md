---
'@looprun-ai/core': minor
'@looprun-ai/eval': minor
---

A guard binding carries the PRIORITY of the question its guard answers, and a guard id's prefix names
that question.

**@looprun-ai/core**

- `Layer` → `Priority`, with values `agent | changeAllowed | consent | honesty | always`. The `full`
  member is gone.
- `GuardBinding.layer` / `MutatorBinding.layer` → `.priority`. The `opts` of `addGuard`,
  `addReplyCheck` and `addMutator` take `priority` instead of `layer`.
- Bindings sort `agent → changeAllowed → consent → honesty → always`, so an author's own guard
  outranks an engine-installed one on every hook.
- `contract.writeGate` → `contract.changeAllowed`.
- The seven engine-installed ids: `always:noDuplicateCall`, `always:degenerationGuard`,
  `honesty:claimIsGrounded`, `honesty:claimIsComplete`, `changeAllowed:precondition`,
  `consent:confirmFirst`, `consent:destructiveThrottle`. An engine id is its priority and its kind,
  and `addGuard` throws on a repeat of the pair.
- The `confirmFirst` / `destructiveThrottle` catalog category is `consent`, and their source file is
  `guards/consent.ts`.

**@looprun-ai/eval**

- The coverage census demands a case target for every guard priority except `always`. A bundle that
  declares `contract.writeTools` or `contract.changeAllowed` must now exercise the guards those
  declarations install — `honesty:*` and `changeAllowed:precondition` — the same way it already had
  to exercise `consent:*`.
