/** The emitter of a subject's `cards.ts`: one declaration in, every line of the two cards out.
 *  The emitter writes the braces, the imports, the licence maps and the factory calls; every
 *  human-readable sentence in what it writes is a sentence the declaration carries. A field the
 *  declaration leaves empty is emitted empty, and a rule the emitter cannot compose from declared
 *  words is an error naming what is missing — never a sentence of the emitter's own. */
import type { SurfaceFacts } from '@looprun-ai/core';
import type { Declaration, DeclaredCap, DeclaredDisclosure, DeclaredGuard,
  DeclaredNeed } from './declaration.js';

/** A string literal for the emitted file: single-quoted, the way a card is hand-written, with
 *  the backslash, the quote and the line breaks a sentence may carry escaped. */
function quote(text: string): string {
  let out = '\'';
  for (const ch of text) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '\'') out += '\\\'';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else out += ch;
  }
  return `${out}'`;
}

/** A name that can stand bare as an object key: letters, digits, `_` and `$`, never opening on
 *  a digit. Anything else — a desk called `front-desk` — is emitted quoted. */
function isPlainName(name: string): boolean {
  if (name.length === 0) return false;
  let first = true;
  for (const ch of name) {
    const letter = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
    const digit = ch >= '0' && ch <= '9';
    if (!letter && !(digit && !first)) return false;
    first = false;
  }
  return true;
}

const key = (name: string): string => isPlainName(name) ? name : quote(name);

/** A name that can stand inside the file's own block comment: letters, digits and the hyphen.
 *  The domain's name is the only declared word the emitter puts outside a string literal, and
 *  a name carrying the two characters that close a comment would carry code in with it. */
function isSlug(name: string): boolean {
  if (name.length === 0) return false;
  for (const ch of name) {
    const letter = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
    const digit = ch >= '0' && ch <= '9';
    if (!letter && !digit && ch !== '-') return false;
  }
  return true;
}

const list = (values: readonly string[]): string => `[${values.map(quote).join(', ')}]`;

const indent = (depth: number, line: string): string => `${'  '.repeat(depth)}${line}`;

/** Several fields as one body: a comma after each block but the last, on that block's own last
 *  line. Nothing here carries a trailing comma, so the emitted file reads as a hand-written one. */
function commaJoin(blocks: readonly (readonly string[])[]): readonly string[] {
  return blocks.flatMap((block, at) => at === blocks.length - 1
    ? [...block]
    : [...block.slice(0, -1), `${block[block.length - 1]},`]);
}

/** What each factory is configured from. A key outside this list configures nothing: the emitter
 *  would drop it, and the author would read a rule on the card that the engine never enforces. */
const LAWFUL_ARGS: Readonly<Record<DeclaredGuard['factory'], readonly string[]>> = {
  onlyAfter: ['after'],
  precondition: ['reads'],
  valueFromUser: ['arg'],
  argFormat: ['arg', 'pattern'],
  cap: ['calls', 'scope'],
  prose: [],
  deny: []
};

function checkArgs(guard: DeclaredGuard): void {
  const lawful = LAWFUL_ARGS[guard.factory];
  const spelled = lawful.length === 0 ? 'no argument at all'
    : lawful.map(name => `args.${name}`).join(' and ');
  for (const name of Object.keys(guard.args ?? {})) {
    if (lawful.includes(name)) continue;
    throw new Error(`contract.guards '${guard.name}' declares args.${name}, and factory `
      + `'${guard.factory}' is configured from ${spelled} — drop it, or move the law it states `
      + `onto the guard whose factory reads it`);
  }
}

function stringArg(guard: DeclaredGuard, name: string): string {
  const value = guard.args?.[name];
  if (typeof value !== 'string') {
    throw new Error(`contract.guards '${guard.name}' declares factory '${guard.factory}', whose `
      + `configuration is args.${name} — a string this declaration does not carry`);
  }
  return value;
}

function ruleOf(guard: DeclaredGuard): string {
  if (guard.rule === undefined) {
    throw new Error(`contract.guards '${guard.name}' declares factory '${guard.factory}', which `
      + `states its law in the card's own words — declare the \`rule\` it states`);
  }
  return guard.rule;
}

/** A `precondition` reading the record: the acts it covers, the check its declared reading
 *  compiles to, and the sentence it refuses with. */
function preconditionLines(guard: DeclaredGuard): readonly string[] {
  if (guard.args?.reads !== 'record') {
    throw new Error(`contract.guards '${guard.name}' declares factory 'precondition' with a `
      + `reading this emitter has no check for — the one it writes is \`reads: record\``);
  }
  const acts = guard.acts.length === 1 ? quote(guard.acts[0]) : list(guard.acts);
  return [`precondition(${acts}, ({ record }) => record !== null,`, `${quote(ruleOf(guard))})`];
}

/** A ceiling on how many times one act runs. The count is that act's own completed calls, so a
 *  ceiling covers exactly one act. */
function capLines(guard: DeclaredGuard, act: string): readonly string[] {
  if (guard.acts.length > 1) {
    throw new Error(`contract.guards '${guard.name}' declares factory 'cap' over `
      + `${String(guard.acts.length)} acts, and a ceiling counts one act's own calls — declare `
      + `one guard per act`);
  }
  const calls = guard.args?.calls;
  if (typeof calls !== 'number') {
    throw new Error(`contract.guards '${guard.name}' declares factory 'cap', whose configuration `
      + `is args.calls — a number this declaration does not carry`);
  }
  return [`maxCalls(${quote(act)}, ${String(calls)}, { scope: ${quote(stringArg(guard, 'scope'))},`,
    `reason: ${quote(ruleOf(guard))} })`];
}

/** The call one declared guard is emitted from: the factory it imports, and the lines of the
 *  call itself. A factory configured from one act takes the first act the guard names and the
 *  rest arrive as the guard's own `tool` scope; `precondition` takes them all itself. `prose`
 *  imports nothing — it is the card's own helper — and states the whole law in its sentence. */
function factoryCall(guard: DeclaredGuard): { readonly imported: string | null;
                                              readonly lines: readonly string[] } {
  const [act] = guard.acts;
  if (act === undefined) throw new Error(`contract.guards '${guard.name}' names no act`);
  // The factory is read before its configuration: a factory this emitter cannot write is the
  // author's answer, and the keys it would have read are beside the point.
  if (guard.factory === 'deny') {
    throw new Error(`contract.guards '${guard.name}' declares factory 'deny', and a deny is a `
      + `check written in code — declare the law as a 'precondition' over the records, or write `
      + `that guard by hand on the card`);
  }
  checkArgs(guard);
  switch (guard.factory) {
    case 'onlyAfter':
      return { imported: 'onlyAfter',
        lines: [`onlyAfter(${quote(act)}, ${quote(stringArg(guard, 'after'))})`] };
    case 'valueFromUser':
      return { imported: 'valueFromUser',
        lines: [`valueFromUser(${quote(act)}, ${quote(stringArg(guard, 'arg'))})`] };
    case 'argFormat':
      return { imported: 'argFormat',
        lines: [`argFormat(${quote(act)}, ${quote(stringArg(guard, 'arg'))}, `
          + `${quote(stringArg(guard, 'pattern'))})`] };
    case 'precondition':
      return { imported: 'precondition', lines: preconditionLines(guard) };
    case 'cap':
      return { imported: 'maxCalls', lines: capLines(guard, act) };
    case 'prose':
      return { imported: null, lines: [`prose(${quote(guard.name)}, ${quote(ruleOf(guard))})`] };
  }
}

/** One guard as the card carries it: the factory call spread into a literal that names itself
 *  with the declared name, scopes itself to every act the guard names, and states the declared
 *  rule where the factory does not already take it. A `prose` rule carries its name and its
 *  sentence inside the call, so its literal states nothing but the acts the sentence is stamped
 *  on and the whole guard stands on one line. */
function guardLines(guard: DeclaredGuard, depth: number): readonly string[] {
  const call = factoryCall(guard);
  if (guard.factory === 'prose') {
    return [indent(depth, `{ ...${call.lines[0]}, tool: ${list(guard.acts)} }`)];
  }
  const fields = [`name: ${quote(guard.name)}`];
  if (guard.acts.length > 1 && guard.factory !== 'precondition') fields.push(`tool: ${list(guard.acts)}`);
  const takesRule = guard.factory === 'precondition' || guard.factory === 'cap';
  if (guard.rule !== undefined && !takesRule) fields.push(`rule: ${quote(guard.rule)}`);
  const [head, ...rest] = call.lines;
  const lines = commaJoin([
    [indent(depth, `{ ...${head}`), ...rest.map(line => indent(depth + 2, line))],
    ...fields.map(field => [indent(depth + 1, field)])
  ]);
  return [...lines.slice(0, -1), `${lines[lines.length - 1]} }`];
}

/** One disclosure entry: the reads the engine performs on the held call's own args, and the
 *  tenses the declaration states for them. An alias is emitted as the recipe it is — the read,
 *  and the argument of the held call it answers from — so the card states it rather than leaving
 *  it derived. */
function capBlock(act: string, cap: DeclaredCap, depth: number): readonly string[] {
  const { arg, at, not, refusal } = cap;
  if (arg === undefined || refusal === undefined) {
    const missing = [...(arg === undefined ? ['arg'] : []),
                     ...(refusal === undefined ? ['refusal'] : [])].join(' and no ');
    throw new Error(`contract.disclosure.${act}.cap declares no ${missing} — a ceiling refuses `
      + `ONE argument of the held call with a sentence of its own, so it is declared as arg, at, `
      + `not and refusal`);
  }
  if (not !== 'above') {
    throw new Error(`contract.disclosure.${act}.cap declares 'not: ${not}', and the engine's `
      + `ceiling refuses a call whose argument stands above the figure the read answered — `
      + `declare 'not: above'`);
  }
  return [
    indent(depth, 'cap: {'),
    ...commaJoin([
      [indent(depth + 1, `arg: ${quote(arg)}`)],
      [indent(depth + 1, `at: ${quote(at)}`)],
      [indent(depth + 1, `refusal: ${quote(refusal)}`)]
    ]),
    indent(depth, '}')
  ];
}

function disclosureLines(act: string, entry: DeclaredDisclosure, facts: SurfaceFacts,
  depth: number): readonly string[] {
  const target = facts.tools[act]?.target ?? null;
  const aliases = Object.entries(entry.needs ?? {});
  const recipe = (need: DeclaredNeed): string => {
    if (typeof need !== 'string') {
      const args = Object.entries(need.args)
        .map(([name, from]) => `${key(name)}: ${quote(from)}`).join(', ');
      return `{ tool: ${quote(need.tool)}, args: ${args.length === 0 ? '{}' : `{ ${args} }`} }`;
    }
    return target === null ? quote(need)
      : `{ tool: ${quote(need)}, args: { ${key(target)}: ${quote(target)} } }`;
  };
  const needs = aliases.length === 0 ? [] : [[
    indent(depth + 1, 'needs: {'),
    ...commaJoin(aliases.map(([alias, need]) => [indent(depth + 2, `${key(alias)}: ${recipe(need)}`)])),
    indent(depth + 1, '}')
  ]];
  const tenses = [
    ...(entry.before === undefined ? [] : [[indent(depth + 1, `before: ${quote(entry.before)}`)]]),
    ...(entry.after === undefined ? [] : [[indent(depth + 1, `after: ${quote(entry.after)}`)]]),
    ...(entry.cap === undefined ? [] : [capBlock(act, entry.cap, depth + 1)])
  ];
  return [
    indent(depth, `${key(act)}: {`),
    ...commaJoin([...needs, ...tenses]),
    indent(depth, '}')
  ];
}

function contractLines(declaration: Declaration, facts: SurfaceFacts): readonly string[] {
  const { contract } = declaration;
  const block = (open: string, body: readonly string[], close: string): readonly string[] =>
    body.length === 0 ? [indent(1, `${open}${close}`)]
      : [indent(1, open), ...body, indent(1, close)];
  const fields = [
    [indent(1, `name: ${quote(contract.name)}`)],
    [indent(1, `voice: ${quote(contract.voice)}`)],
    block('facts: [', commaJoin(contract.facts.map(fact => [indent(2, quote(fact))])), ']'),
    block('guards: [', commaJoin(contract.guards.map(guard => guardLines(guard, 2))), ']'),
    block('disclosure: {', commaJoin(Object.entries(contract.disclosure)
      .map(([act, entry]) => disclosureLines(act, entry, facts, 2))), '}'),
    ...(contract.secrets === undefined ? [] : [[indent(1, `secrets: ${list(contract.secrets)}`)]]),
    ...(contract.limits === undefined ? [] : [[indent(1, `limits: { ${Object.entries(contract.limits)
      .map(([name, value]) => `${key(name)}: ${String(value)}`).join(', ')} }`)]])
  ];
  return ['export const CONTRACT: DomainContract = {', ...commaJoin(fields), '};'];
}

/** One desk as its own AgentSpec: who it is, the lane it acts in, the desks it hands work to,
 *  and the conduct laws it teaches — one `prose` call per law, in the declaration's own order. */
function deskLines(desk: Declaration['desks'][number], depth: number): readonly string[] {
  const teammates = Object.entries(desk.teammates ?? {});
  const laws = Object.entries(desk.conduct);
  const fields = [
    [indent(depth + 1, `name: ${quote(desk.name)}`)],
    [indent(depth + 1, `persona: ${quote(desk.persona)}`)],
    [indent(depth + 1, `tools: ${list(desk.tools)}`)],
    ...(teammates.length === 0 ? [] : [[
      indent(depth + 1, 'teammates: {'),
      ...commaJoin(teammates.map(([name, does]) => [indent(depth + 2, `${key(name)}: ${quote(does)}`)])),
      indent(depth + 1, '}')
    ]]),
    [indent(depth + 1, 'llmParams: { temperature: 0 }')],
    ...(laws.length === 0 ? [] : [[
      indent(depth + 1, 'guards: ['),
      ...commaJoin(laws.map(([name, rule]) =>
        [indent(depth + 2, `prose(${quote(name)}, ${quote(rule)})`)])),
      indent(depth + 1, ']')
    ]])
  ];
  return [indent(depth, `${key(desk.name)}: {`), ...commaJoin(fields), indent(depth, '}')];
}

/** A licence map, keyed by the name it licenses. Emitted only when the declaration has something
 *  to license: an empty map licenses nothing and would sit in the file as a dead export. */
function licenceLines(name: string, comment: readonly string[],
  entries: readonly (readonly [string, string])[]): readonly string[] {
  if (entries.length === 0) return [];
  return ['', ...comment, `export const ${name} = {`,
    ...commaJoin(entries.map(([law, licence]) => [indent(1, `${key(law)}: ${quote(licence)}`)])),
    '} as const;'];
}

/** Every prose name the cards mint, each claiming the one licence a rule about conduct has: it is
 *  about how a desk answers, and no check decides it. The map is read in three runs — the house
 *  laws every desk teaches, then the contract's own prose rules, then the laws one desk teaches
 *  alone — so the map itself says which laws are the house's and which belong to one seat. */
function conductLicences(declaration: Declaration): readonly (readonly [string, string])[] {
  const desks = declaration.desks;
  const taught: string[] = [];
  for (const desk of desks) {
    for (const law of Object.keys(desk.conduct)) if (!taught.includes(law)) taught.push(law);
  }
  const house = taught.filter(law => desks.every(desk => desk.conduct[law] !== undefined));
  const stamped = declaration.contract.guards
    .flatMap(guard => guard.factory === 'prose' ? [guard.name] : []);
  const names: string[] = [];
  for (const name of [...house, ...stamped, ...taught]) if (!names.includes(name)) names.push(name);
  return names.map(name => [name, 'conduct'] as const);
}

/** A section rule across the file: the label, then a line out to the same column every other
 *  section reaches. */
function divider(label: string): string {
  const head = `// ── ${label} `;
  return `${head}${'─'.repeat(Math.max(3, 80 - head.length))}`;
}

/** One declaration and the surface it is declared against, in; the whole text of `cards.ts`, out.
 *  The order is the order a reader needs it in: what the file is, the imports it uses, the prose
 *  helper, the licence maps, the DomainContract, and one AgentSpec per desk under the SPECS map
 *  the subject door re-exports. */
export function writeCards(declaration: Declaration, facts: SurfaceFacts): string {
  if (!isSlug(declaration.contract.name)) {
    throw new Error(`contract.name is '${declaration.contract.name}', and the domain's name is `
      + `written into the header comment of the file this emits — declare a name of letters, `
      + `digits and hyphens`);
  }
  const contract = contractLines(declaration, facts);
  const desks = commaJoin(declaration.desks.map(desk => deskLines(desk, 1)));
  const teaches = declaration.desks.some(desk => Object.keys(desk.conduct).length > 0)
    || declaration.contract.guards.some(guard => guard.factory === 'prose');
  const imported = declaration.contract.guards.map(guard => factoryCall(guard).imported)
    .filter((name): name is string => name !== null);
  const factories = [...new Set(imported)].sort();
  const wide = declaration.contract.guards
    .flatMap(guard => guard.wide === undefined ? [] : [[guard.name, guard.wide] as const]);

  return [
    `/** ${declaration.contract.name} — the two cards of this business: one DomainContract that`,
    ' *  says what the business is, and one AgentSpec per desk that says how that desk behaves.',
    ' *  Written by the looprun emitter from the declaration beside the world card, so every',
    ' *  sentence here is a sentence that declaration carries. Tool plumbing lives on the world',
    ' *  card. */',
    `import type { AgentSpec, DomainContract${teaches ? ', Guard' : ''} } from '@looprun-ai/core';`,
    ...(factories.length === 0 ? [] : [`import { ${factories.join(', ')} } from '@looprun-ai/core';`]),
    ...(teaches ? [
      '',
      divider('helpers'),
      '',
      '/** A rule the prompt states in plain words, on the desk that owes it: it renders into the',
      ' *  system prefix of that desk, and the desk reads it before it decides anything. */',
      'const prose = (name: string, rule: string): Guard => ({ name, rule, on: \'reply\' });'
    ] : []),
    ...licenceLines('WHY', [
      '/** Why each prose rule exists. Every name prose() mints appears here, claiming one of',
      ' *  noSuchAct, aboutARead, conduct or measured:<case>. The set is closed. */'
    ], conductLicences(declaration)),
    ...licenceLines('WIDE', [
      '/** Why a rule names more than one act: its sentence is stamped on the card of every act it',
      ' *  names, so naming several costs a licence — oneLawEveryAct, or sameRefusal. */'
    ], wide),
    '',
    divider('CARD 2 — the business'),
    '',
    ...contract,
    '',
    divider('CARD 1 — one desk each'),
    '',
    'export const SPECS: Readonly<Record<string, AgentSpec>> = {',
    ...desks,
    '};',
    ''
  ].join('\n');
}
