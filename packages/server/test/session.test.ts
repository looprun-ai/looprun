/** Session resolution chain, fingerprint stability and per-session serialization — pure units. */
import { describe, expect, it } from 'vitest';
import { fingerprintSession, lastUserText, resolveSessionId } from '../src/index.js';
import { SessionLocks, SessionTtl } from '../src/session.js';
import type { WireMessage } from '../src/index.js';

const MSGS: WireMessage[] = [
  { role: 'system', content: 'harness prompt' },
  { role: 'user', content: 'first ask' },
];

describe('resolveSessionId — precedence', () => {
  const body = { model: 'a', messages: MSGS, user: 'end-user-7' };

  it('header wins over body.user and fingerprint', () => {
    expect(resolveSessionId(body, new Headers({ 'x-looprun-session': 'conv-1' }))).toBe('conv-1');
  });

  it('body.user wins over fingerprint', () => {
    expect(resolveSessionId(body, new Headers())).toBe('end-user-7');
  });

  it('falls back to the fingerprint', () => {
    expect(resolveSessionId({ model: 'a', messages: MSGS }, new Headers())).toBe(fingerprintSession('a', MSGS));
  });
});

describe('fingerprintSession — stability', () => {
  it('is stable when history grows or middles are rewritten, keyed on the FIRST user message', () => {
    const base = fingerprintSession('a', MSGS);
    const grown: WireMessage[] = [...MSGS, { role: 'assistant', content: 'reply' }, { role: 'user', content: 'second ask' }];
    const rewritten: WireMessage[] = [MSGS[0]!, MSGS[1]!, { role: 'assistant', content: '[compressed]' }, { role: 'user', content: 'third' }];
    expect(fingerprintSession('a', grown)).toBe(base);
    expect(fingerprintSession('a', rewritten)).toBe(base);
  });

  it('forks on a different first user message or model', () => {
    const base = fingerprintSession('a', MSGS);
    expect(fingerprintSession('a', [{ role: 'user', content: 'other' }])).not.toBe(base);
    expect(fingerprintSession('b', MSGS)).not.toBe(base);
  });
});

describe('lastUserText', () => {
  it('reads string and part-array contents, latest user first', () => {
    expect(lastUserText(MSGS)).toBe('first ask');
    expect(
      lastUserText([
        { role: 'user', content: 'old' },
        { role: 'user', content: [{ type: 'text', text: 'new' }, { type: 'image_url' }] },
      ]),
    ).toBe('new');
  });

  it('returns null when no user text exists', () => {
    expect(lastUserText([{ role: 'system', content: 'x' }])).toBeNull();
    expect(lastUserText([{ role: 'user', content: [] }])).toBeNull();
  });
});

describe('SessionLocks', () => {
  it('serializes same-key tasks and interleaves different keys', async () => {
    const locks = new SessionLocks();
    const order: string[] = [];
    const slow = (label: string, ms: number) => async () => {
      order.push(`${label}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${label}:end`);
      return label;
    };
    const [a1, b1, a2] = await Promise.all([
      locks.run('A', slow('a1', 30)),
      locks.run('B', slow('b1', 5)),
      locks.run('A', slow('a2', 5)),
    ]);
    expect([a1, b1, a2]).toEqual(['a1', 'b1', 'a2']);
    expect(order.indexOf('a2:start')).toBeGreaterThan(order.indexOf('a1:end')); // same key: strictly after
    expect(order.indexOf('b1:end')).toBeLessThan(order.indexOf('a1:end')); // other key: not blocked
  });

  it('keeps the chain alive after a failing task', async () => {
    const locks = new SessionLocks();
    await expect(locks.run('A', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(locks.run('A', async () => 'ok')).resolves.toBe('ok');
  });
});

describe('SessionTtl', () => {
  it('sweeps only idle sessions and forgets them after the sweep', () => {
    const ttl = new SessionTtl();
    ttl.touch('m', 's1', 1_000);
    ttl.touch('m', 's2', 5_000);
    const expired = ttl.sweep(3_000, 6_000);
    expect(expired).toEqual([{ model: 'm', sessionId: 's1', lastSeen: 1_000 }]);
    expect(ttl.sweep(3_000, 6_000)).toEqual([]); // s1 gone, s2 still fresh
  });
});
