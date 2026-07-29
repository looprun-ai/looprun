# @looprun-ai/models

The model story for [looprun](https://looprun.ai): validated local models (Qwen3.5-4B and
Qwen3.6-35B-A3B on [llama.cpp](https://github.com/ggml-org/llama.cpp), with measured launch flags)
behind a `ModelRuntimePort`, plus the cloud validation model — gemini flash-lite with thinking off,
which needs the numeric `thinkingBudget: 0` rather than `thinkingLevel`.

```bash
npm i @looprun-ai/models
```

`localModel(alias)` ensures the GGUF and the `llama-server` process, then returns an AI-SDK model
ready for `new LoopRunAgent({ model })`; `geminiFlashLiteThinkOff()` returns `{ model, modelParams }`.
`localModelStatus`, `resolveAlias` and `LlamaCppRuntime` are also exported — the `looprun` CLI drives
them. Weights are never fetched implicitly: download is explicit via `npx looprun models pull <alias>`.

Start with the tutorial:
[01 · Concepts](https://github.com/looprun-ai/looprun/blob/main/docs/tutorial/01-concepts.md) — six
chapters, one running example.
