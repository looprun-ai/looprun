# @looprun-ai/core

The framework-free half of [looprun](https://looprun.ai): `AgentSpec` (what an agent may do, in what
order, under which state conditions) plus the guard factories — each guard a machine-checked
`check()` paired with the LLM-facing `prose()` rendered into the prompt. Zero runtime dependencies;
a backend package supplies the loop.

```bash
npm i @looprun-ai/core
```

The public barrel exports `AgentSpecBase`, `validateSpec`, the guard factories (`precondition`,
`requiresBefore`, `argRequired`, `custom`, …) and the `AgentSpec` / `AgentWorld` / `DomainContract` /
`ToolDef` / `Guard` types. The runtime primitives a backend drives — the assembled prompt renderer, the ledger,
the terminal protocol and the governed-turn functions — ship on `@looprun-ai/core/internal`, which
carries **no compatibility promise** and moves with the implementation.

Start with the tutorial:
[01 · Concepts](https://github.com/looprun-ai/looprun/blob/main/docs/tutorial/01-concepts.md) — six
chapters, one running example.
