import { readFileSync } from 'node:fs';
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';
import type { Node, Pair, YAMLMap, YAMLSeq } from 'yaml';

export interface DeclaredGuard {
  readonly name: string;
  readonly acts: readonly string[];
  readonly factory: 'onlyAfter' | 'precondition' | 'valueFromUser' | 'argFormat' | 'cap' | 'deny';
  readonly args?: Readonly<Record<string, unknown>>;
  readonly rule?: string;
  readonly wide?: 'oneLawEveryAct' | 'sameRefusal';
}

export interface DeclaredDisclosure {
  readonly needs?: Readonly<Record<string, string>>;
  readonly before?: string;
  readonly after?: string;
  readonly cap?: { readonly at: string; readonly not: string };
}

export interface Declaration {
  readonly contract: {
    readonly name: string;
    readonly voice: string;
    readonly facts: readonly string[];
    readonly guards: readonly DeclaredGuard[];
    readonly disclosure: Readonly<Record<string, DeclaredDisclosure>>;
    readonly secrets?: readonly string[];
    readonly limits?: Readonly<Record<string, number>>;
  };
  readonly desks: readonly {
    readonly name: string;
    readonly persona: string;
    readonly tools: readonly string[];
    readonly teammates?: Readonly<Record<string, string>>;
    readonly conduct: Readonly<Record<string, string>>;
  }[];
}

const FACTORIES: ReadonlySet<DeclaredGuard['factory']> = new Set(['onlyAfter', 'precondition', 'valueFromUser', 'argFormat', 'cap', 'deny']);
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

function readCap(map: YAMLMap, path: string, lineCounter: LineCounter): { readonly at: string; readonly not: string } {
  return { at: requireString(map, 'at', path, lineCounter), not: requireString(map, 'not', path, lineCounter) };
}

function readDisclosureEntry(map: YAMLMap, path: string, lineCounter: LineCounter): DeclaredDisclosure {
  const needsMap = readOptionalMap(map, 'needs', path, lineCounter);
  const before = readOptionalString(map, 'before', path, lineCounter);
  const after = readOptionalString(map, 'after', path, lineCounter);
  const capMap = readOptionalMap(map, 'cap', path, lineCounter);
  return {
    ...(needsMap === undefined ? {} : { needs: asStringRecord(needsMap, field(path, 'needs'), lineCounter) }),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    ...(capMap === undefined ? {} : { cap: readCap(capMap, field(path, 'cap'), lineCounter) })
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

function readGuards(seq: YAMLSeq, path: string, lineCounter: LineCounter): readonly DeclaredGuard[] {
  const fallback = lineAt(seq, lineCounter, 1);
  return seq.items.map((item, i) => {
    const itemPath = `${path}[${i}]`;
    if (!isMap(item)) fail(itemPath, lineAt(item as Node, lineCounter, fallback), 'must be a mapping');
    return readGuard(item, itemPath, lineCounter);
  });
}

function readContract(map: YAMLMap, path: string, lineCounter: LineCounter): Declaration['contract'] {
  const name = requireString(map, 'name', path, lineCounter);
  const voice = requireString(map, 'voice', path, lineCounter);
  const facts = asStringArray(requireSeq(map, 'facts', path, lineCounter), field(path, 'facts'), lineCounter);
  const guards = readGuards(requireSeq(map, 'guards', path, lineCounter), field(path, 'guards'), lineCounter);
  const disclosure = readDisclosure(requireMap(map, 'disclosure', path, lineCounter), field(path, 'disclosure'), lineCounter);
  const secretsSeq = readOptionalSeq(map, 'secrets', path, lineCounter);
  const limitsMap = readOptionalMap(map, 'limits', path, lineCounter);
  return {
    name,
    voice,
    facts,
    guards,
    disclosure,
    ...(secretsSeq === undefined ? {} : { secrets: asStringArray(secretsSeq, field(path, 'secrets'), lineCounter) }),
    ...(limitsMap === undefined ? {} : { limits: asNumberRecord(limitsMap, field(path, 'limits'), lineCounter) })
  };
}

function readDesk(map: YAMLMap, path: string, lineCounter: LineCounter): Declaration['desks'][number] {
  const name = requireString(map, 'name', path, lineCounter);
  const persona = requireString(map, 'persona', path, lineCounter);
  const tools = asStringArray(requireSeq(map, 'tools', path, lineCounter), field(path, 'tools'), lineCounter);
  const conduct = asStringRecord(requireMap(map, 'conduct', path, lineCounter), field(path, 'conduct'), lineCounter);
  const teammatesMap = readOptionalMap(map, 'teammates', path, lineCounter);
  return {
    name,
    persona,
    tools,
    conduct,
    ...(teammatesMap === undefined ? {} : { teammates: asStringRecord(teammatesMap, field(path, 'teammates'), lineCounter) })
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
