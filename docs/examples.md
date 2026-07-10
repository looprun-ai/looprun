# Examples

Three real businesses, each generated end-to-end by the `agentspec` skill in a fresh simulation
project, certified with the measured loop, and only then ported here. Each example is a runnable
Mastra app (`pnpm dev` → Studio) with its eval set and certification bundle committed.

| example | agents | cases | certified (Claude judge, N=3, bar ≥90%) | status |
|---|---|---|---|---|
| [`examples/homeservices`](../examples/homeservices/README.md) | intake-quoting · scheduling | 22 | **65/66 = 98.5%** ✅ | done |
| `examples/accounting` | — | — | — | pending (simulation phase) |
| `examples/lawfirm` | — | — | — | pending |

Every example README documents: the business problem → how the skill generated the agents
(questionnaire answer, approval gate, iteration log) → running it in Mastra Studio with
guard-exercising prompts → re-running the certification.

Highlight from the homeservices measured loop: the subject model **laundered a state gate**
(fabricated a customer's quote acceptance with `recordQuoteDecision` to unlock `scheduleJob`);
the deterministic invariant gate caught it and the fix was scope (remove the decision tool from
the scheduling agent) — prose alone bends, guards + scope hold.
