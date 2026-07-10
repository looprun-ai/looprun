# Examples

Three real businesses, each generated end-to-end by the `agentspec` skill in a fresh simulation
project, certified with the measured loop, and only then ported here. Each example is a runnable
Mastra app (`pnpm dev` → Studio) with its eval set and certification bundle committed.

| example | agents | cases | certified (Claude judge, N=3, bar ≥90%) |
|---|---|---|---|
| [`examples/homeservices`](../examples/homeservices/README.md) | intake-quoting · scheduling | 22 | **65/66 = 98.5%** ✅ |
| [`examples/accounting`](../examples/accounting/README.md) | client-books · billing · tax-filing | 22 | **66/66 = 100%** ✅ |
| [`examples/lawfirm`](../examples/lawfirm/README.md) | client-matters · docket-documents | 22 | **66/66 = 100%** ✅ |

Every example README documents: the business problem → how the skill generated the agents
(questionnaire answer, approval gate, iteration log) → running it in Mastra Studio with
guard-exercising prompts → re-running the certification.

## What the measured loops caught (the looprun thesis, live)

- **homeservices** — the model *laundered a state gate*: `scheduleJob` requires an accepted quote,
  so it fabricated the customer's acceptance with `recordQuoteDecision` and then booked. The
  invariant gate caught it; the fix was scope (the decision tool left the scheduling agent).
- **accounting** — the model *invented an amount* from the unreadable `"4??"` and recorded the
  entry. The forbidden-call gate caught it; one prose iteration naming the anti-pattern fixed it
  across all certification reps.
- **lawfirm** — *zero iterations needed*: the generation-time adversarial review had already
  designed the equivalent traps out (a deterministic `billingIsUserDecision` guard keyed on the
  observed-calls ledger).

Prose alone bends; deterministic guards + scope + a measured eval hold.
