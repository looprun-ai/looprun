/**
 * `defineWorld` — the DECLARATIVE world vocabulary (increment 3a).
 *
 * A generated subject emits ONLY the object literal described here; the builder
 * (`define-world.ts`) supplies the machinery every world used to re-implement by hand:
 * RECEPTION, two-step probes, deterministic ids, projection, audit, presets, gates, and the
 * quarantined `custom` escape hatch. The `world.json` serialization of this same shape is 3b.
 */

/** A scalar an argument can carry. `money` is a number the domain reads as currency. */
export type ScalarType = 'string' | 'number' | 'boolean';
export type FieldType = ScalarType | 'money' | { enum: readonly string[] };

/** One entity kind: its id namespace, its state machine, and its typed fields. */
export interface EntityDecl {
  idPrefix: string;
  states?: readonly string[];
  terminal?: readonly string[];
  fields?: Record<string, FieldType>;
}

/** One declared tool argument. `operator: true` marks third-party/author text (echo-safety #5). */
export interface ArgDecl {
  name: string;
  type: ScalarType;
  optional?: boolean;
  operator?: boolean;
}

/**
 * The closed transition-gate language (spec §Deliverable). MINIMAL by mandate — only the vocabulary
 * the acceptance fixture and the property tests need. Grow deliberately.
 */
export type Gate =
  /** `args[field]` (or a target entity record's field) ≥ `min`; `min` may be a `{ref}` into a seed field. */
  | { kind: 'fieldAtLeast'; entity?: string; field: string; min: number | { ref: string }; error: string }
  /** a seed record of `entity` whose `matchField` equals `args[argRef]` must exist. */
  | { kind: 'exists'; entity: string; matchField: string; argRef: string; error: string }
  /** the target entity record (by `args[argRef]`) must currently be in `state`. */
  | { kind: 'stateIs'; entity: string; argRef: string; state: string; error: string }
  /** the MIRROR of `exists`: DENY when a seed record of `entity` whose `matchField` equals
   *  `args[argRef]` is present (e.g. an active hold blocks a booking on the held asset). */
  | { kind: 'absent'; entity: string; matchField: string; argRef: string; error: string };

/** How a `read` tool builds its (side-effect-free) result envelope. Exactly one shape applies. */
export interface ReadResult {
  /** `{ ok: true, [key]: value }` — a fixed collection returned verbatim. */
  collection?: { key: string; value: unknown };
  /** `{ ok: true, [key]: match|null }` — find one seed record where `byField` matches `args[argRef]`
   *  (case-insensitive string compare); project to `returns` keys when given. */
  find?: { key: string; entity: string; byField: string; argRef: string; returns?: readonly string[] };
  /** `{ ok: true, [key]: value }` — a fixed constant payload. */
  constant?: { key: string; value: unknown };
}

/** How a `write`/`transition` tool mints and records a new entity. */
export interface CreateResult {
  entity: string;
  /** `counter` → `${idPrefix}_${++n}`; `{ fixed }` → the same id every time. */
  id: 'counter' | { fixed: string };
  /** the result envelope key carrying the new id (e.g. `bookingId`, `visitorId`). */
  idKey: string;
  /** arg names copied into the stored record (and echo-tagged when the arg is `operator`). */
  store?: readonly string[];
}

/** How a `transition` tool PATCHES an existing entity's status (no new record minted). */
export interface TransitionResult {
  entity: string;
  /** the arg naming the target record's id. */
  argRef: string;
  /** the status the target record moves to. */
  to: string;
  /** optional result-envelope key echoing the target id (e.g. `bookingId`). */
  idKey?: string;
}

/** One declared tool. `custom` names a host-registered executor (never part of the literal). */
export interface ToolDecl {
  kind: 'read' | 'write' | 'transition' | 'custom';
  args?: readonly ArgDecl[];
  /** two-step probe/confirm (spec #2): `confirmed !== true` ⇒ side-effect-free preview. */
  twoStep?: boolean;
  gates?: readonly Gate[];
  read?: ReadResult;
  create?: CreateResult;
  /** patch an EXISTING record's status in place (vs `create`, which mints a new record). */
  transition?: TransitionResult;
  /** transition self-description. */
  entity?: string;
  from?: string;
  to?: string;
  /** name of a host executor registered via `defineWorld`'s `custom` option. */
  custom?: string;
}

/** A declarative delta a preset applies over the seed (spec #6). */
export type PresetDelta =
  | { op: 'addRecord'; entity: string; record: Record<string, unknown> }
  | { op: 'setCounter'; entity: string; value: number }
  | { op: 'patch'; entity: string; id: string; set: Record<string, unknown> };

/** The whole declarative world. Generation emits exactly this. */
export interface WorldSpec {
  /** the projection clock (`today`) — the no-clock F-1 blocker, provided once. */
  clock: string;
  entities?: Record<string, EntityDecl>;
  tools: Record<string, ToolDecl>;
  derived?: Record<string, { formula: string }>;
  presets?: Record<string, readonly PresetDelta[]>;
  seed?: Record<string, readonly Record<string, unknown>[]>;
}

/** The host-registered escape hatch (#7): a named TS function, quarantined and self-described. */
export type CustomExecutor = (ctx: CustomCtx) => CustomResult;
export interface CustomCtx {
  args: Record<string, unknown>;
  /** seeded records by entity, id-keyed (read-only copy). */
  records: Record<string, Record<string, Record<string, unknown>>>;
  /** mint a deterministic id in an entity's namespace. */
  mintId(entity: string): string;
}
export interface CustomResult {
  result: unknown;
  tookEffect: boolean;
}

/** Options that never appear in the declarative literal — host wiring only. */
export interface DefineWorldOptions {
  custom?: Record<string, CustomExecutor>;
}

/** One ledger row — the shape `@looprun-ai/eval`'s `run.ts` reads (`callOk`, `tookEffect`). */
export interface WorldCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  tookEffect?: boolean;
  /** echo-safety segregation (#5): present only when operator-authored args were stored. */
  echo?: { operator: Record<string, unknown>; agent: Record<string, unknown> };
}

/** The AgentWorld a `defineWorld` factory produces, plus the world-specific extras it carries. */
export interface BuiltWorld {
  exec(name: string, args: Record<string, unknown>): unknown;
  advanceTurn(): void;
  ingestAttachment(url: string): string;
  toolCalls: WorldCall[];
  sseActions: unknown[];
  /** deterministic projection: always carries `today` + declared status keys (#4). */
  projection(): Record<string, unknown>;
  /** the audit ledger — every exec, gate outcome, and mint, in order. */
  audit: AuditEntry[];
  [k: string]: unknown;
}

export interface AuditEntry {
  tool: string;
  outcome: 'ok' | 'denied' | 'preview' | 'unknown-tool' | 'custom';
  detail?: string;
}

/** A factory: `makeWorld(preset?)` builds a fresh world; `.describe()` is its self-description. */
export interface WorldFactory {
  (preset?: string): BuiltWorld;
  describe(): {
    clock: string;
    entities: string[];
    tools: Record<string, { kind: string; twoStep: boolean; custom?: string }>;
    presets: string[];
    customExecutors: string[];
  };
}
