# F3 — The Desk Describes Itself, and the Gate Knows Its Declaration

**Status:** DRAFT — pending owner review
**Program:** `2026-08-28-natural-voice-recovery-design.md`, phase F3 (runs before F5 and F2)
**Scope:** engine only (emit, core front desk, mastra house). The skill already teaches
this shape — for once the engine follows the skill, and the skill section of this spec
changes nothing.

---

## 1 · The measurement — what the gap costs today

The skill's pages teach `description` and `summary` on every desk of a multi-desk
declaration (commits `2c6c199` and `50449dd`, 2026-08-27). The engine on `main` accepts
only `handles` and still carries `teammates`. Verified: `grep handles skill/` finds
nothing in the skill; the emit's desk reader knows no `description` key.

A coding agent following the skill today writes a declaration.yaml the emit REFUSES.
Every blind round has been barred since 2026-08-28 for exactly this reason. The gap is
the program's standing sync break (program spec §5).

A reference implementation exists on the dead branch `desks-describe-themselves`
(`17868d2` + `d7ad33b`), ruled never to merge — its good parts are re-implemented clean
here, with the branch as reference only.

## 2 · The design

### 2a · `description` and `summary` replace `handles`, and `teammates` dies

One desk, two self-descriptions, each with exactly one reader class:

| field | shape | who reads it |
|---|---|---|
| `description` | long, written as VERBS — every act the desk performs; each verb is one more message it can be chosen for | the front desk routes on it; every OTHER desk receives it as its colleague's line, so no desk ever describes another |
| `summary` | a handful of words, COMMA-FREE (the comma is the house's list separator; an "and" inside reads plainly) | the HOUSE alone: a message no desk performs is refused with "No desk at `<house>` performs this. The house covers: `<summary>`, `<summary>` and `<summary>`." |

Rules the emit enforces, each refused by name and line:
- both fields REQUIRED on every desk of a multi-desk declaration;
- both REFUSED on a single-desk declaration (unreachable words);
- a comma inside `summary` refused;
- `handles` and `teammates` are unknown keys — refused like any unknown desk key
  (a field the reader does not know is a sentence that never reaches a prompt,
  and silence is the one failure an author cannot see).

The mastra house composes from them: the router window lists `desk: description`;
each desk's own window carries its colleagues' `description` lines where `teammates`
used to sit; the house refusal is built from the `summary` list.

### 2b · The gate stamp

The emit writes `const STAMP = '<sha256(declaration.yaml bytes)[0:16]>'` into the
generated `check-subject.test.ts`, and the gate's FIRST test recomputes the hash from
the declaration.yaml beside it and compares. A `cards.ts` regenerated from an edited
declaration matches; a hand-edited declaration (or a stale gate) fails loudly before
any other check runs.

## 3 · The implementation

| file | change |
|---|---|
| `packages/emit/src/declaration.ts` | `DESK_FIELDS` gains `description`, `summary`; loses `handles`, `teammates`; the summary-comma and single/multi rules join the surface check |
| `packages/emit/src/write-cards.ts` | emits `description:` and `summary:` on each spec; composes colleague lines |
| `packages/emit/src/write-artifacts.ts` | `writeGateFile(stamp)`; stamp = sha256 of the declaration bytes, first 16 hex chars |
| `packages/core/src/run/front-desk.ts` | `FrontDeskCfg.handles` → `description` (the window wording keeps "Desks:" lines) |
| `packages/mastra/src/routed-agent.ts` | `handles` → `descriptions`; house refusal from `summaries`; desk windows gain colleague lines |
| `packages/core` AgentSpec | `handles` → `description` + `summary`; `teammates` deleted with its rendering |

Breaking, no shims — pre-1.0, one move, callers updated (bench fixtures included).

## 4 · The validation cases (all engine-level, zero subject calls)

emit:
1. round trip: `description`/`summary` survive reader → writer on a two-desk declaration;
2. a multi-desk declaration missing either field on any desk → refused naming the desk;
3. a single-desk declaration carrying either → refused as unreachable words;
4. a `summary` with a comma → refused quoting the rule;
5. `handles:` or `teammates:` present → refused as unknown keys, by name and line;
6. the gate stamp: emit twice from the same declaration → identical stamp; edit one
   byte of the declaration, regenerate only cards → the gate's first test fails.

core/mastra (scripted models, no live calls):
7. the router window lists every desk as `name: description` and the enum still ends
   in `none`;
8. the house refusal is the summaries joined with commas and a final "and";
9. a desk's window carries each colleague's `description` line and none of its own.

Live smoke (the only spend, ~4 cases): the bench's `atlas-c18` declaration migrated
mechanically (`handles` line becomes `description`; a `summary` drafted per desk,
flagged as measurement infrastructure — the authored wording rides F5's loop), cards
regenerated THROUGH the emit, and four routed cases re-run to prove the wire end to
end. The real re-authoring of summaries belongs to F5.

## 5 · The documentation

README and `docs/tutorial/**` carry no `handles` mentions today (verified by grep at
writing); the routed-house docs (`docs/…routed…`) and the source headers naming the
routing line are rewritten AS-IS to `description`/`summary`.

## 6 · The skill

Nothing to change: the pages already teach this exact shape (`declare.md` desk table,
`norms.md` N3, the spec sketch). This phase is the engine catching up to the skill —
the sync break closes and blind rounds unlock.
