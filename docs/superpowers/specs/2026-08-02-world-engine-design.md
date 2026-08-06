# Increment 3 — WorldEngine (declarative world interpreted by the engine)

Date: 2026-08-02 · Status: approved (direction; largest increment, staged) · Repo: looprun ·
Depends on: increments 1–2 (schemas, validate)

## Problem

The world is the largest generated artifact (Atlas: 2,014 hand-written TS lines) and produced the
run's costliest defects: a state block with no clock, presets seeding the wrong records, operator
text echoed back through results, simulate/confirm asymmetries — each found only by an independent
test agent (415 tests), a forensics read, or a burned measurement round. Every generated world
re-implements the same machinery: RECEPTION, two-step simulations, deterministic ids, projection,
audit. Machinery is engine work; only the DOMAIN is per-subject.

## Deliverable — `world.json` + interpreter

```jsonc
{
  "clock": "2026-07-01",
  "entities": {
    "asset": {
      "idPrefix": "ast",
      "states": ["available", "reserved", "out", "maintenance", "retired"],
      "terminal": ["retired"],
      "fields": { "dailyRate": "money", "requiredDeposit": "money",
                  "condition": { "enum": ["excellent","good","fair","poor","damaged"] } }
    }
  },
  "tools": {
    "checkOutAsset": {
      "kind": "transition", "entity": "asset", "from": "reserved", "to": "out",
      "gates": [ { "kind": "fieldAtLeast", "entity": "booking", "field": "depositHeld",
                   "min": { "ref": "asset.requiredDeposit" }, "error": "DEPOSIT_NOT_COVERED" } ]
    },
    "listAssets": { "kind": "read", "entity": "asset", "returns": ["id","status","dailyRate"] },
    "issueRefund": { "kind": "write", "twoStep": true, "gates": [ … ] }
  },
  "derived": { "lateFee": { "formula": "lateDays * dailyRate * 0.5" } },
  "presets": {
    "assetHold": [ { "seed": "hold", "scope": "asset", "target": "ast_excv01",
                     "type": "compliance", "reason": "…" } ]
  },
  "seed": { "asset": [ { "id": "ast_excv01", "status": "available", "dailyRate": 450, … } ] }
}
```

The interpreter provides ONCE, proven in the engine's own suite (never re-tested per subject):

| machinery | replaces (measured defect) |
|---|---|
| RECEPTION of args (sentinels, `'true'` coercion, absent-optional handling) | 27 hand entries |
| two-step simulate/confirm (side-effect-free simulation, simulate≡confirm identity) | 13 hand branches |
| deterministic ids/counters, audit action history, `tookEffect` marking | hand counters + audit |
| `projection()` incl. the CLOCK and status keys | the no-clock F-1 blocker |
| echo-safety: operator-authored strings tagged in results | the R1/R3 laundering findings |
| preset application over seed (declarative deltas, one quota isolated per preset) | wrong-record presets (19/56/59) |
| a `custom` executor escape hatch (named TS function registered by the HOST, not generated) | genuinely irreducible logic, quarantined and reviewed |

`validate` (increment 2a) gains world layers: preset distinguishability, simulate≡confirm identity,
determinism (same preset+calls ⇒ byte-identical projection) — properties checked mechanically,
replacing the independent world-test agent for generated worlds.

## Staging

- **3a — builder API**: typed `defineWorld({...})` in TS with the machinery above; generation
  emits ONLY the declarative object literal. Cheap, ships early, kills most defect classes.
- **3b — `world.json`**: same shape serialized; formula/predicate mini-language finalized; the
  skill stops emitting TS entirely.

## Testing

- Interpreter suite: RECEPTION/simulate/determinism/projection/echo-safety property tests.
- Atlas-as-fixture: re-express a 10-tool slice of the Atlas domain declaratively; byte-compare
  projections against the frozen hand world for identical call sequences.
- Reproductions: the no-clock defect (projection always carries the clock), the wrong-record
  preset class (validate fires).

## Out of scope

Porting full existing subjects (per-subject work after 3a); multi-world composition; any
LLM-facing change (the tool surface presented to the model is unchanged).
