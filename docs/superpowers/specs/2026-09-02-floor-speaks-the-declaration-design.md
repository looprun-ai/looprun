# The floor speaks the declaration — design

The engine's floor delivery is the one voice the model cannot improve: it is composed by the
engine, printed verbatim, and today it speaks machinery. This spec makes every engine-authored
delivery speak the declaration's own human sentences, and makes the one machinery shape a model
reply can carry refusable by structure alone.

## 1 · The measurement

Run directories, all judged in session:

| evidence | where |
|---|---|
| the floor prints an act log and a raw code | `agentspec-bench/subjects/atlas-c20/test/2026-09-01-chat-door-12/dumps/51-sole-owner-protected.governed.json` — turn 2: `delivery.by: "floor"`, `retried: true`, corrections `owedFactIsCarried · owedFactIsExpressed ×2 · claimIsGrounded → forcedFinish`; the delivered text opens `Completed: getMember.` followed by `updateMemberRole(mem_1001) — not-done` and carries the refusal as the bare code `SOLE_OWNER_PROTECTED` |
| the human sentences already exist, unused | the same dump's floor facts carry the ask sentence in words, and `declaration.yaml:670-677` declares seam sentences for `SOLE_OWNER_PROTECTED` on both acts — neither reaches the delivery |
| the same class at the pinned door | `…directed12-emitted-r6` turn 2 of the same case (the run the loop judged fail on the same shape) |
| the model echoes the act-log line | `…directed12-emitted-r7/dumps/29-promote-owner-confirm.governed.json` turn 3: the reply carries `updateMemberRole(mem_1004) — done (already ran; first result restated)` verbatim inside otherwise natural prose |
| the shape is separable by structure | branch `microtest-reply-shape-floor`, `packages/core/test/run/microtest-reply-shape.test.ts`: the act-log shape catches 4/4 real leaked replies with 0/12 false positives on clean ones — including `"The updateMemberRole operation is complete"` (speech, stays clean) |
| the ask instruction echoes | the step-7 ledger residual: the engine's ask-instruction text reaches the operator verbatim on some paths (`send it alone`, `the system is holding`) |

## 2 · The implementation

Four pieces, engine first:

1. **The floor composes from sentences, never from the log.** The floor delivery renders, in
   order: for every refusal fact, the declared seam sentence for its code on this act (fallback:
   an engine-owned human template naming the act's label and that it was refused — never the
   bare code); the ask and owed fact texts as declared; the consent instruction in the engine's
   human wording with the code. Act-log lines (`name(args) — status`, `Completed: name.`) never
   enter a delivered text. Files: `packages/core/src/run/delivery-facts.ts` (composition),
   `packages/core/src/run/turn.ts` (the floor path that prints record sentences today).
2. **The act-log shape is a reply floor.** The structural shape proven on the microtest branch
   becomes an always-on reply check: a delivery carrying the shape is redriven once with the
   correction naming the line; a desk that cannot rewrite falls to the floor of piece 1. The
   shape is markup, not vocabulary — it holds under the no-language-words law. The microtest
   file graduates to the engine's own test.
3. **The ask instruction speaks like a person.** The engine sentence the desk tends to echo is
   rewritten to the human form (the code request without `alone`-style register), so an echo of
   it reads as speech.
4. **The zero-legible tense and the persona voice** land in the skill (section 4).

## 3 · The documentation

- `packages/core/src/run/delivery-facts.ts` and `turn.ts` headers: the floor's law — an
  engine-authored delivery speaks declared sentences, never the record's log lines.
- `docs/tutorial/` lesson covering disclosure/delivery: the floor paragraph rewritten to the
  new truth.
- `governance/` where the delivery guarantee is stated, if it names the floor's wording.

## 4 · The skill (same session as the engine)

- `author.md` disclosure section: a tense is written to read naturally at EVERY value its slot
  can take — a sentence that reads as a ledger line at zero fails the case that lands on zero.
- `author.md` persona/conduct: the desk speaks TO the operator about the operator's own record
  (`your role`), never AS the operator (`my role`).
- `test.md` gains no new rung — the repair for a machinery-shaped delivery is piece 2's
  correction, already a check.

## 5 · Acceptance — no model call spent before the slice, and the slice twice over

1. Workspace gate green; the graduated shape test green; rendered-prompt byte diff of the live
   subjects ZERO except the ask-instruction sentence of piece 3 (named in the diff).
2. **The directed 12 at the pinned door**: no point lost against the 12/12 of record — a change
   that costs a point is not a change.
3. **The chat test, English**: the directed 12 through the front desk (`run-cases-unpinned`),
   judged for the letters AND for naturalness — zero deliveries carrying the act-log shape,
   zero bare refusal codes, the 51 floor turn delivered in sentences.
4. **The chat test, Portuguese**: the same twelve asks written by a pt-BR operator (translated
   turns, ids and codes verbatim per the language law), through the front desk. Judged in
   session for: the reply entirely in Portuguese with identifiers and status words quoted as
   the records return them; the same letters as the English run; and the floor turns — the
   recomposed floor speaks the DECLARED sentences, which are English, so this run also rules
   the open question it will expose: whether a floor delivery on a Portuguese conversation is
   lawful in English (the declaration's words) or owes a declared translation. The run's
   verdict names that ruling for the owner; the spec does not pre-decide it.
