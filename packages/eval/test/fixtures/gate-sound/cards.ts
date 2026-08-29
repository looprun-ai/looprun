/** The sound sibling of gate-broken, and it is sound the hard way: it declares the same shapes the
 *  broken one gets wrong, so every verb walks a populated list here and clears it. Two desks that
 *  teach the SAME conduct law, a contract rule licensed by WHY over an act a check refuses, a
 *  precondition over an act that carries a record, a destructive act whose disclosure opens with
 *  the words the consent question renders, and a cap rooted on the alias needs declares. */
import { world } from '@looprun-ai/core';

interface Held { readonly record: { readonly status: string } | null }

interface Rule { readonly name: string; readonly rule: string; readonly on: string;
                 readonly tool?: readonly string[] }

interface Check { readonly name: string; readonly tool: readonly string[];
                  readonly deny: (held: Held) => string | null }

const prose = (name: string, rule: string, tool?: readonly string[]): Rule =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };

const precondition = (tool: string, holds: (held: Held) => boolean): Check => ({
  name: `precondition:${tool}`, tool: [tool],
  deny: held => holds(held) ? null : 'the order is not open, so it cannot be closed'
});

/** The gated act runs only after the prerequisite succeeded — the shape the engine's own factory
 *  mints, so the order a case requires is one the cards declare. */
const onlyAfter = (tool: string, prerequisite: string): Check => ({
  name: `onlyAfter:${tool}`, tool: [tool],
  deny: () => `${prerequisite} has not succeeded yet this conversation`
});

/** The six voices a house teaches at every one of its counters, each carried by the conduct law
 *  named after it. Both desks below teach all six. */
const VOICES = ['declareHonestly', 'oneQuestion', 'yourLaneYourReads', 'recordsOverAssertions',
                'askBeforeYouChoose', 'nameItDoNotPassItOn'];

const conduct = (taught: readonly string[]): readonly Rule[] =>
  taught.map(voice => prose(voice, `The ${voice} law, in this house's own words.`));

/** The reason each prose-only rule exists: one of noSuchAct, aboutARead, conduct, seam,
 *  measured:<case>. */
export const WHY = {
  answerFromTheRecord: 'conduct',
  closeOnlyWhatYouRead: 'aboutARead',
  'seam:closeOrder:stateIs:status': 'seam'
};

export const ordersWorld = world({
  records: { orders: { ord_7: { status: 'OPEN', total: 120 } } },
  reads: { getOrder: { form: 'get', entity: 'orders', label: 'Look up an order' } },
  writes: { closeOrder: { form: 'set', entity: 'orders', label: 'Close an order',
                          gates: [{ kind: 'stateIs', field: 'status', value: 'OPEN' }] } },
  destructive: { deleteOrder: { form: 'remove', entity: 'orders', label: 'Delete an order' } }
});

/** Both desks teach the same conduct laws, in the same words: a law on one desk and not the other
 *  is a desk that never learns it. */
export const ordersDesk = {
  name: 'ordersDesk',
  persona: 'You are the orders desk.',
  guards: [...conduct(VOICES),
           prose('answerFromTheRecord', 'Every figure you state comes from a read on this turn.'),
           // The law the operator hears around the refusal the WORLD spells out on this act. It
           // is read by the desk that can make the call, and by no other.
           prose('seam:closeOrder:stateIs:status',
             'An order that is not open cannot be closed: say which status the read returned, '
             + 'and what would have to happen to it first.')]
};

export const returnsDesk = {
  name: 'returnsDesk',
  persona: 'You are the returns desk.',
  guards: [...conduct(VOICES),
           prose('answerFromTheRecord', 'Every figure you state comes from a read on this turn.')]
};

export const ordersContract = {
  name: 'orders',
  guards: [
    prose('closeOnlyWhatYouRead', 'A close lands on the order the read returned.', ['closeOrder']),
    precondition('closeOrder', ({ record }) => record?.status === 'OPEN'),
    onlyAfter('closeOrder', 'getOrder'),
    // The ceiling the cap refuses at, said in the words the desk reads before it proposes the
    // call: a check that decides carries its own law, so nothing here is a prose rule.
    { name: 'deleteWhatTheReadReturned', on: 'preTool', tool: ['deleteOrder'],
      rule: 'An order is deleted only once a read has returned it, and never above the total that '
        + 'read shows — over the ceiling, state the figure and delete nothing.',
      deny: (held: Held) => held.record === null ? 'no read returned this order' : null }
  ],
  disclosure: {
    getOrder: {
      after: 'Order {result.id} is {result.status} and carries a total of {result.total}.'
    },
    closeOrder: {
      after: 'Order {result.id} is {result.status}: nothing more can be added to it.'
    },
    deleteOrder: {
      before: 'You are about to delete order {order.id}, and a deletion cannot be undone.',
      after: 'Order {result.removed} is gone, and there is nothing left to reverse.',
      needs: { order: { tool: 'getOrder' } },
      cap: { at: 'order.total', ceiling: 500 }
    }
  }
};
