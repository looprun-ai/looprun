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

/** The reason each prose-only rule exists: one of noSuchAct, aboutARead, conduct, measured:<case>. */
export const WHY = {
  answerFromTheRecord: 'conduct',
  closeOnlyWhatYouRead: 'aboutARead'
};

export const ordersWorld = world({
  records: { orders: { ord_7: { status: 'OPEN', total: 120 } } },
  reads: { getOrder: { form: 'get', entity: 'orders', label: 'Look up an order' } },
  writes: { closeOrder: { form: 'set', entity: 'orders', label: 'Close an order' } },
  destructive: { deleteOrder: { form: 'remove', entity: 'orders', label: 'Delete an order' } }
});

/** Both desks teach the same conduct law, in the same words: a law on one desk and not the other
 *  is a desk that never learns it. */
export const ordersDesk = {
  name: 'ordersDesk',
  persona: 'You are the orders desk.',
  guards: [prose('answerFromTheRecord', 'Every figure you state comes from a read on this turn.')]
};

export const returnsDesk = {
  name: 'returnsDesk',
  persona: 'You are the returns desk.',
  guards: [prose('answerFromTheRecord', 'Every figure you state comes from a read on this turn.')]
};

export const ordersContract = {
  name: 'orders',
  guards: [
    prose('closeOnlyWhatYouRead', 'A close lands on the order the read returned.', ['closeOrder']),
    precondition('closeOrder', ({ record }) => record?.status === 'OPEN')
  ],
  disclosure: {
    deleteOrder: {
      before: 'You are about to delete order {order.id}, and a deletion cannot be undone.',
      needs: { order: { tool: 'getOrder' } },
      cap: { at: 'order.total', ceiling: 500 }
    }
  }
};
