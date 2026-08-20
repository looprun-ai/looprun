<!-- Thanks for contributing to looprun. See CONTRIBUTING.md and governance/GOVERNANCE.md. -->

## Summary

<!-- What does this change do, and why? -->

## What it touches

- [ ] **A law of the turn machine** — the engine (`packages/core/src/run`, `packages/core/src/cards`)
- [ ] **A door** — the facade, the wire, a world seam (`packages/mastra`, `packages/server`)
- [ ] **The authoring surface** — a card field, a guard factory, a disclosure tense
- [ ] **The measuring instrument** — `packages/eval`
- [ ] **Docs or tooling only** — no behaviour changes

## The evidence

- [ ] The proof, lint or gate that states the changed law changed in this same commit
- [ ] `pnpm build && pnpm typecheck && pnpm test` green from a clean install
- [ ] If the authoring surface changed: the tutorial lesson and its compiling snippet changed too
- [ ] A changeset describes the change (`pnpm changeset`)

## Anything a reviewer should look at first

<!-- The file to read first, the case that used to fail, the number that moved. -->
