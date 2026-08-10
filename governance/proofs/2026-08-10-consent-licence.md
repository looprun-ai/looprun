---
date: 2026-08-10
slug: consent-licence
change_kind: runtime
target: —
summary: "The consent licence is the call: an approval stores the call's own arguments and mints its literal from them; claimIsGrounded/claimIsComplete walk the engine-derived act list instead of electing identities by key name; pending_confirmation splits into tool_called_request_approval and any_other_question; the exhaustion route prints every standing question"
isolated: 151/151
collective: 34/34
coverage: 20/20
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — The consent licence is the call: an approval stores the call's own arguments and mints its literal from them; claimIsGrounded/claimIsComplete walk the engine-derived act list instead of electing identities by key name; pending_confirmation splits into tool_called_request_approval and any_other_question; the exhaustion route prints every standing question

**Scope:** `runtime` · **Date:** 2026-08-10 · **Verdict:** PASS

## What changed
The consent licence is the call: an approval stores the call's own arguments and mints its literal from them; claimIsGrounded/claimIsComplete walk the engine-derived act list instead of electing identities by key name; pending_confirmation splits into tool_called_request_approval and any_other_question; the exhaustion route prints every standing question

## Proof cases
The guard KIND set is unchanged — `confirmFirst`, `claimIsGrounded` and `claimIsComplete` keep their
kinds — so the coverage ratchet is untouched at 20/20 kinds and every kind keeps all three polarities
and its loop case. What changed is what licenses a destructive act and what grounds a declaration, and
the invariants pinned are:

```
POSITIVE    a vetoed destructive call opens a question whose literal is derived from the call, and
            the typed literal licenses exactly that call
NEGATIVE    the same tool called on a different record asks a different literal, and a consent typed
            for one never licenses the other; a declaration no act supports is denied
NEUTRAL     the same call written with its keys in either order is ONE licence — the canonical
            arguments decide, never the serialization order
GROUNDING   a vetoed attempt supports `tool_called_request_approval`; `any_other_question` grounds
            as speech, and an effected write still prints its own operation record line beneath it
EXHAUSTION  a turn that dies exhausted still prints every standing question, exactly as the clean
            delivery route does
```

The collective lane is unchanged at 34/34: the licence is minted and consumed at the same runtime
seams that already owned it, so no guard's verdict, prose or ordering moves relative to another.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 151/151 |
| collective | 34/34 |
| ratchet | 40/40 |
| coverage (kinds fully proven) | 20/20 |
| **all** | **388/388** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
