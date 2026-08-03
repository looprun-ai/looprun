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
      'A tool must be off, no matter what. Its scope is the BINDING\'S LIFETIME — the check is `() => reason`, with no turn logic in it at all, so the ban holds for as long as the binding is installed (the name is historical). It is not a repeat detector: reach for `noDuplicateCall` when the FIRST call is legitimate and only the repeat is not.',
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
    summary: 'A destructive tool needs the user\'s go-ahead from an EARLIER turn — licensed `via` a same-record probe, a prior ask, or either. The licensing event is turn-bounded by `within` (default 1). Passing a `via` NAME to the string overload throws at construction.',
    whenToUse:
      'The user must have agreed before this call runs, and the evidence has to be cross-turn — this is the ONE consent gate (it absorbed `confirmedNeedsEarlierProbe`). Its neighbours answer different questions: `destructiveThrottle` caps the blast radius of a turn that IS approved, `consentRequired` reads a standing world flag rather than the conversation, and `pendingConfirmMustAsk` gates the REPLY rather than the call. `via`: `\'probe\'` = a same-record `flag:false` preview of the SAME tool in an earlier turn (the strict, record-bound license); `\'ask\'` = a flag-LESS action gated on the agent having asked the user in a prior turn; `\'either\'` (default) = the flag-gated form licensed by a matching probe OR a prior-turn question to the user. RECENCY LAW: the licensing event must fall `within` turns of now (default 1, the two-step shape) — widen deliberately for genuinely multi-turn flows. The string overload sets the FLAG NAME, so `confirmFirst(\'probe\')` throws rather than silently building a guard that can never fire.',
    example: `confirmFirst('confirmed')`,
  },
  {
    name: 'noActAfterAskSameTurn',
    category: 'confirmation',
    hook: 'preTool',
    summary: 'Denies the listed tools on a turn in which the model already asked the user a question.',
    whenToUse:
      'The mirror image of `confirmFirst`\'s cross-turn requirement: it closes the multi-tool step that asks and executes back to back, which reads as "asked" but never gave the user a chance to answer.',
    example: `noActAfterAskSameTurn(['cancelBooking'])`,
  },
  {
    name: 'destructiveThrottle',
    category: 'confirmation',
    hook: 'preTool',
    summary: 'At most one destructive action that TOOK EFFECT per turn (a confirmation probe does not count).',
    whenToUse:
      'Auto-installed alongside `confirmFirst`. It is the blast-radius cap, not a consent gate: it stops chained destructive calls in one turn even when each one is individually confirmed.',
    example: `destructiveThrottle(['cancelBooking', 'refundOrder'])`,
  },
  {
    name: 'pendingConfirmMustAsk',
    category: 'confirmation',
    hook: 'onReply',
    summary: 'When a probe returned `requiresConfirmation` this turn and nothing resolved it, the reply must relay that question.',
    whenToUse:
      'The world runs the two-step protocol itself: the tool answers "I need confirmation" and the risk is a reply that summarises the action as done. It gates the REPLY; `confirmFirst` gates the call.',
    example: `pendingConfirmMustAsk()`,
  },

  // ── honesty ────────────────────────────────────────────────────────────────
  // NOTE (no-regex law, 2026-08-02): the former regex-param honesty kinds — noFabricatedSuccess,
  // destructiveClaimRequiresSuccess, noFalseFailureClaim, noOutOfSurfaceActionClaim,
  // noUngroundedRegulatedFigure, noCompetitorClaim — are DELETED. Each was a text judgment over the
  // reply ("did the model claim X that did not happen / that it cannot substantiate?"), which is now
  // `llmCheck`'s job: an author binds an `llmCheck` rubric (host adjudicator, no closure-held pattern).
  // The two reply-borne text kinds that lived in `reply.ts` go the same way and for the same reason:
  //   - minimalDisclosure (a PII/regulated-field pattern over the reply, grounded in tool results) →
  //     an `llmCheck` rubric ("does the reply disclose a personal/regulated field the tool results do
  //     not ground?"). PII detection is text judgment, not a structural signal.
  //   - noInstructionFromData (a preTool gate that read reply/result text for an injected imperative) →
  //     an `llmCheck` preTool rubric ("does a tool result instruct a destructive act the user did not
  //     authorise this turn?"). Prompt-injection detection is text judgment; structure cannot decide it.
  //
  // The honesty section is REPOPULATED, deterministically this time (SCG): the three cross-check kinds
  // read the agent's STRUCTURED declaration (`ctx.did`) against the world ledger, never the reply prose —
  // so they carry no pattern and cannot be broken by polarity the way the deleted text kinds were.
  {
    name: 'claimIsGrounded',
    category: 'honesty',
    hook: 'onReply',
    summary:
      'Every operation the agent declares in `did` must match the world ledger: a `success` needs a write that took effect, `not_found` an empty read, `blocked`/`refused` a veto or world refusal, `no_op` no effected write — an undeclared outcome word is always a violation.',
    whenToUse:
      'Always on when the domain declares its `writeTools` (the spec class auto-installs it, fed by `contract.writeTools` + `contract.outcomes`). It is the ledger cross-check that replaced the deleted prose honesty guards: it keys on `target` + `outcome` against verified calls, never on op-name semantics or reply text, so a fabricated success cannot ground. It checks ACTION intentions only — a speech intention (`inform`/`greet`/`refuse`/`ask`) names no ledger fact. A `target` grounds only against the values the WORLD issued for a call (its result), never the call\'s agent-authored args, and by whole-value / whole-token equality, so `BK-1` never grounds against `BK-10`. A domain outcome word must map to a core outcome via the contract\'s outcome map or it reads as undeclared.',
    example: `claimIsGrounded({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } })`,
  },
  {
    name: 'claimIsComplete',
    category: 'honesty',
    hook: 'onReply',
    summary:
      'Every write that TOOK EFFECT this turn must be covered by a DISTINCT `success` ACTION intention in `did` that NAMES the entity — no silent action hidden from the user.',
    whenToUse:
      'Auto-installed alongside `claimIsGrounded` (same `writeTools` + `outcomes`). Its mirror is `claimIsGrounded`: that one stops a claim with no matching effect, this one stops an effect with no matching claim — both resolve a domain outcome word through the same `OutcomeMap`, so a mapped word (e.g. `settled` → `success`) covers a write exactly like the literal word does. Coverage is per-entity and INJECTIVE: a claim with no `target` covers nothing, a speech intention covers nothing, and two writes on the same entity need two claims. It names the unreported action by the world-issued produced label, never by the tool name.',
    example: `claimIsComplete({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } })`,
  },
  {
    name: 'claimCoversRubric',
    category: 'honesty',
    hook: 'onReply',
    summary:
      'Each configured target must appear in `did` with the required outcome polarity (or any polarity when `outcome: \'any\'`).',
    whenToUse:
      'The per-case coverage rule that replaces `replyMentions`/`replyConfirmsLabels`: because polarity is a FIELD, a reply that says "no record of BK-1 was found" can never satisfy a `success` requirement again. The target must be the claim\'s `target` by whole-value / whole-token equality, so a claim about `BK-10` does not answer a rubric about `BK-1`. Config-bound only (a per-case norm) — never auto-installed. Pass `\'any\'` when only the mention matters, a specific outcome when the polarity is the point.',
    example: `claimCoversRubric({ targets: ['BK-100234'], outcome: 'success' }, 'Account for the booking you were asked about.')`,
  },

  // ── reply ──────────────────────────────────────────────────────────────────
  // TOMBSTONE (tier-③ deletion, SCG-T5) — the reply-TEXT guards are DELETED, each recorded with the
  // red-team break that made it unsound (reply prose stopped being a thing guards READ):
  //   · replyMentions       — POLARITY BLINDNESS: a literal mention scan for a record id passes on a reply
  //                           that says the record was NOT found. No pattern reads polarity. Replaced by
  //                           `claimCoversRubric` (honesty.ts), where outcome polarity is a FIELD of `did`.
  //   · replySingleQuestion — PUNCTUATION LITERALISM (batch-c): a second question worded without a '?' (or a
  //                           full-width '？') defeats the one-'?' count. No sound structural fix — a domain
  //                           that truly needs it binds an `llmCheck` rubric (text judgment).
  //   · replyMaxOccurrences — CTA LITERALISM (batch-c): asks worded outside the CTA lemma list bypass the
  //                           cap (0 distinct matched). Same verdict as replySingleQuestion → `llmCheck`.
  //   · emptyReply          — ZERO-WIDTH / WHITESPACE break (batch-a/c): a U+200B / U+2060 reply survives
  //                           trim() and passes as "non-empty". NOT closed by schema — the respond terminal's
  //                           `message` minLength 1 is advisory only (mastra's json-schema-zod conversion
  //                           drops `minLength` at runtime, so it is never enforced there). The real guarantee
  //                           is the ENGINE FLOOR: `finalizeReply` (`runtime/turn.ts`) strips zero-width/format
  //                           characters and, when the composed delivery is still blank (including after a
  //                           mutator rewrite), routes to the non-empty engine-derived exhaustion closure
  //                           instead — no runtime guard needed; the floor is backend-independent.
  {
    name: 'degenerationGuard',
    category: 'reply',
    hook: 'onReply',
    summary: 'Catches leaked reasoning or tool markup, chat-template tokens and run-away line repetition in the reply.',
    whenToUse:
      'The reply is broken as an ARTIFACT rather than wrong as a claim — think blocks, tool-call markup or the same line five times over. No honesty kind fires on that, because nothing was asserted; this one catches the weak-model failure class every domain shares. Always on (auto-installed); it takes no parameters (the former language-specific self-narration branch is now an `llmCheck` job).',
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
    name: 'askedEarlier',
    category: 'structural',
    hook: 'preTool',
    summary: 'A gated argument may be recorded only when the agent asked the user in an EARLIER turn; a same-turn ask does not count.',
    whenToUse:
      'A value the agent must not write until it has asked the operator for it and they answered in a later message — the structural replacement for a hand-written regex over "did we ask?". It keys on the presence of the gated arg plus an earlier-turn question to the user, never on any text.',
    example: `askedEarlier({ tool: 'completeMaintenance', arg: 'condition' })`,
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
  // The reply-TEXT DENY_ONLY kinds (replyMentions / replyMaxOccurrences / replySingleQuestion) are DELETED
  // (tier-③, SCG-T5). claimCoversRubric takes an authored `reason` (the deny) but renders a DERIVED,
  // present-tense rule (`account for <targets> as <outcome>`) — the reason string never reaches the trunk.
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
 * EMPTY since the no-regex law (2026-08-02): the only armed-seam kind was `noFabricatedSuccess`
 * (`banRe`/`banProse`), now DELETED — text judgment is `llmCheck`'s job, and an `llmCheck` carries its
 * whole rubric as prose (no separate seam). The registry stays as the seam the Q12 lint reads; a future
 * regex-free seam that still needs companion prose adds its row here.
 */
export const ARMED_SEAMS: readonly { kind: string; seam: string; prose: string }[] = [];
