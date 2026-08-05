/**
 * THE GUARD CATALOG — the vocabulary as DATA.
 *
 * One entry per exported guard/mutator factory: what it enforces, the situation that calls for THIS
 * kind rather than its neighbours, and a minimal call site. The tutorial's guard chapter is GENERATED
 * from this array by `scripts/gen-guards-chapter.mjs`, so a kind added to `guards/` without an entry — or an entry with no
 * backing factory — fails `test/guard-catalog-parity.test.ts` instead of silently shipping an
 * undocumented kind.
 *
 * Not on the public barrel: `GUARD_CATALOG` is documentation infrastructure, not agent-authoring
 * vocabulary. It ships from `@looprun-ai/core/internal` (outline §6, decision 4).
 *
 * Every `example` is a self-contained expression over the public contract plus the factory itself — the
 * parity test asserts each one names its own factory, and the chapter generator embeds them verbatim.
 */

export interface GuardCatalogEntry {
  name: string;            // factory name, e.g. 'confirmFirst'
  category: 'flow' | 'args' | 'world' | 'confirmation' | 'honesty' | 'reply' | 'structural' | 'custom' | 'llm-check';
  /**
   * The hook the runtime INSTALLS the kind on — the axis the agentspec reference catalog is
   * organized by, and the one the generated chapter groups by. It is not computed from the factory's
   * `dim`: `spec.ts#DIM_HOOKS` maps a dim to the SET of hooks that are legal for it (`run` is legal on
   * onInput/preTool/postTool alike), so the dim narrows the choice without making it. This field
   * records the choice — in practice `spatial`/`input`/`run` → `preTool`, `output` → `postTool`,
   * `behavior` → `onReply`, and a `ReplyMutator` → `onReplyMutate`. It is NOT derivable
   * from `category`, which is the FILE the factory lives in: `noInstructionFromData` sits in
   * `reply.ts` (it is about reply-borne data) but gates a call, so its hook is `preTool`.
   */
  hook: 'preTool' | 'postTool' | 'onReply' | 'onReplyMutate';
  summary: string;         // one line: what it enforces
  whenToUse: string;       // one or two lines: the situation that calls for it
  example: string;         // minimal TS snippet, compilable in isolation
}

export const GUARD_CATALOG: readonly GuardCatalogEntry[] = [
  // ── flow ───────────────────────────────────────────────────────────────────
  {
    name: 'requiresBefore',
    category: 'flow',
    hook: 'preTool',
    summary: 'A tool may run only after every named dependency has already run successfully this conversation.',
    whenToUse:
      'An ordered flow where a step is meaningless without its predecessors — bind one gate per downstream tool naming all of them. Use this for "which call came first", not for "what state is the world in" (that is `precondition`).',
    example: `requiresBefore(['findBooking'])`,
  },
  {
    name: 'forbidThisTurn',
    category: 'flow',
    hook: 'preTool',
    summary: 'An unconditional deny of the bound tool while the binding is installed — the first call is denied too.',
    whenToUse:
      'A tool must be off, no matter what. Its scope is the BINDING\'S LIFETIME — the check is `() => reason`, with no turn logic in it at all, so — despite the name — the ban holds for as long as the binding is installed, not for one turn. It is not a repeat detector: reach for `noDuplicateCall` when the FIRST call is legitimate and only the repeat is not.',
    example: `forbidThisTurn('Do not reschedule while a cancellation is pending — resolve that first.')`,
  },
  {
    name: 'maxCalls',
    category: 'flow',
    hook: 'preTool',
    summary: 'A tool may succeed at most n times per turn (default) or per conversation.',
    whenToUse:
      'A bulk cap on a tool that is legitimate but expensive or nagging — sweeps, notifications, repeat contact. Pick `scope: \'conversation\'` for retention-style limits, `scope: \'turn\'` for per-answer budgets.',
    example: `maxCalls('sendEmail', 1, 'You already emailed this person.', { scope: 'conversation' })`,
  },
  {
    name: 'noDuplicateCall',
    category: 'flow',
    hook: 'preTool',
    summary: 'Denies a call whose tool and canonical arguments already succeeded earlier in the same turn.',
    whenToUse:
      'Always on (the spec class auto-installs it): it stops the same-turn retry loop where a model re-reads an identical query hoping for a different answer. Cross-turn repeats stay legal — a later turn is a genuine refresh.',
    example: `noDuplicateCall()`,
  },

  // ── args ───────────────────────────────────────────────────────────────────
  {
    name: 'argRequired',
    category: 'args',
    hook: 'preTool',
    summary: 'The named argument must be present and non-empty (a blank string counts as missing).',
    whenToUse:
      'A field the tool cannot do its job without, and the model tends to omit or fill with whitespace. For a field that must be well-FORMED rather than merely present, add `argFormat`.',
    example: `argRequired('bookingId')`,
  },
  {
    name: 'argAbsent',
    category: 'args',
    hook: 'preTool',
    summary: 'The named argument must not be passed at all.',
    whenToUse:
      'A parameter the model keeps inventing for this tool, or the excluded half of a mutually exclusive pair — bind `argAbsent` on each side of the pair.',
    example: `argAbsent('customerEmail')`,
  },
  {
    name: 'argFormat',
    category: 'args',
    hook: 'preTool',
    summary: 'A present, non-empty string argument must match the given pattern; absent or empty is left to `argRequired`.',
    whenToUse:
      'The value has a shape the model can plausibly fabricate — an id, a date, a code. Compose it with `argRequired` when the field is also mandatory; alone it only polices the values that are actually sent.',
    example: `argFormat('bookingId', '^BK-\\\\d{6}$')`,
  },

  // ── world ──────────────────────────────────────────────────────────────────
  {
    name: 'precondition',
    category: 'world',
    hook: 'preTool',
    summary: 'The call is allowed only while a predicate over the host world holds.',
    whenToUse:
      'A gate whose discriminator lives in WORLD state, not in this call — the predicate never sees the acting call\'s arguments. If the discriminator is in the args, use `custom` instead.',
    example: `precondition((world) => world.accountActive === true, 'This account is closed — you cannot act on it.', 'act on an account only while it is open')`,
  },
  {
    name: 'resultInvariant',
    category: 'world',
    hook: 'postTool',
    summary: 'A post-execution check on the tool RESULT: when the predicate fails, the violation joins the reply redrive set.',
    whenToUse:
      'The call already ran and cannot be undone, but its result must not be reported as if it satisfied the request — an empty report, a partial write. It never vetoes the call; it corrects the reply.',
    example: `resultInvariant((result) => Array.isArray(result) && result.length > 0, 'The search returned nothing — say so instead of summarising it.', 'report an empty result as empty')`,
  },
  {
    name: 'consentRequired',
    category: 'world',
    hook: 'preTool',
    summary: 'A set of writes may run only while the world says this person\'s consent is on record.',
    whenToUse:
      'Storing, sharing or transmitting personal data. It is `precondition` specialised to a TOOL SET, which is what makes the consent posture auditable in a spec header; pair it with a conversation-scoped `maxCalls` for repeat contact.',
    example: `consentRequired({ tools: ['storeProfile'], consentOk: (world) => world.consentOnRecord === true, reason: 'No consent on record — ask for it before storing anything.' })`,
  },

  // ── confirmation ───────────────────────────────────────────────────────────
  {
    name: 'confirmFirst',
    category: 'confirmation',
    hook: 'preTool',
    summary: 'A destructive tool runs only on a turn whose incoming message carried the engine-issued confirmation token for THIS record. Takes no options.',
    whenToUse:
      'The user must have agreed before this call runs, and the agreement has to be THEIRS: the engine issues a confirmation token naming the record, renders it into the delivered text, and this gate allows the act only on a turn whose incoming message carried that token back. There is nothing to configure, because there is no declaration to trust — the agent has no channel through which to produce a consent. Its neighbours answer different questions: `destructiveThrottle` caps the blast radius of a turn that IS confirmed, and `consentRequired` reads a standing world flag rather than the conversation. A denial is also what RAISES the question for a tool the world has no preview form for, so attempting the act is what asks permission for it — and such a tool needs a declared label on the spec, or it can issue no question and never runs.',
    example: `confirmFirst()`,
  },
  {
    name: 'destructiveThrottle',
    category: 'confirmation',
    hook: 'preTool',
    summary: 'At most one destructive action that TOOK EFFECT per turn (a probe does not count; a call that RAN with no world record of its effect does).',
    whenToUse:
      'Auto-installed alongside `confirmFirst`. It is the blast-radius cap, not a consent gate: it stops chained destructive calls in one turn even when each one is individually confirmed. A same-step call that is NOT confirmed reads as a preview and does not count (so a legitimate multi-preview is not vetoed) — which means a tool with NO confirm flag needs `flagless`, or its same-step cap never engages. `AgentSpecBase` passes its `prior-ask` tools automatically; pass them yourself when you install this by hand.',
    example: `destructiveThrottle(['cancelBooking', 'purgeAccount'], { flagless: ['purgeAccount'] })`,
  },

  // ── honesty ────────────────────────────────────────────────────────────────
  // THE HONESTY KINDS ARE STRUCTURAL, NOT TEXTUAL: each reads the agent's declaration (`ctx.did`)
  // against the world ledger, never the reply prose, so it carries no pattern and no polarity that a
  // wording can flip. Judgments that only text can settle stay OUT of this section and belong to
  // `llmCheck`, where a host adjudicator decides and no closure holds a pattern:
  //   - "did the model claim something that did not happen, or that it cannot substantiate?"
  //   - "does the reply disclose a personal or regulated field the tool results do not ground?"
  //     (PII detection is text judgment, not a structural signal)
  //   - "does a tool result instruct a destructive act the user did not authorise this turn?"
  //     (prompt-injection detection is text judgment; structure cannot decide it)
  {
    name: 'claimIsGrounded',
    category: 'honesty',
    hook: 'onReply',
    summary:
      'Every operation the agent declares in `did` must match the world ledger: a `success` needs a write that took effect, `not_found` an empty read, `blocked`/`refused` a veto or world refusal, `no_op` a call that addressed the entity and no effected write on it — an undeclared outcome word is always a violation.',
    whenToUse:
      'Always on when the domain declares its `writeTools` (the spec class auto-installs it, fed by `contract.writeTools` + `contract.outcomes`). It is the ledger cross-check: it keys on `target` + `outcome` against verified calls, never on op-name semantics or reply text, so a fabricated success cannot ground. It checks ACTION intentions only — a speech intention (`inform`/`greet`/`refuse`/`ask`) names no ledger fact. A `target` matches an IDENTITY the ledger carries — a scalar under `id`/`label`/`<entity>Id`, never a status word, a note or a sentence — by WHOLE-VALUE equality, so `BK-1` never grounds against `BK-10` and `12` never stands for `Order 12`. A `success` matches only what the WORLD issued for the write (its own entity, not the ones its result references); a claim of absence or non-effect (`not_found`/`failure`/`blocked`/`refused`/`pending_confirmation`/`no_op`) matches the world\'s negative answer plus the identity-key ARGS that name the entity asked about, because an absent record issues no value of its own. An `amount`, when declared, must appear among the magnitudes of that same ledger fact. A domain outcome word must map to a core outcome via the contract\'s outcome map or it reads as undeclared.',
    example: `claimIsGrounded({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } })`,
  },
  {
    name: 'claimIsComplete',
    category: 'honesty',
    hook: 'onReply',
    summary:
      'Every write that TOOK EFFECT this turn must be covered by a DISTINCT `success` ACTION intention in `did` that NAMES the entity — no silent action hidden from the user.',
    whenToUse:
      'Auto-installed alongside `claimIsGrounded` (same `writeTools` + `outcomes`). Its mirror is `claimIsGrounded`: that one stops a claim with no matching effect, this one stops an effect with no matching claim — both resolve a domain outcome word through the same `OutcomeMap`, so a mapped word (e.g. `settled` → `success`) covers a write exactly like the literal word does. Coverage is per-entity and INJECTIVE — assigned as a maximum matching, so claim order never starves an honest turn: a claim with no `target` covers nothing, a speech intention covers nothing, and two writes on the same entity need two claims. A write is covered only through the identity the world issued for IT (`{id:\'ORD-1\', parentId:\'ORD-2\'}` is ORD-1). It names the unreported action by the world-issued produced label, never by the tool name.',
    example: `claimIsComplete({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } })`,
  },
  {
    name: 'claimCoversRubric',
    category: 'honesty',
    hook: 'onReply',
    summary:
      'Each configured target must appear in `did` with the required outcome polarity (or any polarity when `outcome: \'any\'`).',
    whenToUse:
      'The per-case coverage rule: because polarity is a FIELD, a reply that says "no record of BK-1 was found" can never satisfy a `success` requirement again. The target must BE the claim\'s `target` by whole-value equality, so neither a claim about `BK-10` nor a sentence-shaped target answers a rubric about `BK-1`. Config-bound only (a per-case norm) — never auto-installed. Pass `\'any\'` when only the mention matters, a specific outcome when the polarity is the point.',
    example: `claimCoversRubric({ targets: ['BK-100234'], outcome: 'success' }, 'Account for the booking you were asked about.')`,
  },

  // ── reply ──────────────────────────────────────────────────────────────────
  // REPLY PROSE IS NOT A THING GUARDS READ FOR MEANING. A literal scan over a reply cannot see polarity
  // (a mention of a record id reads the same whether the reply says it was found or not found), cannot
  // see a question worded without a '?', and cannot see an ask worded outside a lemma list — so
  // coverage and polarity are `claimCoversRubric`'s job over the structured `did`, and anything that
  // genuinely needs to weigh wording is an `llmCheck` rubric.
  // The NON-EMPTY guarantee is likewise not a guard: `finalizeReply` (`runtime/turn.ts`) strips
  // zero-width/format characters and routes a still-blank composed delivery (including after a mutator
  // rewrite) to the non-empty engine-derived exhaustion closure. Schema cannot decide it — a zero-width
  // message SATISFIES the respond terminal's `message` minLength — and the engine floor is
  // backend-independent.
  {
    name: 'degenerationGuard',
    category: 'reply',
    hook: 'onReply',
    summary: 'Catches leaked reasoning or tool markup, chat-template tokens and run-away line repetition in the reply.',
    whenToUse:
      'The reply is broken as an ARTIFACT rather than wrong as a claim — think blocks, tool-call markup or the same line five times over. No honesty kind fires on that, because nothing was asserted; this one catches the weak-model failure class every domain shares. Always on (auto-installed); it takes no parameters — language-specific judgments such as self-narration are text judgment, so an author who wants one binds an `llmCheck` rubric.',
    example: `degenerationGuard()`,
  },
  {
    name: 'jargonScrub',
    category: 'reply',
    hook: 'onReplyMutate',
    summary: 'A deterministic egress rewrite of internal vocabulary into user words (word-boundary, case-insensitive).',
    whenToUse:
      'Internal status codes and field names leak into replies and no gate can sensibly deny them. It is a MUTATOR, not a guard: it rewrites and never vetoes, so it has no pass/fail behaviour to prove.',
    example: `jargonScrub({ CANC_PEND: 'waiting to be cancelled' })`,
  },

  // ── structural ───────────────────────────────────────────────────────────────
  {
    name: 'valueFromUser',
    category: 'structural',
    hook: 'preTool',
    summary: 'A field the agent fills in on the user\'s behalf must carry the value the user actually said.',
    whenToUse:
      'The world is meant to receive what the PERSON said, not the agent\'s version of it. The recorded value is compared against everything the user has said in the conversation, as a contiguous run of whole tokens — so a value they never said is denied, and so is a paraphrase of one they did. Fires only when the gated argument is present on the call.',
    example: `valueFromUser({ arg: 'email' })`,
  },

  // ── llm-check ────────────────────────────────────────────────────────────────
  {
    name: 'llmCheck',
    category: 'llm-check',
    hook: 'onReply',
    summary: 'An LLM-adjudicated guard: a host-registered adjudicator answers a trusted rubric over the full context (history + user text) and its verdict becomes the deny.',
    whenToUse:
      'The judgement genuinely needs a model — "did the operator\'s yes license THIS act?", a promise no arg/observed pattern captures. Use it where structure alone cannot decide; a decidable structural signal always prefers its own kind. The adjudicator is host-registered on the runtime options (never in config), and `failMode` prices an unreachable adjudicator: `\'open\'` allows, `\'closed\'` denies.',
    example: `llmCheck({ rubric: 'Did the user, in an earlier turn, explicitly authorise THIS exact action?', failMode: 'closed' })`,
  },
  {
    name: 'didMessageConsistency',
    category: 'llm-check',
    hook: 'onReply',
    summary: 'The `did` × `message` backstop: an adjudicator answers a pre-baked rubric asking whether the message asserts an operation the declaration does not carry, or contradicts a declared intention.',
    whenToUse:
      'The deterministic cross-check grounds the DECLARATION against the ledger, but the message beside it is free prose — an agent can declare an honest `inform` and still write that it completed something. Install this where the stakes justify a model call per reply (money, health). It is NOT auto-installed and it is never the primary guarantee: the structured cross-check grounds the declaration, and the operation record ships under every delivery so a claim the turn cannot back arrives contradicted. This is a third layer over both. Unlike bare `llmCheck` it fails CLOSED by default: an author binds it where those two are not enough, so an adjudicator outage must not silently delete it. Pass `failMode: \'open\'` to trade the guarantee for availability; either way an unreachable adjudicator is recorded as an `llmcheck-unreachable:<failMode>` correction.',
    example: `didMessageConsistency()`,
  },

  // ── custom ─────────────────────────────────────────────────────────────────
  {
    name: 'custom',
    category: 'custom',
    hook: 'preTool',
    summary: 'The escape hatch: a guard whose kind, dim, check and prose the spec author writes by hand.',
    whenToUse:
      'Only when no kind fits — typically a domain concept the runtime carries no vocabulary for (media, labels, provenance) read through the world\'s own accessors. It is the one factory whose hook YOU choose, by the `dim` you pass: it is classified under `preTool` here only because this example is a `run` guard. Replicate the shared kinds\' exemptions, since reviewers read this code.',
    example: `custom({ kind: 'imageQuotaLeft', dim: 'run', check: (ctx) => (ctx.world.imageQuotaRemaining > 0 ? null : 'No image quota left this month — say so instead of generating.'), prose: () => 'generate an image only while quota remains' })`,
  },
];

// ── GUARD-KIND CLASSIFICATION REGISTRIES (the single source of truth for the spec-quality lint) ────
//
// These three constants are the RUNTIME's OWN classification of its guard kinds — a property of how
// each factory renders its prose / arms its seams. A spec-quality gate that re-encodes an
// equivalent list with no binding to this file drifts silently: rename a kind here and the gate keeps
// classifying a name the runtime does not produce.
//
// They live beside the catalog data they belong with, so a change to a kind's prose/seam contract updates
// its classification in the SAME edit; the lint reads them out of the instantiated runtime (via the
// `emit-guard-classes` emitter) instead of hardcoding them. Domain-neutral by construction — every entry
// is a guard-KIND name or a factory-OPTION key, never business vocabulary (the P8a law). They ship from
// `@looprun-ai/core/internal`, which is where the eval linters read them.

/**
 * The kinds whose `prose()` is DERIVED from their own parameters, so the `reason`/deny STRING they are
 * constructed with never reaches the trunk (the prose≠reason law — see each factory's
 * note). The Q11 post-hoc-accusation lint EXCLUDES these kinds' reason strings from its scan, because
 * only their derived (rule-shaped, present-tense) prose actually renders.
 */
export const DENY_ONLY_PROSE_KINDS: readonly string[] = [
  'forbidThisTurn',
  'maxCalls',
  // claimCoversRubric takes an authored `reason` (the deny) but renders a DERIVED, present-tense rule
  // (`account for <targets> as <outcome>`) — the reason string never reaches the trunk.
  'claimCoversRubric',
];

/**
 * The CONFIRM-CLASS kinds: a destructive tool counts as confirm-protected when a guard of one of these
 * kinds targets it (directly or via `target:'any'`). The Q5 destructive-without-confirm lint treats any
 * of these — keyed by the real runtime `kind`, not a source token — as satisfying the requirement.
 */
export const CONFIRM_CLASS_KINDS: readonly string[] = ['confirmFirst', 'destructiveThrottle', 'precondition'];

/**
 * ARMED SEAMS: a guard kind that DENIES on a business-owned pattern (`seam`) whose forbidden-thing is an
 * arbitrary domain regex the runtime cannot put into words, paired with the option (`prose`) that must
 * carry the missing sentence. The Q12 armed-seam-without-prose lint fails a spec that arms `seam` without
 * also passing `prose`.
 *
 * EMPTY: no guard kind denies on a business-owned pattern. Text judgment is `llmCheck`'s job, and an
 * `llmCheck` carries its whole rubric as prose, so it needs no separate seam. The registry is the seam
 * the Q12 lint reads; a regex-free seam that still needs companion prose adds its row here.
 */
export const ARMED_SEAMS: readonly { kind: string; seam: string; prose: string }[] = [];
