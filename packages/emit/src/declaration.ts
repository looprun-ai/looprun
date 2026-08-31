import { readFileSync } from 'node:fs';
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';
import type { Node, Pair, YAMLMap, YAMLSeq } from 'yaml';

/** Why a contract prose rule exists where no check decides its law, written into the emitted WHY
 *  map as that rule's licence. The map carries a fourth — `measured:<case>` — which is earned from
 *  a run that judged the case it names, and a declaration has judged nothing. */
export type DeclaredWhy = 'noSuchAct' | 'aboutARead' | 'conduct';

export interface DeclaredGuard {
  readonly name: string;
  readonly acts: readonly string[];
  readonly factory: 'onlyAfter' | 'precondition' | 'role' | 'valueFromUser'
    | 'argMatchesFormat' | 'argForbidden' | 'cap' | 'checkResult' | 'mustAccountFor' | 'blockPattern'
    | 'argSatisfiesCondition' | 'valueFromUserOrRecord' | 'argMatchesRecord' | 'onlyAfterWhen'
    | 'prose' | 'deny';
  readonly args?: Readonly<Record<string, unknown>>;
  readonly rule?: string;
  readonly wide?: 'oneLawEveryAct' | 'sameRefusal';
}

/** A ceiling on one argument of a held call, in the declaration's own words. The engine's cap
 *  refuses the call when the argument is above the figure a read answered, so `not` states that
 *  direction and `above` is the one the engine enforces. */
export interface DeclaredCap {
  /** The held call's own argument the ceiling tests. */
  readonly arg?: string;
  /** The path that answers the ceiling, rooted on an alias `needs` declares. */
  readonly at: string;
  /** The direction of the ceiling: `above`. */
  readonly not: string;
  /** The sentence the call is refused with, slots included. */
  readonly refusal?: string;
}

/** One read the engine performs to fill a disclosure sentence. The read alone names it in the
 *  short form, and the held call's own target is what it is answered from. The full form states
 *  the read and the arguments it takes — `{ tool: listHolds, args: {} }` for a read that takes
 *  none, and `{ tool: getBooking, args: { bookingId: bookingId } }` when the read's own argument
 *  names it differently from the held call's. A `pick` binds the alias to ONE row of a
 *  list-valued read: the row of `list` whose `by` field equals the held call's `key` argument. */
export type DeclaredNeed = string | {
  readonly tool: string;
  readonly args: Readonly<Record<string, string>>;
  readonly pick?: { readonly list: string; readonly by: string; readonly key: string };
};

export interface DeclaredDisclosure {
  readonly needs?: Readonly<Record<string, DeclaredNeed>>;
  readonly before?: string;
  readonly after?: string;
  /** The standing sentence later turns carry while the act stays relevant. */
  readonly later?: string;
  readonly cap?: DeclaredCap;
  /** The refusal when a declared tense finds nothing in the reads to say. */
  readonly empty?: string;
}

/** One edit of the outgoing reply, as data. A rewrite decides nothing — it rewrites what the desk
 *  already wrote. `maskPattern` and `purgePattern` are a name and the pattern they act on;
 *  `swapTerms` is the pairs themselves, and mints its own name from them. */
export interface DeclaredRewrite {
  readonly kind: 'maskPattern' | 'purgePattern' | 'swapTerms';
  readonly name?: string;
  readonly pattern?: string;
  readonly terms?: Readonly<Record<string, string>>;
}

/** The engine sentences and status words this business says differently. Each map is keyed by the
 *  engine's own name for the sentence; a key the engine does not carry is refused by name, because
 *  a word nothing reads is a word nobody ever hears. */
/** One thing that is never spoken: the field name or dotted path, masked at every seam. The
 *  mapping form picks the other treatment — `omit` drops the key rather than starring its value. */
export type DeclaredSecret = string | { readonly path: string; readonly mode: 'omit' | 'mask' };

export interface DeclaredWording {
  readonly status?: Readonly<Record<string, string>>;
  readonly sentence?: Readonly<Record<string, string>>;
}

/** One judged check on a desk: the question the session's OWN model answers about that desk's
 *  reply, and the acts it is asked about. The four take no configuration — the question IS the
 *  factory — so a declaration states which one, and the acts that scope it. */
export interface DeclaredJudged {
  readonly factory: 'injectionCheck';
  readonly acts: readonly string[];
}

/** The law the operator hears AROUND one refusal the world spells out, keyed by the act and then
 *  by the code the world answers with. The emitter knows every code — it is the seam table it
 *  writes — and never the sentence a person meeting that code needs, so the sentence is declared
 *  here and rendered on the desks that hold the act. */
export type DeclaredSeam = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface Declaration {
  readonly contract: {
    readonly name: string;
    readonly voice: string;
    readonly facts: readonly string[];
    readonly guards: readonly DeclaredGuard[];
    readonly disclosure: Readonly<Record<string, DeclaredDisclosure>>;
    readonly seam?: DeclaredSeam;
    readonly rewrites?: readonly DeclaredRewrite[];
    readonly secrets?: readonly DeclaredSecret[];
    readonly wording?: DeclaredWording;
    readonly limits?: Readonly<Record<string, number>>;
  };
  readonly desks: readonly {
    readonly name: string;
    readonly persona: string;
    readonly tools: readonly string[];
    /** This desk's routing line — what the front desk reads to route a message here. */
    readonly description?: string;
    readonly summary?: string;
    readonly conduct: Readonly<Record<string, string>>;
    readonly judged?: readonly DeclaredJudged[];
    readonly limits?: Readonly<Record<string, number>>;
  }[];
}

const FACTORIES: ReadonlySet<DeclaredGuard['factory']> = new Set(['onlyAfter', 'precondition', 'role', 'valueFromUser', 'argMatchesFormat', 'argForbidden', 'cap', 'checkResult', 'mustAccountFor', 'blockPattern', 'argSatisfiesCondition', 'valueFromUserOrRecord', 'argMatchesRecord', 'onlyAfterWhen', 'prose', 'deny']);
const REWRITE_KINDS: ReadonlySet<DeclaredRewrite['kind']> = new Set(['maskPattern', 'purgePattern', 'swapTerms']);
const JUDGED_FACTORIES: ReadonlySet<DeclaredJudged['factory']> = new Set(['injectionCheck']);
const WIDE_KINDS: ReadonlySet<NonNullable<DeclaredGuard['wide']>> = new Set(['oneLawEveryAct', 'sameRefusal']);

function fail(path: string, line: number, detail: string): never {
  throw new Error(`${path} (line ${line}): ${detail}`);
}

function field(path: string, key: string): string {
  return path.length === 0 ? key : `${path}.${key}`;
}

function lineAt(node: { readonly range?: readonly [number, number, number] | null } | null | undefined,
  lineCounter: LineCounter, fallback: number): number {
  const offset = node?.range?.[0];
  return offset === undefined ? fallback : lineCounter.linePos(offset).line;
}

function keyOf(pair: Pair): string {
  const k = pair.key;
  return isScalar(k) && typeof k.value === 'string' ? k.value : String(k);
}

function requireField(map: YAMLMap, key: string, path: string, lineCounter: LineCounter): Node {
  const parentLine = lineAt(map, lineCounter, 1);
  const child = map.get(key, true) as Node | undefined;
  if (child === undefined) fail(field(path, key), parentLine, 'is required');
  return child;
}

function requireMap(map: YAMLMap, key: string, path: string, lineCounter: LineCounter): YAMLMap {
  const child = requireField(map, key, path, lineCounter);
  if (!isMap(child)) fail(field(path, key), lineAt(child, lineCounter, lineAt(map, lineCounter, 1)), 'must be a mapping');
  return child;
}

function requireSeq(map: YAMLMap, key: string, path: string, lineCounter: LineCounter): YAMLSeq {
  const child = requireField(map, key, path, lineCounter);
  if (!isSeq(child)) fail(field(path, key), lineAt(child, lineCounter, lineAt(map, lineCounter, 1)), 'must be a sequence');
  return child;
}

function requireString(map: YAMLMap, key: string, path: string, lineCounter: LineCounter): string {
  const child = requireField(map, key, path, lineCounter);
  if (!isScalar(child) || typeof child.value !== 'string') {
    fail(field(path, key), lineAt(child, lineCounter, lineAt(map, lineCounter, 1)), 'must be a string');
  }
  return child.value;
}

function requireEnum<T extends string>(map: YAMLMap, key: string, allowed: ReadonlySet<T>, path: string, lineCounter: LineCounter): T {
  const value = requireString(map, key, path, lineCounter);
  if (!allowed.has(value as T)) {
    const child = map.get(key, true) as Node;
    fail(field(path, key), lineAt(child, lineCounter, lineAt(map, lineCounter, 1)), `must be one of ${[...allowed].join(', ')}`);
  }
  return value as T;
}

function readOptionalString(map: YAMLMap, key: string, path: string, lineCounter: LineCounter): string | undefined {
  const child = map.get(key, true) as Node | undefined;
  if (child === undefined) return undefined;
  if (!isScalar(child) || typeof child.value !== 'string') {
    fail(field(path, key), lineAt(child, lineCounter, lineAt(map, lineCounter, 1)), 'must be a string');
  }
  return child.value;
}

function readOptionalEnum<T extends string>(map: YAMLMap, key: string, allowed: ReadonlySet<T>, path: string, lineCounter: LineCounter): T | undefined {
  const child = map.get(key, true) as Node | undefined;
  if (child === undefined) return undefined;
  if (!isScalar(child) || typeof child.value !== 'string' || !allowed.has(child.value as T)) {
    fail(field(path, key), lineAt(child, lineCounter, lineAt(map, lineCounter, 1)), `must be one of ${[...allowed].join(', ')}`);
  }
  return child.value as T;
}

function readOptionalMap(map: YAMLMap, key: string, path: string, lineCounter: LineCounter): YAMLMap | undefined {
  const child = map.get(key, true) as Node | undefined;
  if (child === undefined) return undefined;
  if (!isMap(child)) fail(field(path, key), lineAt(child, lineCounter, lineAt(map, lineCounter, 1)), 'must be a mapping');
  return child;
}

function readOptionalSeq(map: YAMLMap, key: string, path: string, lineCounter: LineCounter): YAMLSeq | undefined {
  const child = map.get(key, true) as Node | undefined;
  if (child === undefined) return undefined;
  if (!isSeq(child)) fail(field(path, key), lineAt(child, lineCounter, lineAt(map, lineCounter, 1)), 'must be a sequence');
  return child;
}

function asStringArray(seq: YAMLSeq, path: string, lineCounter: LineCounter): readonly string[] {
  const fallback = lineAt(seq, lineCounter, 1);
  return seq.items.map((item, i) => {
    if (!isScalar(item) || typeof item.value !== 'string') {
      fail(`${path}[${i}]`, lineAt(item as Node, lineCounter, fallback), 'must be a string');
    }
    return item.value;
  });
}

function asStringRecord(map: YAMLMap, path: string, lineCounter: LineCounter): Readonly<Record<string, string>> {
  const fallback = lineAt(map, lineCounter, 1);
  return Object.fromEntries(map.items.map(pair => {
    const key = keyOf(pair);
    const value = pair.value as Node | null;
    if (!isScalar(value) || typeof value.value !== 'string') {
      fail(field(path, key), lineAt(value, lineCounter, fallback), 'must be a string');
    }
    return [key, value.value];
  }));
}

function asNumberRecord(map: YAMLMap, path: string, lineCounter: LineCounter): Readonly<Record<string, number>> {
  const fallback = lineAt(map, lineCounter, 1);
  return Object.fromEntries(map.items.map(pair => {
    const key = keyOf(pair);
    const value = pair.value as Node | null;
    if (!isScalar(value) || typeof value.value !== 'number') {
      fail(field(path, key), lineAt(value, lineCounter, fallback), 'must be a number');
    }
    return [key, value.value];
  }));
}

/** The ceiling as the declaration states it. `at` and `not` are the shape of a ceiling and are
 *  required here; `arg` and `refusal` are what the engine's own cap needs, and a cap missing
 *  either of them is named by the emitter against the surface it was declared for. */
function readCap(map: YAMLMap, path: string, lineCounter: LineCounter): DeclaredCap {
  const arg = readOptionalString(map, 'arg', path, lineCounter);
  const refusal = readOptionalString(map, 'refusal', path, lineCounter);
  return {
    at: requireString(map, 'at', path, lineCounter),
    not: requireString(map, 'not', path, lineCounter),
    ...(arg === undefined ? {} : { arg }),
    ...(refusal === undefined ? {} : { refusal })
  };
}

/** One alias of a `needs` map: a read named on its own, or the mapping that states the read and
 *  the args it is answered from. The args map is required in that form and may be empty — a read
 *  taking no argument at all is answered by `args: {}`. An optional `pick` states its three
 *  strings — `list`, `by`, `key` — and binds the alias to one row of the read's list. */
function readNeed(value: Node | null, path: string, lineCounter: LineCounter,
  fallback: number): DeclaredNeed {
  if (isScalar(value) && typeof value.value === 'string') return value.value;
  if (!isMap(value)) {
    fail(path, lineAt(value, lineCounter, fallback),
      'must be a read, or a mapping of the read `tool` and the `args` it is answered from');
  }
  const pick = readOptionalMap(value, 'pick', path, lineCounter);
  return {
    tool: requireString(value, 'tool', path, lineCounter),
    args: asStringRecord(requireMap(value, 'args', path, lineCounter), field(path, 'args'), lineCounter),
    ...(pick === undefined ? {} : { pick: {
      list: requireString(pick, 'list', field(path, 'pick'), lineCounter),
      by: requireString(pick, 'by', field(path, 'pick'), lineCounter),
      key: requireString(pick, 'key', field(path, 'pick'), lineCounter)
    } })
  };
}

function asNeedsRecord(map: YAMLMap, path: string, lineCounter: LineCounter): Readonly<Record<string, DeclaredNeed>> {
  const fallback = lineAt(map, lineCounter, 1);
  return Object.fromEntries(map.items.map(pair => {
    const key = keyOf(pair);
    return [key, readNeed(pair.value as Node | null, field(path, key), lineCounter, fallback)];
  }));
}

function readDisclosureEntry(map: YAMLMap, path: string, lineCounter: LineCounter): DeclaredDisclosure {
  const needsMap = readOptionalMap(map, 'needs', path, lineCounter);
  const before = readOptionalString(map, 'before', path, lineCounter);
  const after = readOptionalString(map, 'after', path, lineCounter);
  const later = readOptionalString(map, 'later', path, lineCounter);
  const capMap = readOptionalMap(map, 'cap', path, lineCounter);
  const empty = readOptionalString(map, 'empty', path, lineCounter);
  return {
    ...(needsMap === undefined ? {} : { needs: asNeedsRecord(needsMap, field(path, 'needs'), lineCounter) }),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    ...(later === undefined ? {} : { later }),
    ...(capMap === undefined ? {} : { cap: readCap(capMap, field(path, 'cap'), lineCounter) }),
    ...(empty === undefined ? {} : { empty })
  };
}

function readDisclosure(map: YAMLMap, path: string, lineCounter: LineCounter): Readonly<Record<string, DeclaredDisclosure>> {
  const fallback = lineAt(map, lineCounter, 1);
  return Object.fromEntries(map.items.map(pair => {
    const key = keyOf(pair);
    const value = pair.value as Node | null;
    if (!isMap(value)) fail(field(path, key), lineAt(value, lineCounter, fallback), 'must be a mapping');
    return [key, readDisclosureEntry(value, field(path, key), lineCounter)];
  }));
}

/** The seam section as the declaration states it: an act, the codes it is refused with, and one
 *  sentence per code. The act keys are read as written — a code the computed seam does not carry
 *  is named against the surface, where the seam table itself is in hand. */
function readSeam(map: YAMLMap, path: string, lineCounter: LineCounter): DeclaredSeam {
  const fallback = lineAt(map, lineCounter, 1);
  return Object.fromEntries(map.items.map(pair => {
    const key = keyOf(pair);
    const value = pair.value as Node | null;
    if (!isMap(value)) {
      fail(field(path, key), lineAt(value, lineCounter, fallback),
        'must be a mapping of refusal code to the sentence the operator meeting it needs');
    }
    return [key, asStringRecord(value, field(path, key), lineCounter)];
  }));
}

function readGuard(map: YAMLMap, path: string, lineCounter: LineCounter): DeclaredGuard {
  const name = requireString(map, 'name', path, lineCounter);
  const acts = asStringArray(requireSeq(map, 'acts', path, lineCounter), field(path, 'acts'), lineCounter);
  const factory = requireEnum(map, 'factory', FACTORIES, path, lineCounter);
  const argsMap = readOptionalMap(map, 'args', path, lineCounter);
  const rule = readOptionalString(map, 'rule', path, lineCounter);
  const wide = readOptionalEnum(map, 'wide', WIDE_KINDS, path, lineCounter);
  return {
    name,
    acts,
    factory,
    ...(argsMap === undefined ? {} : { args: argsMap.toJSON() as Record<string, unknown> }),
    ...(rule === undefined ? {} : { rule }),
    ...(wide === undefined ? {} : { wide })
  };
}

/** Every guard carries a name of its own. The name is the row the guard mints in the census, the
 *  key a case's `covers` pays, and the key of the emitted WHY and WIDE maps — so two guards under
 *  one name are one row that two different laws answer to, and the second silently takes the key
 *  from the first. */
function readGuards(seq: YAMLSeq, path: string, lineCounter: LineCounter): readonly DeclaredGuard[] {
  const fallback = lineAt(seq, lineCounter, 1);
  const lineByName = new Map<string, number>();
  return seq.items.map((item, i) => {
    const itemPath = `${path}[${i}]`;
    if (!isMap(item)) fail(itemPath, lineAt(item as Node, lineCounter, fallback), 'must be a mapping');
    const guard = readGuard(item, itemPath, lineCounter);
    const line = lineAt(item, lineCounter, fallback);
    const first = lineByName.get(guard.name);
    if (first !== undefined) {
      fail(field(itemPath, 'name'), line,
        `is '${guard.name}', which the guard at line ${String(first)} already carries. A guard's `
        + 'name is the row it mints in the census and the key a case covers, so two guards under '
        + 'one name are one row nothing can tell apart — name each guard for the law it carries.');
    }
    lineByName.set(guard.name, line);
    return guard;
  });
}

function readRewrite(map: YAMLMap, path: string, lineCounter: LineCounter): DeclaredRewrite {
  const kind = requireEnum(map, 'kind', REWRITE_KINDS, path, lineCounter);
  const name = readOptionalString(map, 'name', path, lineCounter);
  const pattern = readOptionalString(map, 'pattern', path, lineCounter);
  const termsMap = readOptionalMap(map, 'terms', path, lineCounter);
  return {
    kind,
    ...(name === undefined ? {} : { name }),
    ...(pattern === undefined ? {} : { pattern }),
    ...(termsMap === undefined ? {} : { terms: asStringRecord(termsMap, field(path, 'terms'), lineCounter) })
  };
}

function readRewrites(seq: YAMLSeq, path: string, lineCounter: LineCounter): readonly DeclaredRewrite[] {
  const fallback = lineAt(seq, lineCounter, 1);
  return seq.items.map((item, i) => {
    const itemPath = `${path}[${i}]`;
    if (!isMap(item)) fail(itemPath, lineAt(item as Node, lineCounter, fallback), 'must be a mapping');
    return readRewrite(item, itemPath, lineCounter);
  });
}

const SECRET_MODES: ReadonlySet<'omit' | 'mask'> = new Set(['omit', 'mask']);

function readSecrets(seq: YAMLSeq, path: string, lineCounter: LineCounter): readonly DeclaredSecret[] {
  const fallback = lineAt(seq, lineCounter, 1);
  return seq.items.map((item, i) => {
    const itemPath = `${path}[${i}]`;
    if (isScalar(item) && typeof item.value === 'string') return item.value;
    if (!isMap(item)) {
      fail(itemPath, lineAt(item as Node, lineCounter, fallback),
        'must be a field name, or a mapping of the `path` and the `mode` it is treated with');
    }
    return {
      path: requireString(item, 'path', itemPath, lineCounter),
      mode: requireEnum(item, 'mode', SECRET_MODES, itemPath, lineCounter)
    };
  });
}

function readWording(map: YAMLMap, path: string, lineCounter: LineCounter): DeclaredWording {
  const status = readOptionalMap(map, 'status', path, lineCounter);
  const sentence = readOptionalMap(map, 'sentence', path, lineCounter);
  return {
    ...(status === undefined ? {} : { status: asStringRecord(status, field(path, 'status'), lineCounter) }),
    ...(sentence === undefined ? {} : { sentence: asStringRecord(sentence, field(path, 'sentence'), lineCounter) })
  };
}

function readContract(map: YAMLMap, path: string, lineCounter: LineCounter): Declaration['contract'] {
  const name = requireString(map, 'name', path, lineCounter);
  const voice = requireString(map, 'voice', path, lineCounter);
  const facts = asStringArray(requireSeq(map, 'facts', path, lineCounter), field(path, 'facts'), lineCounter);
  const guards = readGuards(requireSeq(map, 'guards', path, lineCounter), field(path, 'guards'), lineCounter);
  const disclosure = readDisclosure(requireMap(map, 'disclosure', path, lineCounter), field(path, 'disclosure'), lineCounter);
  const seamMap = readOptionalMap(map, 'seam', path, lineCounter);
  const rewritesSeq = readOptionalSeq(map, 'rewrites', path, lineCounter);
  const secretsSeq = readOptionalSeq(map, 'secrets', path, lineCounter);
  const wordingMap = readOptionalMap(map, 'wording', path, lineCounter);
  const limitsMap = readOptionalMap(map, 'limits', path, lineCounter);
  return {
    name,
    voice,
    facts,
    guards,
    disclosure,
    ...(seamMap === undefined ? {} : { seam: readSeam(seamMap, field(path, 'seam'), lineCounter) }),
    ...(rewritesSeq === undefined ? {} : { rewrites: readRewrites(rewritesSeq, field(path, 'rewrites'), lineCounter) }),
    ...(secretsSeq === undefined ? {} : { secrets: readSecrets(secretsSeq, field(path, 'secrets'), lineCounter) }),
    ...(wordingMap === undefined ? {} : { wording: readWording(wordingMap, field(path, 'wording'), lineCounter) }),
    ...(limitsMap === undefined ? {} : { limits: asNumberRecord(limitsMap, field(path, 'limits'), lineCounter) })
  };
}

function readJudged(seq: YAMLSeq, path: string, lineCounter: LineCounter): readonly DeclaredJudged[] {
  const fallback = lineAt(seq, lineCounter, 1);
  return seq.items.map((item, i) => {
    const itemPath = `${path}[${i}]`;
    if (!isMap(item)) fail(itemPath, lineAt(item as Node, lineCounter, fallback), 'must be a mapping');
    return {
      factory: requireEnum(item, 'factory', JUDGED_FACTORIES, itemPath, lineCounter),
      acts: asStringArray(requireSeq(item, 'acts', itemPath, lineCounter), field(itemPath, 'acts'), lineCounter)
    };
  });
}

/** Every field a desk may carry. A key outside this set is refused rather than dropped: a
 *  misspelling and a field that has been renamed both read as silence otherwise, and the
 *  declaration would emit clean having lost exactly the sentence the author meant to write. */
const DESK_FIELDS: ReadonlySet<string> = new Set(['name', 'persona', 'tools', 'conduct',
  'description', 'summary', 'judged', 'limits']);

function readDesk(map: YAMLMap, path: string, lineCounter: LineCounter): Declaration['desks'][number] {
  const strays = map.items
    .map(item => (typeof item.key === 'object' && item.key !== null && 'value' in item.key
      ? String((item.key as { value: unknown }).value) : String(item.key)))
    .filter(key => !DESK_FIELDS.has(key));
  if (strays.length > 0) {
    fail(path, lineCounter.linePos(map.range?.[0] ?? 0).line,
      `carries ${strays.map(k => `'${k}'`).join(', ')}, which a desk does not declare. A desk `
      + `carries: ${[...DESK_FIELDS].join(', ')}. Remove what is not one of those, or correct its `
      + 'spelling — a field nothing reads is a sentence you wrote that never reaches a prompt.');
  }
  const name = requireString(map, 'name', path, lineCounter);
  const persona = requireString(map, 'persona', path, lineCounter);
  const tools = asStringArray(requireSeq(map, 'tools', path, lineCounter), field(path, 'tools'), lineCounter);
  const conduct = asStringRecord(requireMap(map, 'conduct', path, lineCounter), field(path, 'conduct'), lineCounter);
  const description = readOptionalString(map, 'description', path, lineCounter);
  const summary = readOptionalString(map, 'summary', path, lineCounter);
  const judgedSeq = readOptionalSeq(map, 'judged', path, lineCounter);
  const limitsMap = readOptionalMap(map, 'limits', path, lineCounter);
  return {
    name,
    persona,
    tools,
    conduct,
    ...(description === undefined ? {} : { description }),
    ...(summary === undefined ? {} : { summary }),
    ...(judgedSeq === undefined ? {} : { judged: readJudged(judgedSeq, field(path, 'judged'), lineCounter) }),
    ...(limitsMap === undefined ? {} : { limits: asNumberRecord(limitsMap, field(path, 'limits'), lineCounter) })
  };
}

function readDesks(seq: YAMLSeq, path: string, lineCounter: LineCounter): Declaration['desks'] {
  const fallback = lineAt(seq, lineCounter, 1);
  return seq.items.map((item, i) => {
    const itemPath = `${path}[${i}]`;
    if (!isMap(item)) fail(itemPath, lineAt(item as Node, lineCounter, fallback), 'must be a mapping');
    return readDesk(item, itemPath, lineCounter);
  });
}

/** One YAML declaration in, a Declaration out: every required field of the contract and
 *  every desk is checked for presence and shape, and a failure names the exact path — a
 *  desk missing its conduct laws fails as `desks[0].conduct` — and the line it belongs on. */
export function readDeclaration(path: string): Declaration {
  const text = readFileSync(path, 'utf8');
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const [firstError] = doc.errors;
  if (firstError !== undefined) {
    fail(path, firstError.linePos?.[0]?.line ?? 1, firstError.message);
  }

  const root = doc.contents;
  if (!isMap(root)) fail(path, 1, 'the document root must be a mapping');

  const contract = readContract(requireMap(root, 'contract', '', lineCounter), 'contract', lineCounter);
  const desks = readDesks(requireSeq(root, 'desks', '', lineCounter), 'desks', lineCounter);

  return { contract, desks };
}
