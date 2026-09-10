# Target-less report rows, and the receipt a done write owes at the floor

Two laws of the close step, each measured on real traces before it was touched.

## 1 · The measurement

**The dropped row.** A tool that declares no target argument (`form: 'make'`, or a `run` with a
schema) is reported by the desk with the record its answer returned or with the act's own name.
The engine dropped every such row as "impossible" (no argument value equals the target), the
completeness guard then found the act unaccounted for, and each drop cost one redrive — a model
call — until the retries were spent and the floor wrote the close.

| run directory | dropped rows | of which the act's own name | of which a value the answer carries | still impossible |
|---|---|---|---|---|
| `agentspec-bench/subjects/criaty-c1/test/**` (`.json` dumps) | 2115 | 614 | 1361 | 140 |
| `agentspec-bench/subjects/atlas-c22/test/**` | 346 | 11 | 308 | 27 |
| `atlas-c20`, `atlas-c20-nochoice`, `atlas-c21`, `coworking-front-desk`, `hotel` | 0 | — | — | — |

Real rows from the dumps: `createPost | p045` (the label `createPost` answered), `generateQuote |
qt_5002` (the quote the run returned), `updateVoiceProfile | updateVoiceProfile` (the act's own
name). Still impossible after the change, and rightly: `listBookings | ws_4402` (a record of another
entity), `createBooking | bk_` (an invented id), `connectWhatsApp | a1b2c3d4-0001-…` (an invented
UUID).

**The silent receipt.** At the floor, a done write's receipt was dropped whenever its sentence
contained `{` — the test for an unfilled slot — and a record rendered as JSON inside a filled
receipt has braces too. `agentspec-bench/subjects/criaty-c1/test/r1/dumps/01-color-first.governed.json`:
`renderColorSwatch` done, owed receipt `The swatch i103 carries five shades of Laranja Pôr do Sol:
[{"slot":"A",…}]`, `delivery: { by: 'floor', facts: [] }`, text `Nothing here reaches what was
asked, and nothing changed.` — false, and English. On the live product the same close read to the
owner after two attested keyframes (`yntelli/yntelli/evals/reports/rung3-pinned/report.json`,
case `01-reel-keyframes`), after a refused `connectWhatsApp` (`04-connect-whatsapp`) and on
`12-clear-voice`. Floors after a done write in the bench: criaty-c1 2 of 16, atlas-c22 0 of 3.

## 2 · The implementation

The measured build is the branch `microtest-floor-receipts`, merged to `main` fast-forward.

`packages/core/src/run/honesty-check.ts:27-33` — a value carries a target when a scalar reads as
it or a list or record holds one anywhere inside:

```ts
function carries(value: Json | null | undefined, target: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return String(value) === target;
  return Object.values(value).some(v => carries(v, target));
}
```

`packages/core/src/run/honesty-check.ts:137-145` — the row stands when it names the act:

```ts
  impossibleRows(report: readonly ReportLine[], turnActs: readonly Act[]): readonly ReportLine[] {
    return report.filter(line => {
      if (line.target === '' || line.target === line.tool
          || this.facts.tools[line.tool]?.target !== null) return false;
      const calls = turnActs.filter(a => a.call.tool === line.tool);
      if (calls.length === 0) return false;
      return !calls.some(a => carries(a.call.args, line.target) || carries(a.result, line.target));
    });
  }
```

`packages/core/src/run/delivery-facts.ts:45-73` — an unfilled slot is an identifier path in
braces, never a record rendered as JSON; the act spoken by its head alone is the fallback:

```ts
function hasUnfilledSlot(text: string): boolean { /* scans `{path}` — `{result.post}` yes, `{"id":…}` no */ }
function bareActSentence(a: Act): string {
  const dash = a.sentence.indexOf(' — ');
  return spokenActSentence(dash === -1 ? a.sentence : `${a.sentence.slice(0, dash)} — ${a.status}`);
}
```

`packages/core/src/run/delivery-facts.ts:284-305` — a done write always owes a fact:

```ts
    const owed = a.owed !== null && hasUnfilledSlot(a.owed.text) ? null : a.owed;
    if (owed !== null) { /* the authored sentence, as before */ continue; }
    if (a.status === 'done' && a.effect !== 'read') {
      const spoken = spokenActSentence(a.sentence);
      facts.push({ kind: 'receipt', state: 'ran',
        text: hasUnfilledSlot(spoken) ? bareActSentence(a) : spoken });
    }
```

Proofs: `test/cases/m8-targetless-rows.test.ts` (M8a–M8d: the minted record, the act's own
name, an invented id still impossible, the row filter row by row) and
`test/proofs/p13-floor-receipt.test.ts` (P13a–P13d: a JSON-laden receipt is a fact, an unfilled
receipt falls back, the floor speaks the receipt after a done write, the nothing-owed closure
stands for a turn in which nothing ran). All seven were red on the unchanged engine and green on
the branch. `test/run/honesty-floors.test.ts` states the new law: an owed text still carrying a
slot never reaches the operator, and the act speaks for itself. Core suite 372/372, mastra
83/83, eval 192/192, the root gates clean. Every bench subject's gate identical on `main` and on
the branch: `atlas-c20`, `atlas-c21`, `atlas-c22`, `criaty-c1` 3/3; `hotel` and
`atlas-c20-nochoice` fail to load on both (an engine API they no longer have).

## 3 · The documentation

The law lives in the source headers: `honesty-check.ts` (`impossibleRows`) and
`delivery-facts.ts` (`hasUnfilledSlot`, `bareActSentence`, `assembleFacts`). Checked and found not
to state either law: `README.md` (the floor table names what it refuses, not the row rule),
`governance/GOVERNANCE.md`, `docs/tutorial/01..06`, `docs/superpowers/requirements.md` (R5.7 and
the audit line "delivered as … 'nothing changed'" describe what this change guarantees).

## 4 · The skill

`agentspec/skill/references/engine-seams.md` (commit `11fbcab`): the corrections table carries
`rowDropped` with the rule that decides it, and the floor paragraph states that a done write is
never silent there. No lint reads either behaviour. The bench subject that measures the change is
`agentspec-bench/subjects/criaty-c2` (commit `99b067d7`): the same exam as `criaty-c1` over the
product's real answer shapes, run blind on this engine.
