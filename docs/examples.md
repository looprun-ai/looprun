# Examples

Three real businesses, each generated end-to-end by the `agentspec` skill in a fresh simulation
project, certified with the measured loop, and only then ported here. Each example is a runnable
Mastra app (`pnpm dev` → Studio) with its eval set and certification bundle committed.

| example | agents | cases | certified | status |
|---|---|---|---|---|
| `examples/homeservices` | — | — | — | pending (simulation phase) |
| `examples/accounting` | — | — | — | pending |
| `examples/lawfirm` | — | — | — | pending |

Every example README documents: the business problem → how the skill generated the agents
(questionnaire answer, approval gate, iteration log) → running it in Mastra Studio with
guard-exercising prompts → re-running the certification.
