/** The tutorial's hotel exam is a shipped artifact: this is its own regression guard. Every
 *  `covers` key the real cases declare must resolve to a name the census actually carries — the
 *  synthetic bad-key proof lives in lints.test.ts, this file proves the real tutorial is clean. */
import { describe, expect, test } from 'vitest';
import { coversResolve } from '../src/lints.js';
import { cases } from '../../../docs/tutorial/snippets/hotel/exam.js';

describe('tutorial', () => {
  test('every hotel exam covers key resolves against the census', () => {
    const census = new Set(['confirmFirst:cancelBooking', 'onlyAfter:cancelBooking',
                            'precondition:moveBooking', 'valueFromUser:moveBooking']);
    expect(coversResolve(cases, census)).toEqual([]);
  });
});
