---
date: 2026-08-08
slug: disclosure
change_kind: runtime
target: —
summary: "The engine states what agreeing to a destructive act would do: one contract-declared sentence per destructive tool, printed above that tool's own consent question, with each slot bound to the read whose result names the approval's subject; the observed call row carries its result on both execution paths"
isolated: 151/151
collective: 34/34
coverage: 20/20
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — The engine states what agreeing to a destructive act would do: one contract-declared sentence per destructive tool, printed above that tool's own consent question, with each slot bound to the read whose result names the approval's subject; the observed call row carries its result on both execution paths

**Scope:** `runtime` · **Date:** 2026-08-08 · **Verdict:** PASS

## What changed
The engine states what agreeing to a destructive act would do: one contract-declared sentence per destructive tool, printed above that tool's own consent question, with each slot bound to the read whose result names the approval's subject; the observed call row carries its result on both execution paths

## Proof cases
No guard KIND is added, removed or changed, so the coverage ratchet is untouched at 20/20 kinds and
every kind keeps all three polarities and its loop case. What changed is the delivered text and the
observed row, and the invariants pinned are:

```
POSITIVE   a disclosed tool's question is delivered under the domain's sentence, slots filled
NEGATIVE   a tool with no disclose entry delivers its question alone, with no placeholder text
NEUTRAL    a slotless sentence and a malformed brace render verbatim — the engine never guesses

BINDING    two calls of one read tool in a turn: the slot takes the one whose RESULT names the
           approval's subject, so a privilege-escalation question cannot name the acting user
           instead of the person being promoted
MISSING    a null value, an absent read, and an approval that names no record all render the
           placeholder; the sentence is never dropped and never renders an empty gap
PATHS      a self-executing tool leaves no world action history, and the slot is served anyway:
           the result rides the observed row, written by the one hook both paths pass through
FAILURE    a refused read stores no result, so it grounds no slot
```

The collective lane is unchanged at 34/34: the disclosure is composed at the single delivery site
that already renders the question, so no guard's verdict, prose or ordering is touched.

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
