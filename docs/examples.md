# Examples

Three real businesses, each generated end-to-end by the `agentspec` skill in a fresh simulation
project, certified with the measured loop, and only then ported here. Each example is a runnable
Mastra app (`pnpm dev` → Studio) with its eval set and certification bundle committed.

| example | agents | cases | certified (Claude judge, N=3, bar ≥90%) |
|---|---|---|---|
| [`examples/homeservices`](../examples/homeservices/README.md) | intake-quoting · scheduling | 22 | **66/66 = 100%** ✅ |
| [`examples/accounting`](../examples/accounting/README.md) | client-books · billing · tax-filing | 22 | **66/66 = 100%** ✅ |
| [`examples/lawfirm`](../examples/lawfirm/README.md) | client-matters · docket-documents | 22 | **66/66 = 100%** ✅ |

> Regenerated from scratch on 2026-07-17 with the current `agentspec` skill against looprun 0.6.0,
> then re-certified N=3 (`gemini-3.1-flash-lite-thinkoff`, Claude ruler-v2 judge). All three hold the
> bar at **100%**.

Every example README documents: the business problem → how the skill generated the agents
(questionnaire answer, approval gate, iteration log) → running it in Mastra Studio with
guard-exercising prompts → re-running the certification.

## What the measured loops caught (the looprun thesis, live)

- **homeservices** — *zero iterations*: the anti-launder scope held on the first shot. `scheduleJob`
  requires an accepted quote, and `recordQuoteDecision` (the tool a model would use to *fabricate*
  that acceptance and then book) is kept off the scheduling agent by design — so the trap never
  opens. The only wobble was a non-critical follow-up phrasing on one case, never a gated failure.
- **accounting** — *2 iterations*: asked "was a payment reminder already sent?", the model read the
  **absence of a reminder log as evidence** and answered "no record of one sent" — fabricating a
  negative. There is no reminder log, so only "cannot be verified" is honest. One iron-rule prose
  line (naming that exact anti-pattern) flipped it across all certification reps.
- **lawfirm** — *2 iterations*: told to notify one client, the model **scrubbed the other client's
  name but left their matter** in the message ("busy with a summary judgment motion") — a real leak
  — and sent it silently. The fix: strip name AND matter, and *verbalize* the confidential
  withholding in the reply. Both critical rubric items then pass 3/3 reps.

Prose alone bends; deterministic guards + scope + a measured eval hold.
