/**
 * THE GUARD CATALOG — the vocabulary as DATA.
 *
 * One entry per exported guard/mutator factory: what it enforces, the situation that calls for THIS
 * kind rather than its neighbours, and a minimal call site. The tutorial's guard chapter is GENERATED
 * from this array (Task 10), so a kind added to `guards/` without an entry — or an entry with no
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
  category: 'flow' | 'args' | 'world' | 'confirmation' | 'honesty' | 'reply' | 'custom';
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
      'An ordered flow where a step is meaningless without its predecessors — bind one gate per downstream tool naming all of them. Use this for "which call came first", not for "what state is the world in" (that is precondition).',
    example: `requiresBefore(['findBooking'])`,
  },
  {
    name: 'forbidThisTurn',
    category: 'flow',
    hook: 'preTool',
    summary: 'An unconditional deny of the bound tool while the binding is installed — the first call is denied too.',
    whenToUse:
      'A tool must be off for this turn or this layer, no matter what. It is not a repeat detector: reach for noDuplicateCall when the FIRST call is legitimate and only the repeat is not.',
    example: `forbidThisTurn('Do not reschedule while a cancellation is pending — resolve that first.')`,
  },
  {
    name: 'maxCalls',
    category: 'flow',
    hook: 'preTool',
    summary: 'A tool may succeed at most n times per turn (default) or per conversation.',
    whenToUse:
      'A bulk cap on a tool that is legitimate but expensive or nagging — sweeps, notifications, repeat contact. Pick scope:"conversation" for retention-style limits, scope:"turn" for per-answer budgets.',
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
      'A field the tool cannot do its job without, and the model tends to omit or fill with whitespace. For a field that must be well-FORMED rather than merely present, add argFormat.',
    example: `argRequired('bookingId')`,
  },
  {
    name: 'argAbsent',
    category: 'args',
    hook: 'preTool',
    summary: 'The named argument must not be passed at all.',
    whenToUse:
      'A parameter the model keeps inventing for this tool, or the excluded half of a mutually exclusive pair — bind argAbsent on each side of the pair.',
    example: `argAbsent('customerEmail')`,
  },
  {
    name: 'argFormat',
    category: 'args',
    hook: 'preTool',
    summary: 'A present, non-empty string argument must match the given pattern; absent or empty is left to argRequired.',
    whenToUse:
      'The value has a shape the model can plausibly fabricate — an id, a date, a code. Compose it with argRequired when the field is also mandatory; alone it only polices the values that are actually sent.',
    example: `argFormat('bookingId', '^BK-\\\\d{6}$')`,
  },

  // ── world ──────────────────────────────────────────────────────────────────
  {
    name: 'precondition',
    category: 'world',
    hook: 'preTool',
    summary: 'The call is allowed only while a predicate over the host world holds.',
    whenToUse:
      'A gate whose discriminator lives in WORLD state, not in this call — the predicate never sees the acting call\'s arguments. If the discriminator is in the args, use custom instead.',
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
    summary: 'Risk family 6 — a set of writes may run only while the world says this person\'s consent is on record.',
    whenToUse:
      'Storing, sharing or transmitting personal data. It is precondition specialised to a TOOL SET, which is what makes the consent posture auditable in a spec header; pair it with a conversation-scoped maxCalls for repeat contact.',
    example: `consentRequired({ tools: ['storeProfile'], consentOk: (world) => world.consentOnRecord === true, reason: 'No consent on record — ask for it before storing anything.' })`,
  },

  // ── confirmation ───────────────────────────────────────────────────────────
  {
    name: 'confirmFirst',
    category: 'confirmation',
    hook: 'preTool',
    summary: 'A destructive tool needs the user\'s go-ahead from an EARLIER turn — via a confirm flag probe or a prior ask. Passing a mechanism NAME to the string overload throws at construction.',
    whenToUse:
      'The user must have agreed before this call runs, and the evidence has to be cross-turn — this is the consent gate itself. Its neighbours answer different questions: destructiveThrottle caps the blast radius of a turn that IS approved, consentRequired reads a standing world flag rather than the conversation, and pendingConfirmMustAsk gates the REPLY rather than the call. Mechanism: "arg" when the tool carries a confirm flag, "prior-ask" when it has none and an earlier question is the only possible evidence; the string overload sets the FLAG NAME, so confirmFirst(\'prior-ask\') throws rather than silently building a guard that can never fire.',
    example: `confirmFirst('confirmed')`,
  },
  {
    name: 'noActAfterAskSameTurn',
    category: 'confirmation',
    hook: 'preTool',
    summary: 'Denies the listed tools on a turn in which the model already asked the user a question.',
    whenToUse:
      'The mirror image of confirmFirst\'s cross-turn requirement: it closes the multi-tool step that asks and executes back to back, which reads as "asked" but never gave the user a chance to answer.',
    example: `noActAfterAskSameTurn(['cancelBooking'])`,
  },
  {
    name: 'destructiveThrottle',
    category: 'confirmation',
    hook: 'preTool',
    summary: 'At most one destructive action that TOOK EFFECT per turn (a confirmation probe does not count).',
    whenToUse:
      'Auto-installed alongside confirmFirst. It is the blast-radius cap, not a consent gate: it stops chained destructive calls in one turn even when each one is individually confirmed.',
    example: `destructiveThrottle(['cancelBooking', 'refundOrder'])`,
  },
  {
    name: 'pendingConfirmMustAsk',
    category: 'confirmation',
    hook: 'onReply',
    summary: 'When a probe returned requiresConfirmation this turn and nothing resolved it, the reply must relay that question.',
    whenToUse:
      'The world runs the two-step protocol itself: the tool answers "I need confirmation" and the risk is a reply that summarises the action as done. It gates the REPLY; confirmFirst gates the call.',
    example: `pendingConfirmMustAsk({ askRe: /shall I|do you want me to/i })`,
  },

  // ── honesty ────────────────────────────────────────────────────────────────
  {
    name: 'noFabricatedSuccess',
    category: 'honesty',
    hook: 'onReply',
    summary: 'The reply may not claim a tool\'s effect, cite an invented artifact label, or use a banned phrase when the tool did not succeed this turn.',
    whenToUse:
      'A tool whose output the model likes to announce before it exists. Arm only the seams you need — claim language, label existence, or an unconditional ban — and ship banProse with every banRe.',
    example: `noFabricatedSuccess('generateReport', { reason: 'No report was generated this turn — do not say one was.', claimRe: /report is ready/i })`,
  },
  {
    name: 'destructiveClaimRequiresSuccess',
    category: 'honesty',
    hook: 'onReply',
    summary: 'A declarative claim that a destructive action happened is denied unless one actually took effect this turn.',
    whenToUse:
      'The destructive counterpart of noFabricatedSuccess, attempt-keyed and sentence-scoped: with no attempt this turn a destructive verb is read-back status and is left alone, and questions or offers never count as claims.',
    example: `destructiveClaimRequiresSuccess(['cancelBooking'], { claimRe: /cancelled/i, askRe: /shall I cancel/i, offerRe: /would you like/i })`,
  },
  {
    name: 'noFalseFailureClaim',
    category: 'honesty',
    hook: 'onReply',
    summary: 'When every domain call this turn succeeded and one of them mutated the world, the reply may not claim inability.',
    whenToUse:
      'The work actually went through and the model still apologises for failing — the mirror image of the fabricated-success kinds, which catch the opposite lie. It only adjudicates a turn that MUTATED the world, so an honest "I could not find it" on a read-only turn is never touched. Auto-installed when the lexicon supplies the pattern; keep that pattern to attempted-work-failure phrasing ("failed to", "went wrong"), since a broad inability regex would veto honest policy refusals.',
    example: `noFalseFailureClaim({ claimRe: /failed to|something went wrong/i })`,
  },
  {
    name: 'noOutOfSurfaceActionClaim',
    category: 'honesty',
    hook: 'onReply',
    summary: 'Risk family 4 — a declarative claim of an action whose tool is not on this agent\'s surface is denied.',
    whenToUse:
      'The agent is expected to hand off (billing, legal, dispatch) and the model promises the handoff as done. It deliberately stops at the surface boundary, so it never double-fires with the owned-action honesty kinds.',
    example: `noOutOfSurfaceActionClaim({ actionClaims: [{ claimRe: /refund (?:has been )?issued/i, tool: 'issueRefund' }], surface: ['findBooking'] })`,
  },
  {
    name: 'noUngroundedRegulatedFigure',
    category: 'honesty',
    hook: 'onReply',
    summary: 'Risk family 5 — a figure or conclusion of a regulated class may appear only when a tool returned it this turn.',
    whenToUse:
      'Legal, medical or financial surfaces. Keep allowFromToolResults true when a tool is authoritative for the class; set it false to ban the class outright where nothing in the world can license it.',
    example: `noUngroundedRegulatedFigure({ regulatedRe: /\\b\\d+\\s?mg\\b/i, allowFromToolResults: true })`,
  },
  {
    name: 'noCompetitorClaim',
    category: 'honesty',
    hook: 'onReply',
    summary: 'Risk family 3 — within one sentence, a named third party plus comparative phrasing or a comparative figure is denied.',
    whenToUse:
      'Any user-facing sales or support surface. The figure branch is sound by construction: no tool returns a competitor\'s numbers, so any such number is invented.',
    example: `noCompetitorClaim({ competitorRe: /\\bAcme\\b/i, comparativeRe: /\\b(?:better|cheaper|faster) than\\b/i })`,
  },

  // ── reply ──────────────────────────────────────────────────────────────────
  {
    name: 'replyMustMention',
    category: 'reply',
    hook: 'onReply',
    summary: 'The reply must contain at least one of the given keywords (case-insensitive).',
    whenToUse:
      'A mandatory element of coverage that is the same on every turn — a referral phrase, a required disclaimer. For "name the records you just acted on", use replyConfirmsLabels instead.',
    example: `replyMustMention(['support@example.com'], 'Give the support address so the person can follow up.')`,
  },
  {
    name: 'replyMaxOccurrences',
    category: 'reply',
    hook: 'onReply',
    summary: 'At most n DISTINCT calls-to-action from the list may appear in one reply.',
    whenToUse:
      'Anti-nag: the model stacks several different asks onto one message. It counts distinct entries, not repetitions, so one CTA restated inside a single ask still passes.',
    example: `replyMaxOccurrences(['book now', 'call us', 'subscribe'], 1, 'One ask per reply — drop the extra calls-to-action.')`,
  },
  {
    name: 'replySingleQuestion',
    category: 'reply',
    hook: 'onReply',
    summary: 'The reply must carry exactly one question mark.',
    whenToUse:
      'Recovery and clarification turns, where a pile of questions at once is what stalls the conversation. Bind it to the layer that handles those turns, not to every reply.',
    example: `replySingleQuestion('Ask exactly one question so the person can answer it.')`,
  },
  {
    name: 'replyConfirmsLabels',
    category: 'reply',
    hook: 'onReply',
    summary: 'The reply must be non-empty and name every one of the given labels.',
    whenToUse:
      'The model just acted on identified records and the user needs to see WHICH ones. Unlike replyMustMention (any one keyword), every label is required.',
    example: `replyConfirmsLabels(['BK-100234'], 'Name the booking you acted on so the person can check it.')`,
  },
  {
    name: 'emptyReply',
    category: 'reply',
    hook: 'onReply',
    summary: 'The final reply must not be blank.',
    whenToUse:
      'Always on (auto-installed). It is the floor under every other reply kind: a turn that ends with nothing said is a failure no other guard would catch.',
    example: `emptyReply()`,
  },
  {
    name: 'degenerationGuard',
    category: 'reply',
    hook: 'onReply',
    summary: 'Catches leaked reasoning or tool markup, chat-template tokens and run-away line repetition in the reply.',
    whenToUse:
      'The reply is broken as an ARTIFACT rather than wrong as a claim — think blocks, tool-call markup or the same line five times over. No honesty kind fires on that, because nothing was asserted; this one catches the weak-model failure class every domain shares. Always on (auto-installed); pass selfNarrationRe to add the language-specific third-person self-narration branch.',
    example: `degenerationGuard({ selfNarrationRe: /the assistant (?:then )?(?:called|checked)/i })`,
  },
  {
    name: 'minimalDisclosure',
    category: 'reply',
    hook: 'onReply',
    summary: 'Risk family 1 — caps how many records\' personal FIELDS one reply may carry, and requires each named field to have been returned by a tool this turn.',
    whenToUse:
      'Any surface that reads personal records. It keys on field-name tokens, never on entity mentions, so a correct multi-record summary that lists only ids and dates stays legal.',
    example: `minimalDisclosure({ piiFields: ['phone', 'email'], entityIdRe: /\\bCU-\\d{5}\\b/, maxEntities: 1 })`,
  },
  {
    name: 'noInstructionFromData',
    category: 'reply',
    hook: 'preTool',
    summary: 'Risk family 2 — denies the listed destructive tools while an imperative sits in the conversation\'s tool results and no earlier turn exposed the action to the user.',
    whenToUse:
      'Tool results can carry attacker-controlled text (notes, messages, tickets). The proxy is deliberately conservative — it converts a poisoned same-turn request into the legal ask-then-act two-turn flow.',
    example: `noInstructionFromData({ tools: ['cancelBooking'], instructionRe: /please cancel|delete all/i })`,
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

  // ── custom ─────────────────────────────────────────────────────────────────
  {
    name: 'custom',
    category: 'custom',
    hook: 'preTool',
    summary: 'The escape hatch: a guard whose kind, dim, check and prose the spec author writes by hand.',
    whenToUse:
      'Only when no kind fits — typically a domain concept the runtime carries no vocabulary for (media, labels, provenance) read through the world\'s own accessors. Its hook follows the `dim` you pass (the row says preTool because the example is a `run` guard); replicate the shared kinds\' exemptions, since reviewers read this code.',
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
  'noFabricatedSuccess',
  'replyMustMention',
  'replyMaxOccurrences',
  'replySingleQuestion',
  'replyConfirmsLabels',
];

/**
 * The CONFIRM-CLASS kinds: a destructive tool counts as confirm-protected when a guard of one of these
 * kinds targets it (directly or via `target:'any'`). The Q5 destructive-without-confirm lint treats any
 * of these — keyed by the real runtime `kind`, not a source token — as satisfying the requirement.
 */
export const CONFIRM_CLASS_KINDS: readonly string[] = ['confirmFirst', 'destructiveThrottle', 'precondition'];

/**
 * ARMED SEAMS: a guard kind that DENIES on a business-owned pattern (`seam`) whose forbidden-thing is an
 * arbitrary domain regex the runtime cannot put into words (P8a), paired with the option (`prose`) that
 * must carry the missing sentence. The Q12 armed-seam-without-prose lint fails a spec that arms `seam`
 * without also passing `prose`. Add a row when a new such seam ships; a seam whose prose IS derivable
 * from its arguments does NOT belong here (see the factory notes).
 */
export const ARMED_SEAMS: readonly { kind: string; seam: string; prose: string }[] = [
  { kind: 'noFabricatedSuccess', seam: 'banRe', prose: 'banProse' },
];
