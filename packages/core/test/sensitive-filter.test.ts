/**
 * The sensitive-data filter — pure functions over a result value or free text, run before either
 * reaches the model's context.
 */
import { describe, expect, it } from 'vitest';
import { filterSensitiveFields, scrubText } from '../src/runtime/sensitive-filter.js';

describe('filterSensitiveFields', () => {
  it('omit deletes the field wherever its path suffix matches', () => {
    const out = filterSensitiveFields(
      { customer: { phone: '555-0199', name: 'Ana' }, items: [{ customer: { phone: 'x' } }] },
      { 'customer.phone': 'omit' },
    );
    expect(JSON.stringify(out)).not.toContain('phone');
    expect((out as any).customer.name).toBe('Ana');
  });

  it('mask replaces the value, keeps the shape recognizable', () => {
    const out = filterSensitiveFields({ customer: { email: 'ops@northside.example' } }, { 'customer.email': 'mask' });
    expect((out as any).customer.email).toBe('o•••@northside.example');
  });

  it('mask replaces a non-string value with the bare stub', () => {
    const out = filterSensitiveFields({ customer: { phone: 4155550199 } }, { 'customer.phone': 'mask' });
    expect((out as any).customer.phone).toBe('•••');
    expect(JSON.stringify(out)).not.toContain('4155550199');
  });

  it('mask replaces a whole container without descending into it', () => {
    const out = filterSensitiveFields(
      { customer: { contact: { phone: '555-0199', lines: ['555-0199'] } } },
      { 'customer.contact': 'mask' },
    );
    expect((out as any).customer.contact).toBe('•••');
    expect(JSON.stringify(out)).not.toContain('555-0199');
  });

  it('inputs are never mutated', () => {
    const input = { customer: { phone: '555-0199' } };
    filterSensitiveFields(input, { 'customer.phone': 'omit' });
    expect(input.customer.phone).toBe('555-0199');
  });
});

describe('scrubText', () => {
  it('masks well-formed classes and nothing else', () => {
    expect(scrubText('mail ops@x.example or +1 415 555 0199')).toBe('mail ••• or •••');
    expect(scrubText('invoice inv_7001 total 2930 on 2026-08-03')).toBe('invoice inv_7001 total 2930 on 2026-08-03');
  });

  it('card numbers pass only via Luhn', () => {
    expect(scrubText('card 4539 1488 0343 6467')).toBe('card •••'); // Luhn-valid
    expect(scrubText('ref 4539 1488 0343 6468')).toBe('ref 4539 1488 0343 6468'); // Luhn-invalid
  });
});
