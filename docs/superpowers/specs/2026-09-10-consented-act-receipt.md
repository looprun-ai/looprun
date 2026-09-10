# A consented act's after-sentence is silent when the answer cannot fill it

## 1 · The measurement

The Criaty product, certified subject `criaty-c2`, rung 1 on the live surface
(`yntelli/yntelli/evals/reports/rung1-c2`, case `admin-05-disconnect-whatsapp`): the owner sent the
six-digit code, the engine ran `disconnectWhatsApp` itself, and the reply came back empty — the
webchat showed "Engine error — please try again". The API log:

```
TurnFailure: construction: disclosure slot '{result.brandName}' has no value — the read did not supply it
```

The c2 card's after-sentence for `disconnectWhatsApp` names `{result.brandName}`; the product answers
`{ ok, message }`. An ordinary act with the same gap is silent (`afterOf` catches, and the act's own
receipt stands); the consented act rendered its after-sentence through `withResult`, which threw —
after the irreversible act had run. One row of twelve on the rung; the same shape waits on every
consent act whose card names a field the answer lacks. Reproduced in `test/cases/m10-consent-receipt.test.ts`
(M10a red on the unchanged engine, with the same `TurnFailure`).

## 2 · The implementation

`packages/core/src/run/disclosure-desk.ts:212-222`:

```ts
  /** Fills the {result.*} slots of an already-rendered tense with the executed
   *  call's masked result. A sentence the answer cannot fill is silent — never an
   *  error: the act has run, and its own receipt stands for it. */
  withResult(text: string | null, result: Json): string | null {
    if (text === null) return null;
    try {
      return render(text, { result });
    } catch {
      return null;
    }
  }
```

A null after-tense leaves the act with `owed: null` and the sentence `head — done`; `assembleFacts`
owes the act's own receipt ("The disconnectWhatsApp call ran and took effect."), and the desk's
finish carries it. Proofs: M10a (a slot the answer lacks: the act ran, the turn closes, the receipt is
the act's own), M10b (a slot the answer fills is delivered as authored). Core suite 374/374, typecheck
clean, build clean, the five root gates clean, every bench subject's gate green (`atlas-c20`, `atlas-c21`,
`atlas-c22`, `criaty-c1`, `criaty-c2` 3/3). The measured build is the branch `microtest-consent-receipt`,
merged to `main` fast-forward.

## 3 · The documentation

The law lives in the source header of `withResult`. Checked and found not to state the old
behaviour: `README.md`, `governance/GOVERNANCE.md`, `docs/tutorial/01..06`,
`docs/superpowers/requirements.md`.

## 4 · The skill

`agentspec/skill/references/engine-seams.md` (commit `ad80e42`): the floor paragraph states that a
consented act's after-sentence the answer cannot fill is silent and the act's own receipt stands. No
lint reads it. The bench subject that measured it is `agentspec-bench/subjects/criaty-c2`, on the
product's live surface.
