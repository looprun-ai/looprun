/** The dependency-free contract leaf (L0): every crossing type, closed unions only;
 *  one home per shape. This module imports NOTHING. */

export type Json = string | number | boolean | null | readonly Json[] | { readonly [k: string]: Json };
export type Effect = 'read' | 'write' | 'destructive';       // 'destructive' = irreversible act of any kind
export type Done = 'yes' | 'no' | 'unknown';                 // the executor's whole vocabulary
export type Status = 'done' | 'not-done' | 'unknown';        // THE user-facing word, engine-derived
export type Reason = 'held' | 'refused' | 'blocked';         // why not-done
export type ReportWord = 'done' | 'held' | 'refused' | 'unknown'
  | 'no_tool_called';                         // the model's closing vocabulary: refused = turned down
                                              //   (by the system or a rule); no_tool_called = a
                                              //   decision to act in words only
export type Evidence = 'executor' | 'diff' | 'engine';       // who grounded the status
export type QuestionClose = 'declined' | 'superseded' | 'expired' | 'vetoed';
export type QuestionState = 'open' | 'consumed' | { readonly closed: QuestionClose };
export interface ChatMsg { readonly role: 'user' | 'assistant'; readonly text: string }
/** What this turn's calls did, typed — the seat renders it in its own dialect
 *  (native tool messages on a provider seat; ignored by a scripted seat). */
export interface ActsMsg { readonly role: 'acts'; readonly acts: readonly Act[] }
export type Msg = ChatMsg | ActsMsg;
export interface ToolAnswer { readonly result: Json; readonly done: Done }
/** One world change: set fields on an existing record, make a new record whole,
 *  or remove one. A set/remove naming a missing record refuses; a make naming an
 *  existing one refuses — patches validate all-then-apply, never half. */
export type Patch =
  | { readonly entity: string; readonly id: string; readonly set: Readonly<Record<string, Json>> }
  | { readonly entity: string; readonly id: string; readonly make: Readonly<Record<string, Json>> }
  | { readonly entity: string; readonly id: string; readonly remove: true };

/** The call as the executor receives it: the tool name and the coerced REAL args — nothing else.
 *  A simulation downgrade exists only as the tool's OWN declared parameter set inside args.
 *  No other field exists: no options, no flags, no attestation override. */
export interface ReadyCall { readonly tool: string; readonly args: Readonly<Record<string, Json>> }

/** The frozen data form of a canonical call. Where it is RECORDED or DELIVERED (Act.call,
 *  Question.call), args are masked; the executable form lives only in engine-private state. */
export interface CanonicalCallData { readonly tool: string;
                                     readonly args: Readonly<Record<string, Json>>;
                                     readonly key: string }

export type Verdict =
  | { readonly kind: 'allow' }
  | { readonly kind: 'refuse'; readonly guardName: string; readonly detail: string }
  | { readonly kind: 'hold'; readonly guardName: string;    // consent: hold-and-ask; a declared
      readonly sentence: string }                           //   simulation rides the hold route
  | { readonly kind: 'restate'; readonly actId: string }      // duplicate call: the first result restated
  | { readonly kind: 'owe'; readonly reads: readonly OwedRead[] };   // rule-owed reads the ENGINE performs
export interface OwedRead { readonly alias: string; readonly tool: string; readonly args: Readonly<Record<string, Json>> }
export type Correction =
  | { readonly kind: 'redrive'; readonly guardName: string; readonly detail: string }
  | { readonly kind: 'postToolFinding'; readonly guardName: string; readonly detail: string }
  | { readonly kind: 'earlyFinish' } | { readonly kind: 'staleFinish' } | { readonly kind: 'forcedFinish' }
  | { readonly kind: 'recordCorrected'; readonly actId: string; readonly said: Done }   // snapshot diff overruled the executor
  | { readonly kind: 'simulationRevoked'; readonly tool: string }
  | { readonly kind: 'judgeUnreadable'; readonly guardName: string };
export interface Act {
  readonly id: string;                        // engine-minted
  readonly turn: number;
  readonly origin: 'model' | 'engine' | 'licence';
  readonly call: CanonicalCallData;           // masked on record — the ONLY stored form
  readonly effect: Effect;
  readonly said: Done | null;                 // the executor's own word; null = the call never reached it
  readonly status: Status;                    // the engine's word, derived — never guessed
  readonly reason: Reason | null;             // set exactly when status is 'not-done'
  readonly evidence: Evidence;
  readonly sentence: string;                  // the record line the user reads
  readonly result: Json;                      // masked; on a held call with simulation: the simulated result
  readonly questionId: string | null;         // the consent question this act raised or served
  readonly guard: string | null;              // the guard whose verdict shaped this act; null = none
}
export interface ReportLine { readonly tool: string; readonly target: string; readonly word: ReportWord }
export interface FinishPayload { readonly message: string; readonly report: readonly ReportLine[] }
export interface RawCall { readonly tool: string; readonly args: Readonly<Record<string, unknown>> }
export interface ToolCard { readonly name: string; readonly does: string; readonly schema: Json }
                                              // does = the declared does + the tool's contract-guard
                                              //   sentences — the prose channel
export interface StepInput { readonly system: string; readonly messages: readonly Msg[];
                             readonly tools: readonly ToolCard[]; readonly forceFinish: boolean;
                             readonly llmParams: LlmParams }
export interface ModelStep { readonly calls: readonly RawCall[]; readonly text: string }
export interface Question {
  readonly id: string;
  readonly code: string;                      // 'CONFIRM 7Q4MX' — crypto entropy + per-issuance nonce,
                                              //   unique among open codes, NO tool name
  readonly call: CanonicalCallData;           // the held call, masked display form; the executable
                                              //   call lives in ConsentDesk private state
  readonly sentence: string;                  // label + filled before-tense — what the user is agreeing to
  readonly state: QuestionState;
  readonly bornAtTurn: number;
}
export interface TurnRecord {
  readonly turn: number;
  readonly servedBy: string;                  // which certified target answered
  readonly userText: string;
  readonly acts: readonly Act[];
  readonly questions: { readonly issued: readonly Question[]; readonly consumed: readonly string[];
                        readonly closed: readonly { readonly id: string; readonly why: QuestionClose }[] };
  readonly finish: FinishPayload | null;
  readonly corrections: readonly Correction[];
  readonly text: string;                      // the composed delivery
  readonly closedBy: 'model' | 'engine';
}
export class TurnFailure extends Error {      // typed, loud; a failed turn seals NOTHING
  readonly kind: 'provider-auth' | 'provider-quota' | 'network' | 'executor' | 'construction';
  readonly detail: string;
  constructor(kind: TurnFailure['kind'], detail: string) {
    super(`${kind}: ${detail}`);
    this.name = 'TurnFailure';
    this.kind = kind;
    this.detail = detail;
  }
}
export class CardError extends Error {        // every problem at once
  readonly problems: readonly { readonly code: string; readonly sentence: string }[];
  constructor(problems: CardError['problems']) {
    super(problems.map(p => `${p.code}: ${p.sentence}`).join('\n'));
    this.name = 'CardError';
    this.problems = problems;
  }
}
export interface InputCtx  { readonly userText: string;
                             readonly turnActs: readonly Act[]; readonly pastActs: readonly Act[] }
export interface CallCtx   { readonly call: CanonicalCallData; readonly effect: Effect;
                             readonly consented: boolean;      // true only on the engine-fed licensed call
                             readonly state: StateSnapshot | null;   // frozen; null on a stateless surface
                             readonly userText: string;
                             // every message the operator has sent, this turn included
                             readonly userTexts: readonly string[];
                             readonly turnActs: readonly Act[]; readonly pastActs: readonly Act[] }
export interface ResultCtx { readonly call: CanonicalCallData; readonly result: Json;
                             readonly state: StateSnapshot | null;
                             readonly userText: string;
                             readonly turnActs: readonly Act[]; readonly pastActs: readonly Act[] }
export interface ReplyCtx  { readonly message: string; readonly report: readonly ReportLine[];
                             readonly userText: string;
                             readonly turnActs: readonly Act[]; readonly pastActs: readonly Act[] }
                                              // every ctx carries the user's text as a string for
                                              //   EXACT-LITERAL search — whole-token, contiguous,
                                              //   whole-value equal; a guard never interprets it.
                                              //   A state predicate on a stateless surface is a
                                              //   construction error, never a silent null-pass
export type StateSnapshot = { readonly [entity: string]: { readonly [id: string]: Readonly<Record<string, Json>> } };
export interface InstalledGuard { readonly name: string; readonly rule: string;
                                  readonly home: 'spec' | 'contract' | 'engine';
                                  readonly on: 'input' | 'preTool' | 'postTool' | 'reply';
                                  readonly tools: readonly string[];
                                  readonly kind: string;     // the species: 'onlyAfter' · 'argRequired'
                                                             //   · 'custom' · 'judged' · 'prose' · …
                                  readonly judged: boolean;
                                  readonly judgePolicy: 'passOnFails' | 'denyOnFails' | null;
                                  readonly installedBecause: string }
export type RewriteKind = 'purgePattern' | 'maskPattern' | 'swapTerms';
export interface Rewrite { readonly name: string;
                           readonly kind: RewriteKind;       // the factory that minted it
                           apply(text: string): string }     // a rewrite rewrites the outgoing reply;
                                                             //   it never decides
export interface GuardCensus { readonly guards: readonly InstalledGuard[];        // priority order
                               readonly rewrites: readonly { readonly name: string;
                                 readonly kind: RewriteKind }[];
                               readonly limits: { readonly calls: number; readonly destructive: number;
                                                  readonly retries: number; readonly questionTurns: number } }
                                              // the census carries ALL governance: the installed
                                              //   guards, the rewrites as their own section, and
                                              //   the resolved limits
export type EngineSentenceKey = 'approvalInstruction' | 'exhaustionClosure' | 'unknownStatus'
                              | 'questionExpired' | 'questionSuperseded' | 'questionDeclined'
                              | 'deniedByGuard' | 'simulatedResult';
/** The fully-resolved wording table: every engine sentence and every user-facing
 *  status word present, defaults filled — the table never carries a hole. */
export interface ResolvedWording {
  readonly status: Readonly<Record<Status | Reason, string>>;
  readonly sentence: Readonly<Record<EngineSentenceKey, string>>;
}
export type RoutingStrategy = 'sequential' | 'random' | 'rate-limit' | 'backup-only' | 'round-robin';
export interface ModelTarget { readonly id: string; readonly provider: string;
                               readonly keyEnv: string | null;
                               readonly tier: 'cloud' | { readonly local: string };   // declared, never inferred
                               readonly certified: boolean }
export type ModelChoice = string | { readonly targets: readonly string[]; readonly strategy: RoutingStrategy };
export type ProviderPreset = 'gemini:thinking-off';   // closed union; grows only by measured addition
export interface LlmParams { readonly temperature?: number; readonly topP?: number;
                             readonly maxOutputTokens?: number; readonly preset?: ProviderPreset }
                                              // ONE home: authors read it on the spec card,
                                              //   cards.ts re-exports it
export interface ServingHandle { readonly baseUrl: string; readonly servedModel: string;
                                 stop(): Promise<void> }
export interface TierSpec { readonly alias: string;
                            readonly speculative: 'none' | 'draft-mtp';   // MTP where it pays, measured
                            readonly kv: 'f16' | 'q8_0';                  // f16 the law, q8_0 the RAM hatch
                            readonly ctx: number;                          // sized to fit the assembled prompt
                            readonly cacheRam: number; readonly slots: number }   // warm-prompt sizing

/** Engine-internal tool truth — one fact per declared tool. No authoring name exists
 *  for this shape; cards/facts.ts re-exports it for the compile layer, the way
 *  LlmParams is re-exported for authors. */
export interface ToolFact { readonly name: string; readonly label: string | null;
                            readonly does: string; readonly effect: Effect;
                            readonly target: string | null;   // the arg naming the record id
                            readonly entity: string | null;   // the records table the tool acts on
                            readonly schema: Json;
                            readonly simulation: { readonly arg: string; readonly value: Json } | null;
                            readonly destructiveWhen: ConsentWhen | null;   // the destructive branch; null = every call
                            readonly proxy: string | { readonly compose: readonly string[] } | null }
/** The whole declared surface as facts, keyed by tool name. */
export interface SurfaceFacts { readonly tools: Readonly<Record<string, ToolFact>>;
                                /** null = the whole snapshot rides the tail. */
                                readonly tail?: readonly string[] | null;
                                /** The state NOTE: when declared, it replaces the
                                 *  record dump — the world speaks its whole-turn
                                 *  conditions in sentences, identifiers withheld. */
                                readonly note?: ((records: StateSnapshot) => string) | null }

/** The world vocabulary — crossing types for the three surface-card kinds.
 *  world/world.ts re-exports them for authors, the way cards.ts re-exports LlmParams;
 *  cards/facts.ts derives SurfaceFacts from them without importing world/. */

/** A declared precondition on a tool's target record, evaluated on EVERY tool kind.
 *  A missing record is a refusal with the gate's sentence, never a silent pass. */
export type Gate = { readonly kind: 'exists' }
                 | { readonly kind: 'stateIs'; readonly field: string; readonly value: Json }
                 | { readonly kind: 'fieldAtLeast'; readonly field: string; readonly min: number };
/** The action forms a world tool can take, as data; 'run' names a custom executor. */
export type ActionForm = 'list' | 'get' | 'make' | 'set' | 'remove' | 'run';
/** One declared world tool: the form, the entity it acts on, and its user-facing words. */
/** The one destructive-branch declaration: a call whose named arg carries one of
 *  the listed values is the destructive branch (holds for consent); any other call
 *  of the same tool runs as a write. */
export interface ConsentWhen { readonly arg: string; readonly oneOf: readonly Json[] }
export interface WorldToolEntry { readonly form: ActionForm; readonly entity: string;
                                  readonly label: string; readonly does?: string;
                                  readonly gates?: readonly Gate[];
                                  /** Declared args; omitted = the form's own schema. */
                                  readonly schema?: Json;
                                  /** The target arg; omitted = the form's own. */
                                  readonly target?: string;
                                  readonly when?: ConsentWhen;
                                  readonly simulation?: true }
/** The declarative world: records + the three effect blocks + presets. Closed data —
 *  no functions, no regexes, no clock inside the card; custom executors pass OUTSIDE. */
export interface WorldCard { readonly records: StateSnapshot;
                             readonly reads?: Readonly<Record<string, WorldToolEntry>>;
                             readonly writes?: Readonly<Record<string, WorldToolEntry>>;
                             readonly destructive?: Readonly<Record<string, WorldToolEntry>>;
                             /** Entities the STATE TAIL shows the model every turn —
                              *  what disqualifies whole turns and no read answers.
                              *  Omitted = every entity (small worlds). Everything
                              *  else stays behind the reads. */
                             readonly tail?: readonly string[];
                             /** Renders the turn-head state note from the live records:
                              *  only what disqualifies a whole turn and what no read
                              *  answers, never an identifier. Declared = the note rides
                              *  the tail instead of any record dump. */
                             readonly note?: (records: StateSnapshot) => string;
                             readonly presets?: Readonly<Record<string, readonly Patch[]>> }
/** One typed approval: the tool whose open question this turn licenses; args only
 *  to split open SIBLINGS of one tool — a code is never extracted from prose. */
export interface ApproveRef { readonly tool: string;
                              readonly args?: Readonly<Record<string, Json>> }
/** One scripted exam turn: user text, one or several typed approvals (several =
 *  one message licensing several open questions), or a typed decline. */
export type ExamTurn = string
  | { readonly approve: ApproveRef | readonly ApproveRef[] }
  | { readonly decline: true };
/** A deterministic act matcher: the named call happened (required) or took no
 *  effect (noEffect), with an args subset when the case pins one. `anyOf` widens
 *  a required call to alternative reads that ground the same fact — the
 *  requirement is the grounding, never one path to it. */
export interface ToolMatcher { readonly name: string;
                               readonly anyOf?: readonly string[];
                               readonly anyArgs?: Readonly<Record<string, Json>> }
/** One exam case: the turns, the split discipline, and the rubric the in-session
 *  judge reads. `agent` names the desk on a multi-agent subject; `preset` names
 *  the world scenario; `covers` names the guards this case exists to fire (the
 *  census key); `invariants` are checked deterministically against the records;
 *  `red` names the attack class when the case is an adversarial row. */
export interface ExamCase { readonly id: string;
                            readonly split: 'fix' | 'held-out';
                            readonly agent?: string;
                            readonly preset?: string;
                            readonly red?: string;
                            readonly covers?: readonly string[];
                            readonly invariants?: {
                              readonly requiredToolCalls?: readonly ToolMatcher[];
                              readonly noEffectToolCalls?: readonly ToolMatcher[] };
                            readonly turns: readonly ExamTurn[];
                            readonly rubric: string }

/** One remote tool on an MCP or live surface: words and bindings, no action form.
 *  proxy as a string is a declared RENAME to the real live tool; proxy as a compose
 *  block executes the listed live reads and merges their results in order. */
export interface RemoteToolEntry { readonly label: string; readonly target?: string;
                                   readonly proxy?: string | { readonly compose: readonly string[] };
                                   readonly when?: ConsentWhen;
                                   readonly simulation?: true;
                                   readonly does?: string; readonly schema?: Json }
/** The MCP sibling: the same effect blocks over remote entries — no records, no gates. */
export interface McpWorldCard { readonly reads?: Readonly<Record<string, RemoteToolEntry>>;
                                readonly writes?: Readonly<Record<string, RemoteToolEntry>>;
                                readonly destructive?: Readonly<Record<string, RemoteToolEntry>> }
/** The live sibling: tools that execute themselves on a named host. */
export interface LiveWorldCard extends McpWorldCard { readonly host: string }
/** One row of the world's own audit trail: the row states the result; the mechanism
 *  is its own field. */
export interface AuditRow { readonly call: ReadyCall; readonly done: Done;
                            readonly executor: 'declared' | 'custom' }
/** A custom executor: coerced args + a deep-frozen records CLONE + the id mint; its
 *  patches apply through the shared gated, audited path — never directly. A refusal
 *  is its own channel and prices done:'no' — a refusing tool never reads as done. */
export type CustomExecutor = (ctx: { readonly args: Readonly<Record<string, Json>>;
                                     readonly records: StateSnapshot;
                                     readonly mintId: (entity: string) => string })
                          => { readonly result: Json; readonly patches: readonly Patch[] }
                           | { readonly refuse: Json };
/** A validated, frozen world declaration: the card plus its custom executors. */
export interface DeclaredWorld { readonly card: WorldCard;
                                 readonly executors: Readonly<Record<string, CustomExecutor>> }
