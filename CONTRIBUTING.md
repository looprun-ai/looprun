# Contributing to looprun

Thanks for helping build looprun. This guide covers dev setup, what has to stay green, and the
order to add a law to the engine.

## Dev setup

Requirements: **Node ≥ 22** and **pnpm** (see `packageManager` in `package.json`).

```bash
pnpm install
pnpm build          # every package to dist
pnpm typecheck
pnpm test           # every package suite, then the repository gates
```

`pnpm test` is the whole bar: the 12 engine proofs, the 4 structural lints, the 7 facade gates, the
eval verb proofs, and the three repository gates. CI runs exactly these commands and nothing else.

Everything written to a file in this repository is **English** — code, identifiers, comments, docs,
commit messages, and the prose the engine puts in a prompt.

## What proves a change

There is no separate paperwork. The suites are the record, and
[`governance/GOVERNANCE.md`](governance/GOVERNANCE.md) says what each one asserts.

| you changed | what has to change with it |
|---|---|
| a law of the turn machine | the proof in `packages/core/test/proofs/` that states it |
| the shape of the source (layers, names, purity, network) | the lint in `packages/core/test/lint/` that draws the line |
| a door a host uses (facade, HTTP, MCP, live world) | the gate in `packages/{mastra,server}/test/gate/` |
| the authoring surface — a card field, a guard factory, a disclosure tense | the tutorial lesson that teaches it, and the compiling snippet under it |
| the measuring instrument | the verb's test in `packages/eval/test/` |

## Add a law to the engine (test first)

The proof is the specification. Write it before the implementation.

```
 1 │ write the proof beside the twelve: packages/core/test/proofs/p13-<name>.test.ts
 2 │ run it — it must FAIL, and the failure must be the one you predicted
 3 │ implement until it passes, and until every other suite still passes
 4 │ if the law is visible to an author, the tutorial lesson changes in the same commit
 5 │ add a changeset: pnpm changeset
```

A proof runs against a **scripted model** and a **fixture world** — no API key, no network, no
clock. That is what makes it a durable statement about behaviour instead of a flaky snapshot.

## Two laws that bind every contribution

| law | what it forbids |
|---|---|
| **no external model, ever** | no file in this repository calls a third-party model API — not to judge a run, not to score a transcript, not for one exploratory call behind a script. The agent in the session reads the transcripts and writes the verdicts. The one model any run may reach is the subject under test, named in that subject's `ask/targets.json` |
| **the source states what IS** | a comment or a doc says what the system does today and shows an example of it. It never narrates a change, and it never cites the test or the measurement behind a rule. Git is the record of change; the source is the record of state |

## Before you open a pull request

- `pnpm build && pnpm typecheck && pnpm test` green from a clean install.
- A changeset describing the change for the release notes.
- Fill in `.github/pull_request_template.md`.
