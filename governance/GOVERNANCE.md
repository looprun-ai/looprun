# Governance — what proves this engine behaves

looprun holds every destructive call for a human's word, states what agreeing would do, and seals
what happened into a record nobody can edit. The delivered reply is the desk's own prose under
deterministic honesty checks: every figure it states is one the records carry, every record fact
it omits is printed beneath it by the engine, and a message whose report contradicts the sealed
record is never delivered — the record's own sentences speak instead. A claim like that is worth
exactly as much as the evidence behind it, and the evidence is code that runs on every push.

**The one-line rule: a change to a governed surface ships with its suites green, or it does not
ship.** There is no separate paperwork to file — the suites below ARE the record.

```
  pnpm build && pnpm typecheck && pnpm test
     │
     ├── 12 engine proofs      one law of the turn machine each
     ├──  4 structural lints   the shape of the source itself
     ├──  7 facade gates       the same laws through the doors a host uses
     ├──    eval verb proofs   the measuring instrument, proven on fixtures
     └──  3 repository gates   the words the whole tree is allowed to use
```

---

## 1 · The twelve engine proofs

`packages/core/test/proofs/` — one file per law, each driven by a scripted model over a fixture
world. No API key, no network, no clock: the same inputs always produce the same verdict.

| proof | the law it pays |
|---|---|
| P1 | a scripted turn seals `[toolCall, toolResult, reply]` in order, in a complete record |
| P2 | a duplicate call restates the first result within its turn — it never re-executes |
| P3 | a refused call records not-done/blocked carrying the guard's own sentence |
| P4 | an owed read is paid by ONE forced micro-step; unpaid debt refuses, never a dead turn |
| P5 | the whole grading table: the engine derives the user-facing word from what happened |
| P6 | a turn failure discards the draft — zero partial acts are sealed |
| P7 | the system prefix is byte-identical across turns; only the tail varies |
| P8 | exhaustion forces one finish step; a model that still will not finish is closed by the engine |
| P9 | two calls in one step execute serially, in emission order |
| P10 | `guards()` returns the same guard objects the phase checks iterate — the census cannot drift |
| P11 | the sealed record and every ctx travel deep-frozen; mutation throws |
| P12 | two concurrent chats on one session serialize in arrival order |

What a proof looks like, whole — P1, in the shape every one of them takes:

```typescript
const r = await engine.chat('s1', 'check booking bk_1001');

expect(port.log).toEqual([{ tool: 'getBooking', args: { id: 'bk_1001' } }]);
expect(r.acts[0]).toMatchObject({
  origin: 'model', effect: 'read', said: 'yes', status: 'done', reason: null,
  evidence: 'executor', call: { tool: 'getBooking', args: { id: 'bk_1001' } }
});
expect(r.closedBy).toBe('model');
```

## 2 · The four structural lints

`packages/core/test/lint/` — these read the source as source. They fail a build for a shape, not
for a behavior, which is why they catch what a runtime test cannot.

| lint | what it refuses |
|---|---|
| `layer-rule` | an import pointing the wrong way in the layer picture: contract imports nothing, cards import contract, the machine reaches a world only through the ports, and only a facade imports the engine |
| `name-gate` | any identifier on the rename register, anywhere in the packages tree |
| `no-network` | a network primitive reached from the engine — `fetch`, an http client, a socket. The declared doors are the server package (the wire is its purpose) and the models package (loopback serving) |
| `purity` | a regex outside its declared homes — the pattern factories and `argMatchesFormat` in the catalog, and the delivery writer's sentence anatomy (`idsOf`, `unframed`) — a guard decides by reading typed values, not by matching prose |

## 3 · The seven facade gates

The same laws, exercised through the doors a host actually uses, so a law cannot hold in the engine
and leak at the seam.

| gate | the door |
|---|---|
| G1 | consent through the public `LoopRunAgent` class: the call is held, the question carries a code, the code releases exactly that call |
| G2 | the same consent case over HTTP — the code rides the OpenAI-compatible envelope |
| G3 | an `mcpWorld` card against an in-process MCP server, reconciled by the surface gate |
| G4 | a `liveWorld` card through the facade: the done law and the declared proxies |
| G5 | the native tool-result law: a hostile note planted in a result changes nothing |
| G6 | the ungoverned twin through the public class — byte-identical prompt, no guards |
| G7 | the composition doors the server types against |

## 4 · The measuring instrument

`packages/eval` is the harness a measurement runs through, and it is proven like anything else:
the loader, the validator, the lints, the runner, the monitor, the judge-input builder, the folder,
the certifier and the seal each carry their own tests over fixture subjects.

Two laws bind a measurement, and both are structural rather than advisory:

| law | how it holds |
|---|---|
| **the judge is the agent in the session** | no file in this repository calls a third-party model API. `buildJudgeInputs` writes blind rows to disk; a person and their agent read them and write verdicts back. There is no judge model to configure |
| **the subject under test is the only model any run may reach** | it is named in the subject's `ask/targets.json`, and the loader refuses a run that names anything else |

A certification is a fact about named run directories: a case passes a repetition when its governed
dump sealed clean AND the folded verdict says pass; an unresolved monitor incident voids the whole
certification. `seal()` freezes the authored subject — the cards, the world, the cases, the
generated data, the mapping — and never the run evidence beside it, so a later run cannot void an
earlier certification.

## 5 · The three repository gates

`pnpm gates` — the words the whole tree is allowed to use.

| gate | what it refuses |
|---|---|
| `plain-names` | any of the seven retired names — the words the engine replaced with plainer ones — in a file a person reads |
| `guard-priority` | a retired guard identifier — the old prefixes and the old field that carried priority |
| `no-bench-drift` | a reference to the research harness this engine came from, and any term tied to one vendor's agent product |

Each gate carries a self-test: a lint that cannot fail is no law, so every one of them proves it
still fires before it reports clean.

---

## What a contributor does

```
 1 │ change the code
 2 │ pnpm build && pnpm typecheck && pnpm test    ← the suites above, all of them
 3 │ if a law changed, the proof that states it changes in the same commit
 4 │ if the authoring surface changed, the tutorial lesson that teaches it changes too
```

A new law arrives as a new proof file beside the twelve. A new door arrives as a new gate beside
the seven. Nothing is proven by a document; documents state what the proofs assert.
