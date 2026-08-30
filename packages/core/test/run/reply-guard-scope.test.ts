/** A reply-phase guard declaring a tool binds to it: the rule runs only on a turn
 *  whose acts touched that tool. A tool-less reply guard runs on every reply. */
import { expect, test } from 'vitest';
import type { Act, ReplyCtx } from '../../src/contract/vocabulary.js';
import type { CompiledAgent, CompiledGuard } from '../../src/cards/cards.js';
import { Rulebook } from '../../src/run/rulebook.js';

function guard(name: string, tools: readonly string[]): CompiledGuard {
  return { name, rule: 'Never say pineapple.', home: 'contract', on: 'reply', tools: [...tools],
    kind: 'custom', judged: false, installedBecause: 'declared on the contract card',
    deny: ctx => (ctx as ReplyCtx).message.includes('pineapple') ? 'said pineapple' : null };
}

function compiled(guards: readonly CompiledGuard[]): CompiledAgent {
  return { guards, facts: { tools: {} } } as unknown as CompiledAgent;
}

function replyCtx(message: string, tools: readonly string[]): ReplyCtx {
  const acts = tools.map(t => ({ call: { tool: t, args: {}, key: t }, effect: 'read',
    status: 'done', result: {}, sentence: `${t}() — done` })) as unknown as Act[];
  return { message, report: [], userText: '', turnActs: acts, pastActs: [] };
}

test('a tool-scoped reply guard stays silent on a turn that never touched its tool', () => {
  const book = new Rulebook(compiled([guard('noPineapple', ['issueRefund'])]));
  expect(book.checkReply(replyCtx('pineapple for all', ['listStaff']))).toEqual([]);
});

test('the same guard fires when the turn acted on its tool', () => {
  const book = new Rulebook(compiled([guard('noPineapple', ['issueRefund'])]));
  expect(book.checkReply(replyCtx('pineapple for all', ['issueRefund'])))
    .toEqual([{ guardName: 'noPineapple', detail: 'said pineapple' }]);
});

test('a tool-less reply guard runs on every reply', () => {
  const book = new Rulebook(compiled([guard('noPineapple', [])]));
  expect(book.checkReply(replyCtx('pineapple for all', ['listStaff'])))
    .toEqual([{ guardName: 'noPineapple', detail: 'said pineapple' }]);
});
