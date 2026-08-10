# looprun — the engine

Behavior rules live in `~/.claude/CLAUDE.md`. The directory context for every repo under
`~/Dev/js/looprun/` lives in that directory's own `CLAUDE.md`, which is NOT version-controlled —
so the law below is restated here, where a clone can read it.

## NO EXTERNAL MODEL, EVER — the agent in the session IS the judge

No file in this repository calls a third-party model API. Not for judging a run, not for scoring a
transcript, not for a quick check, not for a probe, and not "just this once" behind a script.

| Forbidden | Required |
|---|---|
| a script that POSTs to `generativelanguage.googleapis.com`, `api.openai.com`, `api.anthropic.com` | the agent in the session reads the transcripts and returns the verdicts |
| `node judge.mjs <dir> <some-model>` | the agent reads `judge-input.part*.jsonl` and writes `verdicts.jsonl` itself |
| "the judge model is configurable, so the default is harmless" | there is no judge model |

**This is not a cost rule and not a quality rule.** Sending a run's transcripts to an outside
provider publishes them, and nobody authorized that. A verdict is also a judgement about this work —
it belongs to the person doing the work and to the agent they are working with, not to a vendor.

**The one thing that is not covered:** the SUBJECT model under test. A benchmark of an agent needs an
agent to benchmark, and that model is the object of the measurement, not a participant in it. It is
named in `ask/targets.json` and it is the only model any run may reach.
