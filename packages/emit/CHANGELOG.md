# @looprun-ai/emit

## 0.22.2

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.22.2
  - @looprun-ai/eval@0.22.2

## 0.22.1

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.22.1
  - @looprun-ai/eval@0.22.1

## 0.22.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies
  - @looprun-ai/core@0.22.0
  - @looprun-ai/eval@0.22.0

## 0.21.0

### Minor Changes

- Release (minor).
- 117a967: Three additions to the static gate: what a subject spends, what an approved act reports, and one
  order the gate stops demanding because it cannot be obeyed.

  `promptBudgeted` renders every desk the way the bars ruler does — the system prefix plus the tool
  cards — sums the bytes and holds the total to the `promptBudget` declared in the subject's own
  `ask/targets.json`. The number is the SUBJECT OWNER's, and it lives beside the one model that
  subject may reach: never in a verb, never on the cards being measured. `PROMPT_OVER_BUDGET` names
  the total, the ceiling, the overrun, and each desk's system and card bytes heaviest first, because
  the way back under a budget is a lane split or a shorter world sentence on the desk carrying the
  most. A subject declaring no ceiling is measured against nothing and the verb says nothing.

  `approvedActsDisclosed` is the outcome tense of the question `destructiveDisclosed` already holds
  to a figure. An act a case approves has both tenses rendered: the words that ask, and the words
  that report. `ACT_RESULT_UNSPOKEN` charges a destructive act a case approves whose
  `disclosure.<act>.after` is missing or carries no `{result.…}` slot — the act runs and what it did
  to the record reaches the operator only if the desk chooses to say it.

  `readsOrdered` exempts the act that MINTS what the read is keyed on. A filing act creates the row
  and hands back the id it has just made, and the read keyed on that id cannot run before it: there
  is no id yet to call it with. The exemption is exact — the act's world entry carries `form: 'make'`
  on an entity, and the read answers on that same entity with its schema requiring the id argument —
  so a read that LISTS the entity still owes the order, and so does an act that changes a row
  somebody else created. When every act a case takes is exempt, the case is left alone.

  `GateSubject` carries the desks: `specs` and `contract` ride with the world, because the prompt a
  budget measures is rendered from them. The emitted `check-subject.test.ts` passes both.

- 6dbb56a: A CHOICE is licensed by the operator's own ANSWER to a question that is OPEN.
  `choiceFromUser(tool, arg, options, rule)` takes the two or more values the argument may carry.
  Until an answer stands, the call is refused and the refusal OPENS a question on the session's
  `ChoiceDesk`: the engine mints six digits for it and hands the desk the declared options beside
  them. The desk puts that question to the operator in the operator's own language, and the
  licence is the reply carrying one option token — the option's place in the declared order, or
  its literal case folded — and that question's code, those two and nothing else.

  A question is answered once. The act that runs on the answer consumes it — an act whose outcome
  is unclear consumes it too, because the write may have landed — so a later call on the same
  argument opens a fresh question under a code the operator has not seen; an echo arriving
  against no open question licenses nothing, and a spent code licenses nothing. One question
  stands per act and argument at a time — a re-ask restates the standing question rather than
  minting a second live code — and while a question is open the latest answer replaces the one
  before it. The engine matches the declared options, the code it minted and the shape of the
  message — never a word of any language, so an operator writing Portuguese or Japanese is served
  exactly as an English one is.

  `valueFromUser` cannot hold a choice: it searches for the argument's own value, and nobody
  writes `true`. A value outside the declared options refuses, and a call the gated argument never
  arrives on refuses too. The declared form is `factory: choiceFromUser` with `args.arg` and
  `args.options`; `rule` is required, because that sentence is the whole of what the operator reads
  when the gate stands.

  The justification for a prose rule belongs to its author. A guard with `factory: prose` states
  `args.why` — `noSuchAct`, `aboutARead` or `conduct` — and the emitted WHY map carries what it
  declared. A prose rule that claims nothing is refused by name, and `measured:<case>` is refused
  with it: that licence is bought by a run that judged the case it names, and a declaration judges
  nothing. A desk's conduct law still claims `conduct` on its own, being a law about how that desk
  answers.

  ONE writer answers the operator. The turn's OWED FACTS ride numbered in the desk's own
  prompt and its closing message is what the operator receives: a deterministic funnel charges
  that message for every literal the records mint, every fact id it must express, every figure
  no record carries, every label of the prompt it must not print, and a report line the record
  contradicts — a miss sends the desk back on the same prefix with the record's own sentence
  quoted. There is no second writer and no second conversation.

  When the ENGINE closes the turn — a consent question raised, the turn's retries spent — the
  DESK writes the close as well: one more step in the conversation it has been reading, same
  system prefix, same tool cards, one user message carrying the numbered facts and the order to
  write the closing reply. The same funnel charges what comes back, two rewrites are paid, and
  then the deterministic floor delivers the record lines verbatim. The close instruction forbids
  bracketed codes in the words the operator reads, because a numbered brief teaches a model to
  echo the numbers.

  An identifier leaves a text before its digits are read as amounts only when THE RECORDS
  CARRY it. `A-05` and `BK-4402` are record names and their digits are not amounts; `USD-500`
  and `A-364` wear the same shape, name nothing on the record, and answer for their digits.
  One definition of id-shaped serves the walk and the always-on grounding floor.

  `DeliveryMarks.by` reads `desk`, `prose` or `floor`, and the run counters read
  `deskDeliveries` and `deskRetries`.

- eb5163e: The declared path reaches every mechanism the engine offers, and the residue is one line long.

  Ten factories now have a YAML form. `precondition` reads a FIELD of the record it names —
  `field: <name>` with one of `is: <value>` or `in: [<values>]` — beside the presence form it
  already had. `argAbsent` refuses the call carrying a declared-but-banned argument.
  `checkResult` reads a field of the result the call came back with and states the correction the
  reply owes. `mustAccountFor` names the records a report must carry and the word it must carry
  them with. `blockPattern` refuses at a seam — the arriving message or the outgoing reply — with
  the sentence the author writes.

  `contract.rewrites` carries the three that edit rather than decide: `maskPattern`,
  `purgePattern` and `swapTerms`. `contract.wording` carries the status words and engine sentences
  this business says its own way. `contract.secrets` takes the mapping form that picks `omit`.
  `desks[].judged` carries the four judged checks — `lieCheck`, `impossibilityCheck`,
  `injectionCheck`, `hallucinationCheck` — on the spec that earned them, scoped to the acts they
  are asked about. `desks[].limits` states one desk's own ceilings. A disclosure entry states
  `later`, the standing sentence while the act stays relevant, and `empty`, the refusal for a
  tense the reads answered nothing for.

  Every new configuration is checked and refused by the exact path that is wrong: a field with no
  value or two values, a status word no report writes, a ceiling name the engine does not carry, a
  wording key nothing reads, a judged check over no act or over an act outside its desk's lane, a
  rewrite missing what its kind is configured from.

  A declaration that reaches none of these emits byte-identical cards.

- 59b594b: A result check that fails is owed to the operator: a `resultSatisfiesCondition` finding rides
  the delivery as a note the reply must express — the check's own words where it spoke, the
  guard's rule where it did not — so a result that fails its declared check is never reported
  as a plain success.

  The desk's own word withdraws its question: a held act whose closing report says `refused`
  closes its question `withdrawn`, the code licenses nothing, the act stands not-done, and the
  operator reads the refusal alone — a refusal and a code never share a reply. A spent
  confirmation code sent again is answered without its digits. A report row naming a target
  none of this turn's calls of that tool carried is dropped on the record, and a turn owing
  nothing that the engine closes says that nothing here reaches what was asked. The figures
  the contract's own facts state ground the reply that repeats them. A declared `enum` is the
  whole of what an argument may carry: a value outside it is refused at the call door.

  The declared subject path grows three rungs, each data on the card. `precondition` may
  `pick` the rows of a list read that name the call's argument, and may hand the decision to
  `code`, an export of `guards.ts` beside the declaration typed `Precondition` by the engine —
  the declaration still names the act, the read, the sentence and the seam row it pays.
  `argRequired` requires an argument outright or `when` another argument carries a declared
  value. `idNamedByUser` licenses an identifier by the operator's own words: the id itself, or
  a row label that fits one row of a list read — nobody named refuses with who is on the list,
  two rows named alike refuse and the desk asks. `reads: record` configures nothing and is
  gone from every form.

  A message no desk of the house takes is routed to `none` on the record at every door; a
  desk the subject marks default keeps its name. The ungoverned twin tells the truth about
  itself: with nothing armed, its prompt says no call is held and asks the desk to seek the
  operator's word in its own words, on every card whose act changes or moves something for
  good, and the house law that hands the hold to the engine is not printed there.

- 2ce974c: `runGate` answers with a `GateReport`, not a bare list.

  ```ts
  const gate = runGate(subjectDir, subject);
  gate.findings; // every failing row — the gate is red exactly when this is non-empty
  gate.seams; // the seam budget: one warning line per unspoken row no case drives into
  ```

  `findings` carries every failing verb's rows, `SEAM_UNSPOKEN` among them; `seams` carries one
  `SEAM_UNREACHED` line per row of the seam table that no case drives into and no seam law names —
  they print with the run and fail nothing. The emitted `check-subject.test.ts` prints every
  `seams` line and asserts `findings` empty, so a stamped gate is regenerated through the emit to
  read the new shape.

  `censusFor` walks past a desk whose card does not compile: the desk contributes no guard names
  and the census still answers, so the gate called in the emitted shape returns the card's problems
  as findings — beside the `COVERS_UNRESOLVED` rows the missing names produce — instead of
  unwinding on the first refused card.

- be1b034: The lane number is a TARGET, and `GateReport` has a third channel for the rows that state one.

  ```ts
  const gate = runGate(subjectDir, subject);
  gate.findings; // every failing row — the gate is red exactly when this is non-empty
  gate.seams; // one warning line per unspoken seam row no case drives into
  gate.advisories; // one line per desk past the lane target — printed, and failing nothing
  ```

  Fifteen acts is the width a desk aims at, not a limit the gate enforces: the ask decides how many
  acts one agent carries, and a desk holding fifty gets them with `LANE_TOO_WIDE` printed beside a
  green run. `cardWeight` is unchanged — `CARD_OVER_WEIGHT` is still a finding, and a card the
  factory refuses is still a finding whichever verb read it.

  The emitted `check-subject.test.ts` prints every `advisories` line the way it prints the seam
  budget, and still asserts `findings` empty, so a stamped gate is regenerated through the emit to
  read the new shape.

- 6b89100: The declared subject path can state WHO may act. `factory: role` names the walk from the
  record that says who is acting to the field that decides — `anchor`, `by`, `from`, `field`,
  and the `in` values that may act — and the emitter writes it as a `precondition` over the
  acting record's field, one check covering every act the guard names. The `rule` is required:
  that sentence is what the operator reads when the gate stands.

  The static gate's pairing verb charges every act, not only the ones a rule names. A write or
  a destructive effect with no deterministic check is a call the engine cannot stop, so it is a
  finding whether or not any sentence on the card mentions it.

- a5153a1: The seam's debt becomes payable, and a refusal the exam measures becomes a refusal the cards can
  produce.

  `contract.seam` is a new optional section of the declaration, keyed by the act and then by the
  refusal code the WORLD card spells out — the rows `gen/SEAM.md` has always printed with an empty
  last column:

  ```yaml
  seam:
    transferAsset:
      ASSET_OUT_ON_RENTAL: >-
        An asset already out on rental cannot be moved to another workspace: say which booking
        holds it and when it is due back, and move nothing until it is.
  ```

  One law per row, never a paragraph gathering an act's codes together. Each is emitted as
  `prose('seam:<act>:<CODE>', …)` onto the conduct of every desk whose lane holds the act, under the
  coordinate of the row it pays. The prose licence set gains `seam`: its home is the ACT, so the
  house-law rule steps over it — a desk whose lane cannot make the call would be reading a rule
  about a code it never meets. Slot rules cover the sentences, and a code the computed seam does not
  carry is refused by its own path, naming the codes the act IS refused with.

  `seamSpoken` reads that debt back row by row, inside `runGate`. A case that carries a preset and
  lists an act under `noEffectToolCalls` drives the world into one row: the act's executor is run
  over the declared records, base and preset, with the arguments the case's matcher supplies, and
  the row is driven when the preset run refuses with a code the base run does not answer. A driven
  row whose code no seam law names fails the gate; a case with no preset drives into nothing — the
  no-effect it expects is the consent hold's work, and the world never refuses. Every other
  unspoken row comes back under the gate's `seams` budget, one warning line per row, printed with
  the run and failing nothing — which refusals are worth a sentence the prompt then carries on
  every turn stays the author's spend.

  `noEffectDenied` joins `runGate`. A case that lists an act under `noEffectToolCalls` measures a
  refusal, and an act standing behind `onlyAfter` alone produces none: the order is satisfied by
  reading, so a desk that reads first and acts second has cleared it and the invariant fails on a
  call the engine allowed. The verb asks for a mechanism that decides the CALL — a role or state
  precondition, a choice or a value the operator has to have given, a format, a ceiling, a
  hand-written deny — and reads a subject's own wrappers as what they wrap.

  `checkAgainstSurface` takes the computed seam as a third argument.

### Patch Changes

- Updated dependencies
- Updated dependencies [c34e821]
- Updated dependencies [117a967]
- Updated dependencies [6dbb56a]
- Updated dependencies [59b594b]
- Updated dependencies [2ce974c]
- Updated dependencies [be1b034]
- Updated dependencies [6b89100]
- Updated dependencies [a5153a1]
- Updated dependencies [7a03a19]
  - @looprun-ai/core@0.21.0
  - @looprun-ai/eval@0.21.0
