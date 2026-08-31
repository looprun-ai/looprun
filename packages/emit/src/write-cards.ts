/** The emitter of a subject's `cards.ts`: one declaration in, every line of the two cards out.
 *  The emitter writes the braces, the imports, the licence maps and the factory calls; every
 *  human-readable sentence in what it writes is a sentence the declaration carries. A field the
 *  declaration leaves empty is emitted empty, and a rule the emitter cannot compose from declared
 *  words is an error naming what is missing — never a sentence of the emitter's own. */
import type { SurfaceFacts } from '@looprun-ai/core';
import type { Declaration, DeclaredCap, DeclaredDisclosure, DeclaredGuard, DeclaredJudged,
  DeclaredNeed, DeclaredRewrite, DeclaredSecret, DeclaredWhy } from './declaration.js';

/** One seam law's name on the card: the coordinate of the row it pays, act then code, so a reader
 *  of the census can find that row in the seam table and a second sentence about the same refusal
 *  cannot hide under a different name. */
export const seamName = (act: string, code: string): string => `seam:${act}:${code}`;

/** Every seam law of one declaration, in declaration order: the act, the code, the sentence, and
 *  the name the card gives it. */
export function seamLaws(declaration: Declaration): readonly {
  readonly act: string; readonly code: string; readonly sentence: string; readonly name: string
}[] {
  return Object.entries(declaration.contract.seam ?? {}).flatMap(([act, codes]) =>
    Object.entries(codes).map(([code, sentence]) =>
      ({ act, code, sentence, name: seamName(act, code) })));
}

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
  precondition: ['reads', 'field', 'is', 'in'],
  role: ['anchor', 'by', 'from', 'field', 'in'],
  valueFromUser: ['arg'],
  argMatchesFormat: ['arg', 'pattern'],
  argForbidden: ['arg'],
  cap: ['calls', 'scope'],
  resultSatisfiesCondition: ['field', 'is', 'in'],
  mustAccountFor: ['records', 'status'],
  blockPattern: ['pattern', 'on'],
  argSatisfiesCondition: ['arg', 'is', 'in'],
  valueFromUserOrRecord: ['arg', 'from', 'field'],
  argMatchesRecord: ['arg', 'field'],
  onlyAfterWhen: ['after', 'field', 'is', 'in'],
  prose: ['why'],
  deny: []
};

/** What each rewrite is configured from. A rewrite edits the outgoing reply and decides nothing,
 *  so a key outside its own list configures nothing, exactly as a foreign guard argument does. */
const LAWFUL_REWRITE: Readonly<Record<DeclaredRewrite['kind'], readonly string[]>> = {
  maskPattern: ['name', 'pattern'],
  purgePattern: ['name', 'pattern'],
  swapTerms: ['terms']
};

/** How a factory is pointed at the acts a guard names. `all` — the call takes every one of them;
 *  `first` — the call takes the first, and the rest arrive as the guard's own `tool` scope;
 *  `none` — the call takes no act at all, so every act the guard names arrives as that scope. */
const ACT_SHAPE: Readonly<Record<DeclaredGuard['factory'], 'all' | 'first' | 'none'>> = {
  onlyAfter: 'first',
  precondition: 'all',
  role: 'all',
  valueFromUser: 'first',
  argMatchesFormat: 'first',
  argForbidden: 'first',
  cap: 'first',
  resultSatisfiesCondition: 'first',
  mustAccountFor: 'none',
  blockPattern: 'none',
  argSatisfiesCondition: 'all',
  valueFromUserOrRecord: 'first',
  argMatchesRecord: 'first',
  onlyAfterWhen: 'first',
  prose: 'none',
  deny: 'none'
};

/** The factories whose law is the declaration's own sentence: the check refuses with it, or it
 *  states the correction the reply owes. A factory that mints its sentence from its own
 *  configuration is not here — a `rule` beside it overrides that sentence and is optional. */
const OWES_RULE: ReadonlySet<DeclaredGuard['factory']> = new Set(['precondition', 'role', 'cap', 'resultSatisfiesCondition', 'blockPattern', 'prose',
  'argSatisfiesCondition', 'valueFromUserOrRecord', 'argMatchesRecord', 'onlyAfterWhen']);

/** The factories handed the declared sentence inside the call itself. Every other factory mints
 *  its own, and a `rule` declared beside one of those is emitted as a field of the literal. */
const TAKES_RULE: ReadonlySet<DeclaredGuard['factory']> = new Set(['precondition', 'role',
  'cap', 'blockPattern',
  'argSatisfiesCondition', 'valueFromUserOrRecord', 'argMatchesRecord', 'onlyAfterWhen']);

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

/** The first template slot a sentence still carries, or null. A slot is `<` followed by a
 *  letter and a closing `>` — the shape a sentence marks for the parts an author must replace
 *  with the domain's own nouns. */
function unfilledSlot(sentence: string): string | null {
  for (let at = sentence.indexOf('<'); at !== -1; at = sentence.indexOf('<', at + 1)) {
    const close = sentence.indexOf('>', at + 1);
    if (close === -1) return null;
    const head = sentence.charAt(at + 1).toLowerCase();
    if (head >= 'a' && head <= 'z' && close - at <= 82) return sentence.slice(at, close + 1);
  }
  return null;
}

/** Every sentence the declaration states, by its YAML path. A sentence still carrying a
 *  template slot is a template nobody filled — the law would read as boilerplate on every desk
 *  that states it — so the emitter refuses it by name. */
function refuseUnfilledSlots(declaration: Declaration): void {
  const sites: (readonly [string, string])[] = [
    ['contract.voice', declaration.contract.voice],
    ...declaration.contract.facts.map((fact, i) => [`contract.facts[${String(i)}]`, fact] as const),
    ...declaration.contract.guards.flatMap(guard =>
      guard.rule === undefined ? [] : [[`contract.guards '${guard.name}' rule`, guard.rule] as const]),
    ...Object.entries(declaration.contract.disclosure).flatMap(([act, entry]) => [
      ...(entry.before === undefined ? [] : [[`contract.disclosure.${act}.before`, entry.before] as const]),
      ...(entry.after === undefined ? [] : [[`contract.disclosure.${act}.after`, entry.after] as const]),
      ...(entry.later === undefined ? [] : [[`contract.disclosure.${act}.later`, entry.later] as const]),
      ...(entry.cap?.refusal === undefined ? [] : [[`contract.disclosure.${act}.cap.refusal`, entry.cap.refusal] as const]),
      ...(entry.empty === undefined ? [] : [[`contract.disclosure.${act}.empty`, entry.empty] as const])
    ]),
    ...(['status', 'sentence'] as const).flatMap(half =>
      Object.entries(declaration.contract.wording?.[half] ?? {})
        .map(([name, said]) => [`contract.wording.${half}.${name}`, said] as const)),
    ...seamLaws(declaration).map(law =>
      [`contract.seam.${law.act}.${law.code}`, law.sentence] as const),
    ...declaration.desks.flatMap(desk => [
      [`desks '${desk.name}' persona`, desk.persona] as const,
      ...Object.entries(desk.conduct).map(([law, sentence]) =>
        [`desks '${desk.name}' conduct.${law}`, sentence] as const)
    ])
  ];
  for (const [path, sentence] of sites) {
    const slot = unfilledSlot(sentence);
    if (slot !== null) {
      throw new Error(`${path} still carries the template slot '${slot}' — fill it with this `
        + `domain's own nouns before emitting`);
    }
  }
}

/** A single declared value as the card writes it: a word quoted, a figure and a flag bare. */
function scalarLiteral(value: string | number | boolean): string {
  return typeof value === 'string' ? quote(value) : String(value);
}

function isScalarValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** One field of a row, as the card reads it: the plain name where the field carries one, the
 *  bracketed literal where it does not. A row the surface never filled answers `undefined`, which
 *  no declared value equals. */
function fieldAccess(root: string, field: string): string {
  return isPlainName(field) ? `${root}?.${field}` : `${root}?.[${quote(field)}]`;
}

/** A law over one value, as data: `is` names the one value it must carry, `in` the list of values
 *  one of which it must be. Exactly one of the two — a value tested against both states two laws
 *  under one name, and a value tested against neither states none. `named` is the key the tested
 *  value arrives under, so the refusal points at the row the author wrote. */
function fieldTest(guard: DeclaredGuard, subject: string, named = 'args.field'): string {
  const single = guard.args?.is;
  const several = guard.args?.in;
  if ((single === undefined) === (several === undefined)) {
    throw new Error(`contract.guards '${guard.name}' declares ${named}, and its law tests the value `
      + `against exactly one of args.is — a single value — or args.in — a list of them; this `
      + `declaration carries ${single === undefined ? 'neither' : 'both'}`);
  }
  if (single !== undefined) {
    if (!isScalarValue(single)) {
      throw new Error(`contract.guards '${guard.name}' declares args.is as a block of its own, and `
        + `a value tested is one value — declare args.is as a word, a figure or a flag`);
    }
    return `${subject} === ${scalarLiteral(single)}`;
  }
  if (!Array.isArray(several) || several.length === 0 || !several.every(isScalarValue)) {
    throw new Error(`contract.guards '${guard.name}' declares args.in, whose configuration is a `
      + `list of one or more words, figures or flags the field may carry, which this declaration `
      + `does not carry`);
  }
  // The walk's own name for one declared value never shadows the subject: `argSatisfiesCondition` tests
  // the argument the call arrived with, which is itself named `value`.
  return `[${several.map(scalarLiteral).join(', ')}].some(declared => declared === ${subject})`;
}

/** The field a law tests, or null where the law is about the row itself. A value declared with no
 *  field to read it off tests nothing, so it is refused by the key that names it. */
function testedField(guard: DeclaredGuard): string | null {
  const field = guard.args?.field;
  if (field === undefined) {
    const valueKey = guard.args?.is !== undefined ? 'args.is'
      : guard.args?.in !== undefined ? 'args.in' : null;
    if (valueKey === null) return null;
    throw new Error(`contract.guards '${guard.name}' declares ${valueKey} and no args.field — the `
      + `value tested belongs to a field, and this declaration names none`);
  }
  if (typeof field !== 'string') {
    throw new Error(`contract.guards '${guard.name}' declares args.field, which names one field of `
      + `the record — declare it as that field's own name`);
  }
  return field;
}

/** A `precondition` reading the record: the acts it covers, the check its declared reading
 *  compiles to, and the sentence it refuses with. `reads: record` alone tests that the row is
 *  there; a `field` beside it tests what that row carries, and a row that is absent answers
 *  `undefined` — which no declared value equals, so the act refuses either way. */
function preconditionLines(guard: DeclaredGuard): readonly string[] {
  if (guard.args?.reads !== 'record') {
    throw new Error(`contract.guards '${guard.name}' declares factory 'precondition' with a `
      + `reading this emitter has no check for — the one it writes is \`reads: record\``);
  }
  const field = testedField(guard);
  const test = field === null ? 'record !== null' : fieldTest(guard, fieldAccess('record', field));
  const acts = guard.acts.length === 1 ? quote(guard.acts[0]) : list(guard.acts);
  return [`precondition(${acts}, ({ record }) => ${test},`, `${quote(ruleOf(guard))})`];
}

/** The values `args.in` names: the ones the acting record's field may carry for the act to run.
 *  A gate standing on an empty list refuses every call it covers, so the list is required to
 *  carry at least one value and every value is a word of the field's own. */
function allowedValues(guard: DeclaredGuard): readonly string[] {
  const declared = guard.args?.in;
  if (!Array.isArray(declared) || declared.length === 0
    || declared.some(value => typeof value !== 'string')) {
    throw new Error(`contract.guards '${guard.name}' declares factory 'role', whose configuration `
      + `is args.in — a list of one or more of the field's own values, which this declaration `
      + `does not carry`);
  }
  return declared as readonly string[];
}

/** A gate on the acting member's own record: the acts it covers, the walk from the anchor row to
 *  the field that decides, and the sentence it refuses with. The check is a `precondition` over
 *  the state — the record the acts are about decides nothing here, the member acting does. */
function roleLines(guard: DeclaredGuard): readonly string[] {
  const walk = ['anchor', 'by', 'from', 'field'].map(name => quote(stringArg(guard, name)));
  const allowed = allowedValues(guard);
  const acts = guard.acts.length === 1 ? quote(guard.acts[0]) : list(guard.acts);
  const from = quote(stringArg(guard, 'from'));
  const field = quote(stringArg(guard, 'field'));
  return [`precondition(${acts}, ({ state }) =>`,
    `${list(allowed)}.includes(actingField(state, ${walk.join(', ')}))`,
    `  || whoCan(state, ${from}, ${field}, ${list(allowed)}),`,
    `${quote(ruleOf(guard))})`];
}

/** A check over the result the act came back with: the field the declaration reads off it and the
 *  value that field owes. The call already ran, so the check never vetoes — it hands back the
 *  violation and the `rule` states the correction the reply owes, which is the whole of what a
 *  reader is given. */
function resultSatisfiesConditionLines(guard: DeclaredGuard, act: string): readonly string[] {
  const field = testedField(guard);
  if (field === null) {
    throw new Error(`contract.guards '${guard.name}' declares factory 'resultSatisfiesCondition', which reads `
      + `one field of the result — declare args.field and the value that field owes`);
  }
  const test = fieldTest(guard, `resultField(ctx.result, ${quote(field)})`);
  return [`resultSatisfiesCondition(${quote(act)}, ctx =>`, `${test} ? null : '')`];
}

/** A seam the declared pattern refuses at: the text it reads — `input` for the arriving message,
 *  `reply` for the outgoing one — the pattern itself as data, and the sentence the block refuses
 *  with. The factory is handed the guard's own name, so it mints the census row itself. */
function blockLines(guard: DeclaredGuard): readonly string[] {
  const seam = guard.args?.on;
  if (seam !== 'input' && seam !== 'reply') {
    const carried = seam === undefined ? 'this declaration does not carry it'
      : `this declaration carries '${String(seam)}', which is neither`;
    throw new Error(`contract.guards '${guard.name}' declares factory 'blockPattern', whose `
      + `configuration is args.on — the text the block reads, 'input' for the message arriving or `
      + `'reply' for the one going out — and ${carried}`);
  }
  return [`blockPattern(${quote(guard.name)}, new RegExp(${quote(stringArg(guard, 'pattern'))}),`,
    `${quote(ruleOf(guard))}, { on: ${quote(seam)} })`];
}

/** The words a report closes a record with. A status outside them is a row the engine's own
 *  vocabulary never writes, so the guard would look for a word no report can carry. */
const REPORT_WORDS: readonly string[] = ['done', 'held', 'refused', 'unknown', 'no_tool_called'];

/** The records a report must account for, and the word it must account for them with. The check
 *  reads the report's own rows — whole-value equality on the target — so both are data. */
function accountLines(guard: DeclaredGuard): readonly string[] {
  const records = guard.args?.records;
  if (!Array.isArray(records) || records.length === 0
    || !records.every(record => typeof record === 'string')) {
    throw new Error(`contract.guards '${guard.name}' declares factory 'mustAccountFor', whose `
      + `configuration is args.records — a list of one or more records the report must account `
      + `for, which this declaration does not carry`);
  }
  const status = guard.args?.status;
  if (typeof status !== 'string' || !REPORT_WORDS.includes(status)) {
    throw new Error(`contract.guards '${guard.name}' declares args.status, and a report closes a `
      + `record with one of ${REPORT_WORDS.join(', ')} — no other word is a row the engine writes`);
  }
  return [`mustAccountFor({ records: ${list(records)}, status: ${quote(status)} })`];
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

/** A law over the CALL's own argument: the acts it covers, the values that argument may carry,
 *  and the sentence it refuses with. The value tested is the one the call arrived with, so the
 *  records decide nothing here — an act on a surface holding no records states this law too. */
function argSatisfiesConditionLines(guard: DeclaredGuard): readonly string[] {
  const acts = guard.acts.length === 1 ? quote(guard.acts[0]) : list(guard.acts);
  return [`argSatisfiesCondition(${acts}, ${quote(stringArg(guard, 'arg'))}, ({ value }) => `
    + `${fieldTest(guard, 'value', 'args.arg')},`, `${quote(ruleOf(guard))})`];
}

/** Two grounds under one law: the entity whose rows may carry the value, and the field of those
 *  rows it is read off. The operator's own words are the other ground and are the engine's to
 *  search, so the declaration states only where the records answer. */
function valueFromUserOrRecordLines(guard: DeclaredGuard, act: string): readonly string[] {
  return [`valueFromUserOrRecord(${quote(act)}, ${quote(stringArg(guard, 'arg'))}, `
    + `${quote(stringArg(guard, 'from'))}, ${quote(stringArg(guard, 'field'))},`,
    `${quote(ruleOf(guard))})`];
}

/** The argument the record already fixes: the field of the call's OWN target row the value must
 *  equal. The walk to that row is the engine's, so the declaration names the field and nothing
 *  else. */
function argMatchesRecordLines(guard: DeclaredGuard, act: string): readonly string[] {
  return [`argMatchesRecord(${quote(act)}, ${quote(stringArg(guard, 'arg'))}, `
    + `${quote(stringArg(guard, 'field'))},`, `${quote(ruleOf(guard))})`];
}

/** The order and the condition as one guard: the read the act waits for, and the reading of the
 *  call's own row that decides whether it waits at all. */
function onlyAfterWhenLines(guard: DeclaredGuard, act: string): readonly string[] {
  const field = testedField(guard);
  if (field === null) {
    throw new Error(`contract.guards '${guard.name}' declares factory 'onlyAfterWhen', which `
      + `demands the read exactly where the record says so — declare args.field, and the value `
      + `that field carries where the read is owed`);
  }
  return [`onlyAfterWhen(${quote(act)}, ${quote(stringArg(guard, 'after'))},`,
    `({ record }) => ${fieldTest(guard, fieldAccess('record', field))},`,
    `${quote(ruleOf(guard))})`];
}

/** The call one declared guard is emitted from: the factory it imports, and the lines of the
 *  call itself. A factory configured from one act takes the first act the guard names and the
 *  rest arrive as the guard's own `tool` scope; `precondition` and `role` take them all. `prose`
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
  if (OWES_RULE.has(guard.factory)) ruleOf(guard);
  switch (guard.factory) {
    case 'onlyAfter':
      return { imported: 'onlyAfter',
        lines: [`onlyAfter(${quote(act)}, ${quote(stringArg(guard, 'after'))})`] };
    case 'valueFromUser':
      return { imported: 'valueFromUser',
        lines: [`valueFromUser(${quote(act)}, ${quote(stringArg(guard, 'arg'))})`] };
    case 'argMatchesFormat':
      return { imported: 'argMatchesFormat',
        lines: [`argMatchesFormat(${quote(act)}, ${quote(stringArg(guard, 'arg'))}, `
          + `${quote(stringArg(guard, 'pattern'))})`] };
    case 'argForbidden':
      return { imported: 'argForbidden',
        lines: [`argForbidden(${quote(act)}, ${quote(stringArg(guard, 'arg'))})`] };
    case 'resultSatisfiesCondition':
      return { imported: 'resultSatisfiesCondition', lines: resultSatisfiesConditionLines(guard, act) };
    case 'precondition':
      return { imported: 'precondition', lines: preconditionLines(guard) };
    case 'role':
      return { imported: 'precondition', lines: roleLines(guard) };
    case 'cap':
      return { imported: 'maxCalls', lines: capLines(guard, act) };
    case 'mustAccountFor':
      return { imported: 'mustAccountFor', lines: accountLines(guard) };
    case 'blockPattern':
      return { imported: 'blockPattern', lines: blockLines(guard) };
    case 'argSatisfiesCondition':
      return { imported: 'argSatisfiesCondition', lines: argSatisfiesConditionLines(guard) };
    case 'valueFromUserOrRecord':
      return { imported: 'valueFromUserOrRecord',
        lines: valueFromUserOrRecordLines(guard, act) };
    case 'argMatchesRecord':
      return { imported: 'argMatchesRecord', lines: argMatchesRecordLines(guard, act) };
    case 'onlyAfterWhen':
      return { imported: 'onlyAfterWhen', lines: onlyAfterWhenLines(guard, act) };
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
  const shape = ACT_SHAPE[guard.factory];
  // A factory handed the guard's own name mints the census row itself, so the literal around it
  // states only what the call does not already carry.
  const fields = guard.factory === 'blockPattern' ? [] : [`name: ${quote(guard.name)}`];
  if (shape === 'none' || (shape === 'first' && guard.acts.length > 1)) {
    fields.push(`tool: ${list(guard.acts)}`);
  }
  if (guard.rule !== undefined && !TAKES_RULE.has(guard.factory)) {
    fields.push(`rule: ${quote(guard.rule)}`);
  }
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
      const pick = need.pick === undefined ? ''
        : `, pick: { list: ${quote(need.pick.list)}, by: ${quote(need.pick.by)}, `
          + `key: ${quote(need.pick.key)} }`;
      return `{ tool: ${quote(need.tool)}, args: ${args.length === 0 ? '{}' : `{ ${args} }`}${pick} }`;
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
    ...(entry.later === undefined ? [] : [[indent(depth + 1, `later: ${quote(entry.later)}`)]]),
    ...(entry.cap === undefined ? [] : [capBlock(act, entry.cap, depth + 1)]),
    ...(entry.empty === undefined ? [] : [[indent(depth + 1, `empty: ${quote(entry.empty)}`)]])
  ];
  return [
    indent(depth, `${key(act)}: {`),
    ...commaJoin([...needs, ...tenses]),
    indent(depth, '}')
  ];
}

/** One rewrite as the card carries it. A pattern rewrite is its name and the pattern it acts on —
 *  the pattern is that rewrite's own DATA, which is why the card may carry one at all. A term swap
 *  is the pairs themselves: the word the business does not use, and the word it does. */
function rewriteCall(rewrite: DeclaredRewrite, at: number): string {
  const lawful = LAWFUL_REWRITE[rewrite.kind];
  for (const declared of Object.keys(rewrite)) {
    if (declared === 'kind' || lawful.includes(declared)) continue;
    throw new Error(`contract.rewrites[${String(at)}] declares ${declared}, and kind `
      + `'${rewrite.kind}' is configured from ${lawful.join(' and ')} — drop it, or declare the `
      + `rewrite whose kind reads it`);
  }
  if (rewrite.kind === 'swapTerms') {
    const pairs = Object.entries(rewrite.terms ?? {});
    if (pairs.length === 0) {
      throw new Error(`contract.rewrites[${String(at)}] declares kind 'swapTerms', whose `
        + `configuration is terms — one or more pairs of the word the business does not use and `
        + `the word it does, which this declaration does not carry`);
    }
    return `swapTerms({ ${pairs.map(([from, to]) => `${key(from)}: ${quote(to)}`).join(', ')} })`;
  }
  const missing = [...(rewrite.name === undefined ? ['name'] : []),
                   ...(rewrite.pattern === undefined ? ['pattern'] : [])];
  if (missing.length > 0 || rewrite.name === undefined || rewrite.pattern === undefined) {
    throw new Error(`contract.rewrites[${String(at)}] declares kind '${rewrite.kind}' and no `
      + `${missing.join(' and no ')} — a pattern rewrite is a name the census carries and the `
      + `pattern it acts on`);
  }
  return `${rewrite.kind}(${quote(rewrite.name)}, new RegExp(${quote(rewrite.pattern)}))`;
}

/** The engine's own names for what a business may say differently: the words a status is
 *  delivered in, and the sentences the engine speaks for itself. A key outside these is a word
 *  nothing reads, so the override never reaches an operator and the declaration is refused. */
const WORDING_KEYS: Readonly<Record<string, readonly string[]>> = {
  status: ['done', 'not-done', 'unknown', 'held', 'refused', 'blocked'],
  sentence: ['approvalInstruction', 'exhaustionClosure', 'unknownStatus', 'questionExpired',
    'questionSuperseded', 'questionDeclined', 'deniedByGuard']
};

/** One half of the wording table as the card carries it: the engine's key, and this business's
 *  own sentence for it. */
function wordingHalf(half: 'status' | 'sentence', words: Readonly<Record<string, string>>,
  depth: number): readonly string[] {
  const lawful = WORDING_KEYS[half];
  const pairs = Object.entries(words);
  for (const [name] of pairs) {
    if (lawful.includes(name)) continue;
    throw new Error(`contract.wording.${half} declares '${name}', and the engine's ${half} table `
      + `carries ${lawful.join(', ')} — an override on any other key reaches nobody`);
  }
  if (pairs.length === 0) {
    throw new Error(`contract.wording.${half} is empty, and a wording table states the words this `
      + `business says differently — drop the key, or state one`);
  }
  return [indent(depth, `${half}: {`),
    ...commaJoin(pairs.map(([name, said]) => [indent(depth + 1, `${key(name)}: ${quote(said)}`)])),
    indent(depth, '}')];
}

function wordingLines(wording: NonNullable<Declaration['contract']['wording']>,
  depth: number): readonly string[] {
  const halves = [
    ...(wording.status === undefined ? [] : [wordingHalf('status', wording.status, depth + 1)]),
    ...(wording.sentence === undefined ? [] : [wordingHalf('sentence', wording.sentence, depth + 1)])
  ];
  if (halves.length === 0) {
    throw new Error('contract.wording carries neither status nor sentence — a wording table states '
      + 'the status words this business delivers, the engine sentences it speaks, or both');
  }
  return [indent(depth, 'wording: {'), ...commaJoin(halves), indent(depth, '}')];
}

/** The ceilings the engine carries. A ceiling on any other name is a figure nothing reads, so the
 *  bound the author meant to set is never set at all. */
const LIMIT_NAMES: readonly string[] = ['calls', 'destructive', 'retries', 'questionTurns'];

/** The ceilings one card states, on one line. The same shape serves the whole business and one
 *  desk — the desk's figure wins per field over the contract's. */
function limitLines(at: string, limits: Readonly<Record<string, number>>, depth: number): string {
  const entries = Object.entries(limits);
  for (const [name] of entries) {
    if (LIMIT_NAMES.includes(name)) continue;
    throw new Error(`${at} declares '${name}', and the engine's ceilings are `
      + `${LIMIT_NAMES.join(', ')} — a figure on any other name bounds nothing`);
  }
  if (entries.length === 0) {
    throw new Error(`${at} is empty, and a ceiling states a figure — drop the key, or state one`);
  }
  return indent(depth, `limits: { ${entries
    .map(([name, value]) => `${key(name)}: ${String(value)}`).join(', ')} }`);
}

/** What is never spoken, as the card carries it: a bare field name masks its value at every seam,
 *  and the mapping form states the other treatment the engine has for it. */
function secretLiteral(secret: DeclaredSecret): string {
  return typeof secret === 'string' ? quote(secret)
    : `{ path: ${quote(secret.path)}, mode: ${quote(secret.mode)} }`;
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
    ...(contract.rewrites === undefined ? [] : [block('rewrites: [',
      commaJoin(contract.rewrites.map((rewrite, at) => [indent(2, rewriteCall(rewrite, at))])), ']')]),
    ...(contract.secrets === undefined ? [] : [[indent(1,
      `secrets: [${contract.secrets.map(secretLiteral).join(', ')}]`)]]),
    ...(contract.wording === undefined ? [] : [wordingLines(contract.wording, 1)]),
    ...(contract.limits === undefined ? [] : [[limitLines('contract.limits', contract.limits, 1)]])
  ];
  return ['export const CONTRACT: DomainContract = {', ...commaJoin(fields), '};'];
}

/** One judged check as the desk carries it: the factory, and the acts that scope it. A judged
 *  guard naming no act runs on every reply this desk writes, whatever the reply was about, so the
 *  acts are required. */
function judgedLines(desk: Declaration['desks'][number], check: DeclaredJudged): string {
  if (check.acts.length === 0) {
    throw new Error(`desks '${desk.name}' declares judged '${check.factory}' over no act — a judged `
      + `check is answered by the model on every reply it is not scoped to, so it names the acts `
      + `it is asked about`);
  }
  return `{ ...${check.factory}(), tool: ${list(check.acts)} }`;
}

/** One desk as its own AgentSpec: who it is, the lane it acts in, the desks it hands work to,
 *  the conduct laws it teaches — one `prose` call per law, in the declaration's own order — the
 *  seam laws for the acts this lane holds, and the judged checks it earned, which live on a spec
 *  and nowhere else.
 *
 *  A seam law is ONE law per refusal row, never a paragraph gathering an act's codes together: a
 *  clause at the tail of a long law is a clause the desk drops, and the operator meeting one code
 *  is owed the sentence written for that code. */
function deskLines(desk: Declaration['desks'][number], depth: number,
                   seam: readonly { readonly act: string; readonly sentence: string;
                                    readonly name: string }[]): readonly string[] {
  const laws = Object.entries(desk.conduct);
  const held = seam.filter(law => desk.tools.includes(law.act));
  const judged = desk.judged ?? [];
  const fields = [
    [indent(depth + 1, `name: ${quote(desk.name)}`)],
    [indent(depth + 1, `persona: ${quote(desk.persona)}`)],
    [indent(depth + 1, `tools: ${list(desk.tools)}`)],
    ...(desk.description === undefined ? [] : [[indent(depth + 1, `description: ${quote(desk.description)}`)]]),
    ...(desk.summary === undefined ? [] : [[indent(depth + 1, `summary: ${quote(desk.summary)}`)]]),
    [indent(depth + 1, 'llmParams: { temperature: 0 }')],
    ...(desk.limits === undefined ? []
      : [[limitLines(`desks '${desk.name}' limits`, desk.limits, depth + 1)]]),
    // The judged pass is bought by the desk that carries a judged check: one model
    // call per check, on every reply the acts it names were touched by.
    ...(judged.length === 0 ? [] : [[indent(depth + 1, 'judgePass: true')]]),
    ...(laws.length === 0 && held.length === 0 && judged.length === 0 ? [] : [[
      indent(depth + 1, 'guards: ['),
      ...commaJoin([
        ...laws.map(([name, rule]) => [indent(depth + 2, `prose(${quote(name)}, ${quote(rule)})`)]),
        ...held.map(law => [indent(depth + 2, `prose(${quote(law.name)}, ${quote(law.sentence)})`)]),
        ...judged.map(check => [indent(depth + 2, judgedLines(desk, check))])
      ]),
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

/** The licences a declared prose rule may claim. The emitted map carries a fourth,
 *  `measured:<case>`, and it is earned from a run that judged the case it names. */
const PROSE_WHY: readonly DeclaredWhy[] = ['noSuchAct', 'aboutARead', 'conduct'];

function isDeclaredWhy(value: unknown): value is DeclaredWhy {
  return PROSE_WHY.some(claim => claim === value);
}

/** The licence one contract prose rule claims, as its author declared it. A prose rule is the
 *  residue — what is left when no check decides the law — and the map says which kind of residue
 *  each one is, so a rule that is none of them is a rule the declaration may not carry. */
function proseWhy(guard: DeclaredGuard): DeclaredWhy {
  const claim = guard.args?.why;
  if (typeof claim === 'string' && claim.startsWith('measured:')) {
    throw new Error(`contract.guards '${guard.name}' claims args.why '${claim}', and a measured `
      + `licence is earned from a run that judged the case it names — a declaration judges `
      + `nothing, so it claims one of ${PROSE_WHY.join(', ')}`);
  }
  if (!isDeclaredWhy(claim)) {
    const carried = claim === undefined ? 'carries none'
      : typeof claim === 'string' ? `carries '${claim}'` : 'carries a block of its own';
    throw new Error(`contract.guards '${guard.name}' declares factory 'prose', whose configuration `
      + `is args.why — why this rule stands where no check decides it, one of `
      + `${PROSE_WHY.join(', ')} — and this declaration ${carried}`);
  }
  return claim;
}

/** Every prose name the cards mint, each with the licence it claims. A desk's conduct law claims
 *  `conduct` by what it is: a law about how that desk answers, which no check decides. A seam law
 *  claims `seam`: it stands for a refusal the WORLD spells out, so its home is the act it names
 *  and not the house — the desks holding that act read it, and the desks that cannot perform it
 *  owe nothing. A prose rule on the contract claims the licence its author declared. The map is
 *  read in four runs — the house laws every desk teaches, then the contract's own prose rules,
 *  then the laws one desk teaches alone, then the seam — so the map itself says which laws are
 *  the house's and which belong to one seat or to one refusal. */
function proseLicences(declaration: Declaration): readonly (readonly [string, string])[] {
  const desks = declaration.desks;
  const taught: string[] = [];
  for (const desk of desks) {
    for (const law of Object.keys(desk.conduct)) if (!taught.includes(law)) taught.push(law);
  }
  const house = taught.filter(law => desks.every(desk => desk.conduct[law] !== undefined));
  const stamped = declaration.contract.guards
    .flatMap(guard => guard.factory === 'prose' ? [[guard.name, proseWhy(guard)] as const] : []);
  const claimed = new Map<string, string>();
  for (const law of house) if (!claimed.has(law)) claimed.set(law, 'conduct');
  for (const [name, why] of stamped) if (!claimed.has(name)) claimed.set(name, why);
  for (const law of taught) if (!claimed.has(law)) claimed.set(law, 'conduct');
  for (const law of seamLaws(declaration)) if (!claimed.has(law.name)) claimed.set(law.name, 'seam');
  return [...claimed];
}

/** A section rule across the file: the label, then a line out to the same column every other
 *  section reaches. */
function divider(label: string): string {
  const head = `// ── ${label} `;
  return `${head}${'─'.repeat(Math.max(3, 80 - head.length))}`;
}

/** One declaration and the surface it is declared against, in; the whole text of `cards.ts`, out.
 *  The order is the order a reader needs it in: what the file is, the imports it uses, the helpers
 *  the cards call, the licence maps, the DomainContract, and one AgentSpec per desk under the SPECS map
 *  the subject door re-exports. */
export function writeCards(declaration: Declaration, facts: SurfaceFacts): string {
  if (!isSlug(declaration.contract.name)) {
    throw new Error(`contract.name is '${declaration.contract.name}', and the domain's name is `
      + `written into the header comment of the file this emits — declare a name of letters, `
      + `digits and hyphens`);
  }
  refuseUnfilledSlots(declaration);
  const seam = seamLaws(declaration);
  const contract = contractLines(declaration, facts);
  const desks = commaJoin(declaration.desks.map(desk => deskLines(desk, 1, seam)));
  const teaches = declaration.desks.some(desk => Object.keys(desk.conduct).length > 0)
    || declaration.contract.guards.some(guard => guard.factory === 'prose')
    || seam.length > 0;
  const gatesOnRole = declaration.contract.guards.some(guard => guard.factory === 'role');
  const readsResults = declaration.contract.guards.some(guard => guard.factory === 'resultSatisfiesCondition');
  const helperBlocks: readonly (readonly string[])[] = [
    ...(teaches ? [[
      '/** A rule the prompt states in plain words, on the desk that owes it: it renders into the',
      ' *  system prefix of that desk, and the desk reads it before it decides anything. */',
      'const prose = (name: string, rule: string): Guard => ({ name, rule, on: \'reply\' });'
    ]] : []),
    ...(gatesOnRole ? [[
      '/** The value one field of the acting record carries. The first row of the anchor entity',
      ' *  names who is acting through a field of its own, that name keys a row of the entity the',
      ' *  actors live in, and the field asked for is read off that row. A step the records do not',
      ' *  answer ends the walk on the empty string, which no list of values carries. */',
      'const actingField = (state: StateSnapshot, anchor: string, by: string, from: string,',
      '  field: string): string => {',
      '  const anchorRow = Object.values(state[anchor] ?? {})[0];',
      '  const acting = anchorRow?.[by];',
      '  const record = typeof acting === \'string\' ? state[from]?.[acting] : undefined;',
      '  const value = record?.[field];',
      '  return typeof value === \'string\' ? value : \'\';',
      '};',
      '',
      '/** Who else may act, read off the same records the gate decides on: every row of the',
      ' *  actors entity whose deciding field carries a value the gate allows, named by its own',
      ' *  key and, where the row carries one, its name. The refusal names people, because a',
      ' *  permission is not somebody the operator can go to. */',
      'const whoCan = (state: StateSnapshot, from: string, field: string,',
      '  allowed: readonly string[]): string => {',
      '  const named = Object.entries(state[from] ?? {})',
      '    .filter(([, row]) => allowed.includes(String(row?.[field])))',
      '    .map(([key, row]) => (typeof row?.[\'name\'] === \'string\'',
      '      ? `${String(row[\'name\'])} (${key})` : key));',
      '  return named.length === 0',
      '    ? \'No record here carries a value that can.\'',
      '    : `${named.join(\', \')} can.`;',
      '};'
    ]] : []),
    ...(readsResults ? [[
      '/** A result that is a block of named fields — the one shape a field can be read off. */',
      'const isFieldBlock = (value: Json): value is { readonly [k: string]: Json } =>',
      '  typeof value === \'object\' && value !== null && !Array.isArray(value);',
      '',
      '/** The value one field of a result carries. A result that is not a block of fields, and a',
      ' *  field a result does not carry, both answer undefined — which no declared value equals. */',
      'const resultField = (result: Json, field: string): Json | undefined =>',
      '  isFieldBlock(result) ? result[field] : undefined;'
    ]] : [])
  ];
  const helpers = helperBlocks.flatMap((block, at) => at === 0 ? [...block] : ['', ...block]);
  const types = ['AgentSpec', 'DomainContract', ...(teaches ? ['Guard'] : []),
    ...(readsResults ? ['Json'] : []), ...(gatesOnRole ? ['StateSnapshot'] : [])];
  const imported = [
    ...declaration.contract.guards.map(guard => factoryCall(guard).imported)
      .filter((name): name is string => name !== null),
    ...(declaration.contract.rewrites ?? []).map(rewrite => rewrite.kind),
    ...declaration.desks.flatMap(desk => (desk.judged ?? []).map(check => check.factory))
  ];
  const factories = [...new Set(imported)].sort();
  const wide = declaration.contract.guards
    .flatMap(guard => guard.wide === undefined ? [] : [[guard.name, guard.wide] as const]);

  return [
    `/** ${declaration.contract.name} — the two cards of this business: one DomainContract that`,
    ' *  says what the business is, and one AgentSpec per desk that says how that desk behaves.',
    ' *  Written by the looprun emitter from the declaration beside the world card, so every',
    ' *  sentence here is a sentence that declaration carries. Tool plumbing lives on the world',
    ' *  card. */',
    `import type { ${types.join(', ')} } from '@looprun-ai/core';`,
    ...(factories.length === 0 ? [] : [`import { ${factories.join(', ')} } from '@looprun-ai/core';`]),
    ...(helpers.length === 0 ? [] : ['', divider('helpers'), '', ...helpers]),
    ...licenceLines('WHY', [
      '/** Why each prose rule exists. Every name prose() mints appears here, claiming one of',
      ' *  noSuchAct, aboutARead, conduct, seam or measured:<case>. The set is closed. */'
    ], proseLicences(declaration)),
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
