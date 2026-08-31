/** The argument-shaped rungs, named back against the surface. Each of them reads an argument off
 *  the arriving call or walks to the call's own row, and each way of pointing one at something the
 *  act has not got costs a guard that never fires or a guard that refuses everything — so each is
 *  a refusal at emit time, with the name the author meant beside it. */
import { expect, test } from 'vitest';
import { checkAgainstSurface, writeCards } from '../src/index.js';
import type { DeclaredGuard } from '../src/index.js';
import { decl, FACTS, SEAM } from './helpers.js';

const surface = (guard: DeclaredGuard): readonly string[] =>
  checkAgainstSurface(decl({ guards: [guard] }), FACTS, SEAM);

const guard = (factory: DeclaredGuard['factory'], args: Record<string, unknown>,
               acts: readonly string[] = ['issueRefund']): DeclaredGuard =>
  ({ name: 'theLaw', acts, factory, args, rule: 'The law this guard states.' });

test('argCondition pointed at an argument the act does not carry is named back', () => {
  const [refusal, ...rest] = surface(guard('argCondition', { arg: 'resaon', is: 'duplicate' }));
  expect(rest).toEqual([]);
  expect(refusal).toContain('args.arg names \'resaon\'');
  expect(refusal).toContain('Did you mean \'reason\'?');
  expect(refusal).toContain('never fires');
});

test('valueFromUserOrRecord pointed at an argument the act does not carry is named back', () => {
  const [refusal] = surface(guard('valueFromUserOrRecord',
    { arg: 'amonut', from: 'invoices', field: 'total' }));
  expect(refusal).toContain('args.arg names \'amonut\'');
  expect(refusal).toContain('Did you mean \'amount\'?');
  expect(refusal).toContain('refuses every call');
});

test('argMatchesRecord pointed at an argument the act does not carry is named back', () => {
  const [refusal] = surface(guard('argMatchesRecord', { arg: 'currncy', field: 'currency' }));
  expect(refusal).toContain('args.arg names \'currncy\'');
  expect(refusal).toContain('Did you mean \'currency\'?');
});

test('an operator-value rung on an argument the act does not require is named back', () => {
  const [refusal, ...rest] = surface(guard('valueFromUserOrRecord',
    { arg: 'note', from: 'invoices', field: 'total' }));
  expect(rest).toEqual([]);
  expect(refusal).toContain('args.arg names \'note\'');
  expect(refusal).toContain('may leave \'note\' out');
});

test('argMatchesRecord on an argument the act does not require is named back', () => {
  const [refusal] = surface(guard('argMatchesRecord', { arg: 'note', field: 'total' }));
  expect(refusal).toContain('may leave \'note\' out');
});

/** A world files records under families no act need target, so a `from:` naming one of those is
 *  lawful and the surface facts cannot tell it apart from a misspelling. The emitter says nothing
 *  either way rather than refusing a declaration that is right. */
test('valueFromUserOrRecord naming a record family no act targets emits', () => {
  expect(surface(guard('valueFromUserOrRecord',
    { arg: 'amount', from: 'members', field: 'role' }))).toEqual([]);
});

test('a row-walking rung over an act with no target row is named back', () => {
  const names = (guardDeclared: DeclaredGuard): string =>
    surface(guardDeclared).filter(refusal => refusal.includes('names no target')).join('\n');
  expect(names(guard('argMatchesRecord', { arg: 'ref', field: 'total' }, ['closeBooking'])))
    .toContain('closeBooking names no target');
  expect(names(guard('onlyAfterWhen', { after: 'getInvoice', field: 'status', is: 'OPEN' },
    ['closeBooking']))).toContain('closeBooking names no target');
});

/** The whole point of `in:`: the values the argument may carry, and no others. */
test('argCondition with in: tests the CALL\'s argument, never itself', () => {
  const text = writeCards(decl({ guards: [guard('argCondition',
    { arg: 'reason', in: ['duplicate', 'overcharge'] })] }), FACTS);
  expect(text).toContain('argCondition(\'issueRefund\', \'reason\', ({ value }) =>');
  expect(text).not.toContain('value === value');
  expect(text).toContain('.some(declared => declared === value)');
});

/** A target names the row inside the act's OWN record family, so the two are one fact: an act
 *  that names a target and no entity points at a row in no family at all. The walk then finds
 *  nothing on every call — a record law decides against a row it never reached, and the refusal
 *  it writes names an id the records DO carry. */
const TARGET_NO_ENTITY = { tools: {
  ...FACTS.tools,
  stampInvoice: { name: 'stampInvoice', effect: 'write', target: 'id', entity: undefined,
    schema: { type: 'object', properties: { id: {}, total: {} }, required: ['id', 'total'] } }
} } as never;

test('a row-walking rung over an act that names no entity is named back', () => {
  const over = (factory: DeclaredGuard['factory'], args: Record<string, unknown>): string =>
    checkAgainstSurface(decl({ guards: [{ name: 'theLaw', acts: ['stampInvoice'], factory, args,
      rule: 'The law this guard states.' }] }), TARGET_NO_ENTITY, SEAM)
      .filter(refusal => refusal.includes('guards[0]')).join('\n');

  for (const [factory, args] of [
    ['argMatchesRecord', { arg: 'total', field: 'total' }],
    ['onlyAfterWhen', { after: 'getInvoice', field: 'status', is: 'OPEN' }],
    ['precondition', { reads: 'record', field: 'status', is: 'OPEN' }]
  ] as const) {
    const refusal = over(factory, args);
    expect(refusal, factory).toContain('stampInvoice names no entity');
  }
});
