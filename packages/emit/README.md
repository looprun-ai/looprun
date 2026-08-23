# @looprun-ai/emit

One `declaration.yaml` in, the governed subject out. The emitter writes `cards.ts`, `subject.ts`,
`check-subject.test.ts` and `gen/SEAM.md`, deterministically — the same declaration emits the same
bytes — and invents zero prose: every sentence in the cards is the declaration's own.

```bash
npx looprun-emit <subject-dir>
```

The subject directory holds the declaration beside the world card it is declared against
(`declaration.yaml` + `world.ts`). On success the CLI prints each written path, one per line. On
refusal it writes nothing, prints every refusal the emitter can know — one per line, each naming
the exact YAML path to fix — and exits 1. The declaration is always what changes, never the
emitter.

## The shape

```yaml
contract:
  name: rentals
  voice: "One sentence of how every desk speaks."
  facts:
    - "A closed statement every desk may rely on."
  guards:                                # required, a sequence of mappings
    - name: read-before-cancel           # unique; the census keys on it
      acts: [cancelBooking]              # every act must exist on the surface
      factory: onlyAfter                 # onlyAfter · precondition · role · valueFromUser ·
                                         # choiceFromUser · argFormat · argAbsent · cap ·
                                         # checkResult · mustAccountFor · blockPattern ·
                                         # prose · deny
      args: { after: getInvoice }        # only the args this factory is configured from
      rule: "Read the invoice first."    # the law in the card's own words, where the factory
                                         # does not mint its own sentence
      wide: sameRefusal                  # a guard naming more than one act declares its
                                         # licence: oneLawEveryAct · sameRefusal
  disclosure:                            # required, keyed by act
    cancelBooking:
      needs:
        booking: getBooking              # short form: answered from the held call's own target
        holds: { tool: listHolds, args: {} }   # full form: the read, and the args it is handed
      before: "Cancelling {booking.room} on {booking.day} is permanent."
      after: "The booking is gone; {holds.count} holds remain."
      later: "A standing sentence while the act stays relevant."
      cap: { arg: amount, at: booking.deposit, not: above, refusal: "…" }
      empty: "When a declared tense finds nothing in the reads to say."
  seam:                                  # optional: the law around a refusal the world spells out
    cancelBooking:
      BOOKING_ACTIVE: "The sentence the operator meeting this code needs."
  rewrites:                              # optional; a rewrite decides nothing
    - { kind: maskPattern, name: card-number, pattern: "\\b\\d{13,19}\\b" }
    - { kind: swapTerms, terms: { invoice: statement } }
  secrets:                               # optional: never spoken, masked at every seam
    - internalNotes
    - { path: customer.taxId, mode: omit }    # omit drops the key; mask stars the value
  wording:                               # optional: the engine sentences this business says
    status: { held: "awaiting your word" }    # differently, keyed by the engine's own names
  limits: { }                            # optional, numbers only
desks:                                   # required, a sequence
  - name: frontdesk
    persona: "One desk's own voice."
    tools: [getBooking, listHolds, cancelBooking]
    teammates: { billing: "what billing does" }    # optional
    conduct:                             # required: law name → this desk's wording of it
      declareHonestly: "…"
    judged:                              # optional: the session's own model answers, per reply
      - { factory: lieCheck, acts: [cancelBooking] }   # lieCheck · impossibilityCheck ·
                                                       # injectionCheck · hallucinationCheck
    limits: { }                          # optional, numbers only
```

## Every refusal, with its message

A refusal is never a stack trace: it names the declaration path (and for shape failures, the
line), states what stands, and says what to do. Three families, collected in this order — and all
of them printed together, so one run shows everything.

### Reading the YAML — `<path> (line N): <detail>`

| when | the message |
|---|---|
| a required field is absent | `is required` |
| a field has the wrong shape | `must be a mapping` · `must be a sequence` · `must be a string` · `must be a number` |
| an enum field carries an unknown word (`factory`, `wide`, `kind`, judged `factory`, secret `mode`) | `must be one of <the closed list, spelled out>` |
| a `needs` alias is neither form | ``must be a read, or a mapping of the read `tool` and the `args` it is answered from`` |
| a `secrets` entry is neither form | ``must be a field name, or a mapping of the `path` and the `mode` it is treated with`` |
| a `seam` act is not a mapping | `must be a mapping of refusal code to the sentence the operator meeting it needs` |
| the document root is not a mapping | `the document root must be a mapping` |
| the YAML itself does not parse | the parser's own message, at its line |

### Against the surface — the declaration names something the world does not carry

| the check | the message |
|---|---|
| a guard act does not exist | `contract.guards[i].acts[j] names 'X', and the surface declares no such act — did you mean 'Y'?` |
| a judged act does not exist, or sits outside the desk's lane | `…names 'X', and the '<desk>' desk's lane holds '<tools>' — scope the check to an act this desk performs, or declare it on the desk that does.` |
| a guard's configuration names a missing act (`onlyAfter`'s `after`) | `contract.guards[i].args.after names 'X', and the surface declares no such act — did you mean 'Y'?` |
| a guard's configuration names an argument outside its act's schema | `contract.guards[i].args.arg names 'X', and '<act>' accepts '<args>'. Pointed at an argument its act does not carry, <the cost>.` — the cost is the factory's own: `valueFromUser` *refuses every call of it*; `argFormat` / `argAbsent` *never fires* |
| a destructive act discloses nothing | ``contract.disclosure.<act> is missing: <act> is destructive and declares no `before` — add one naming what must be confirmed first.`` |
| `precondition` reads a record over a targetless act | `contract.guards[i] reads args.reads: 'record' over 'X', and X declares no target — point the guard at an act with a target, or drop the record read.` |
| a `needs` alias names a missing tool | `contract.disclosure.<act>.needs.<alias> names 'Y', and the surface declares no such tool — did you mean 'Z'?` |
| a full-form `needs` leaves a required argument unfilled | `…hands <read> '<stated>', and <read> requires '<missing>' — state '<missing>' in args, or point needs.<alias> at a read whose every argument is optional.` |
| a short-form `needs` read cannot accept the held call's target | `…needs <read> to accept the held call's target '<id>', and <read> only accepts '<args>' — repoint needs.<alias> at a read that accepts '<id>', or give <act> a target.` |
| a desk holds the act without the owed read in its lane | `…names '<read>', and the '<desk>' desk holds '<act>' without it — the desk cannot run the owed read, and the empty tense would fire with a false reason on every call. Put '<read>' in the <desk> lane, or point needs.<alias> at a read that lane holds.` |
| a seam act does not exist · has no spelled refusal · sits in no lane · names a code never answered | `contract.seam.<act> names an act the surface does not declare` · `the world spells out no refusal on '<act>', so the seam table carries no row for it — read gen/SEAM.md and pay a row it lists.` · `no desk's lane holds '<act>', and a seam law renders on the desks that hold its act — put '<act>' in a desk's tools, or drop the entry.` · `'<act>' is refused with '<codes>', and never with '<code>' — did you mean 'Y'?` |

### Composing the cards — the declaration does not say enough, or says too much

| the check | the message |
|---|---|
| an argument the factory does not read | `contract.guards '<name>' declares args.<x>, and factory '<f>' is configured from <its lawful args> — drop it, or move the law it states onto the guard whose factory reads it` |
| a configuration string the declaration does not carry | `contract.guards '<name>' declares factory '<f>', whose configuration is args.<x> — a string this declaration does not carry` |
| a factory that states its law in the card's own words, with no `rule` | ``contract.guards '<name>' declares factory '<f>', which states its law in the card's own words — declare the `rule` it states`` |
| a field law tested against neither `args.is` nor `args.in`, or both | `…a field law tests it against exactly one of args.is — a single value — or args.in — a list of them; this declaration carries <neither/both>` |
| `args.is` carrying a block instead of a scalar | `…declares args.is as a block of its own, and a field carries one value — declare args.is as a word, a figure or a flag` |
| a sentence still carrying a template slot | `<path> still carries the template slot '<slot>' — fill it with this domain's own nouns before emitting` |

### The subject itself

| when | the message |
|---|---|
| `declaration.yaml` or `world.ts` is absent | `<path> is missing — a subject is one declaration beside the world card it is declared against` |
| the world card declares no act | `<world.ts> states no act this emitter can read — the surface is the keys of reads, writes and destructive on the world card, and each entry is read as it is written` |
