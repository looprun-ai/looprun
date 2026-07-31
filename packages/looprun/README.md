# looprun

The umbrella package for [looprun](https://looprun.ai), a governance layer for LLM agents on top of the
agent framework you already use. It bundles core, the Mastra backend and the model story behind four
subpaths — `looprun/core`, `looprun/mastra`, `looprun/models`, `looprun/vercel` — and installs the
`looprun` CLI (`looprun init`, `looprun models status|pull|serve`).

```bash
npm i looprun @mastra/core ai zod
```

The root export is `@looprun-ai/core` (framework-free). `looprun/mastra` is the backend that ships
today; `looprun/vercel` is reserved and its factory still throws. The certification harness
(`@looprun-ai/eval`) is deliberately outside this package — it is a dev tool.

Start with the tutorial:
[01 · Concepts](https://github.com/looprun-ai/looprun/blob/main/docs/tutorial/01-concepts.md) — six
chapters, one running example.
