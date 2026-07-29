# @looprun-ai/mastra

The Mastra backend for [looprun](https://looprun.ai). `LoopRunAgent` compiles an `AgentSpec` into a
genuine `@mastra/core` Agent: it registers in your Mastra instance and appears in Mastra Studio, with
the guards enforcing on every tool call and reply — a pre-call veto, the terminal protocol, a bounded
no-tools redrive and honest-abstain exhaustion.

```bash
npm i @looprun-ai/mastra @mastra/core ai zod
```

The public barrel exports `LoopRunAgent`, `runSpecConversation` (scripted multi-turn runs, used by
evals) and `worldFromTools` (the world seam for native-tools/MCP mode), and re-exports all of
`@looprun-ai/core` so specs and guards can be imported through this one specifier.

Start with the tutorial:
[01 · Concepts](https://github.com/looprun-ai/looprun/blob/main/docs/tutorial/01-concepts.md) — six
chapters, one running example.
