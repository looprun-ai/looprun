/** A subject written wrong on purpose: one defect for every verb the gate composes, so the gate's
 *  list over this directory has one row per verb and a verb the gate drops takes its row with it.
 *  The gate PARSES the guards and the disclosure out of this source and DERIVES the acts from the
 *  world card, so the helpers here only have to carry the shapes a reader meets on a real card.
 *
 *  The one defect this directory cannot carry is a retired identifier: the tree-wide name gate
 *  walks every file under packages/, fixtures included, so a retired name checked in here would
 *  fail the tree. That verb is proved on a directory written at run time. */
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
  deny: held => holds(held) ? null : 'the order is not in a state this act reads'
});

/** purity: a subject carries no regex — patterns live in the engine catalog. */
export const orderIdShape = /^ord_[0-9]+$/;

/** 'openOrder' creates a record, so it names no target argument and acts on no existing row. */
export const ordersWorld = world({
  records: { orders: { ord_7: { status: 'OPEN', total: 120 } } },
  reads: { getOrder: { form: 'get', entity: 'orders', label: 'Look up an order' } },
  writes: { refundOrder: { form: 'set', entity: 'orders', label: 'Refund an order' },
            openOrder: { form: 'make', entity: 'orders', label: 'Open an order' } },
  destructive: { deleteOrder: { form: 'remove', entity: 'orders', label: 'Delete an order' },
                 purgeOrder: { form: 'remove', entity: 'orders', label: 'Purge an order' } },
  presets: { quiet: [{ entity: 'orders', id: 'ord_7', set: { status: 'CLOSED' } }] }
});

/** conductComplete: two desks teach a law the third never reads.
 *  unlicensed: neither rule claims a reason, and no WHY map names one. */
export const ordersDesk = {
  name: 'ordersDesk',
  persona: 'You are the orders desk.',
  guards: [prose('answerFromTheRecord', 'Every figure you state comes from a read on this turn.')]
};

export const refundsDesk = {
  name: 'refundsDesk',
  persona: 'You are the refunds desk.',
  guards: [prose('answerFromTheRecord', 'Every figure you state comes from a read on this turn.')]
};

/** floorRedeclared: 'confirmFirst' is a guard the engine installs itself. */
export const returnsDesk = {
  name: 'returnsDesk',
  persona: 'You are the returns desk.',
  guards: [prose('confirmFirst', 'Ask before you act.')]
};

export const ordersContract = {
  name: 'orders',
  guards: [
    // pairing: a contract rule about an act nothing refuses.
    prose('refundFromTheRecord', 'A refund lands on the order the read returned.', ['refundOrder']),
    // overWide: two acts, one sentence, and no WIDE map naming why.
    prose('sameCareEitherWay', 'State what changed before you answer.', ['refundOrder', 'openOrder']),
    // inertChecks: 'openOrder' creates the record, so `record` is null on every call and this
    // test always passes.
    precondition('openOrder', ({ record }) => record !== null)
  ],
  disclosure: {
    // destructiveDisclosed: a destructive act with no 'before' asks with only its own label.
    // capPaths: the cap is rooted on the read's tool name instead of the alias needs declares.
    // unspokenChecks: the cap refuses at a figure and no sentence on this card states the ceiling.
    deleteOrder: {
      needs: { order: { tool: 'getOrder' } },
      cap: { at: 'getOrder.total', ceiling: 500 }
    },
    // destructiveDisclosed: the consent question a case actually renders, written entirely out of
    // the author's own words — no figure off the held call, none off a read.
    purgeOrder: {
      before: 'This cannot be undone.'
    }
    // requiredReadsDisclosed: 'getOrder' is a read a case requires, and nothing here speaks what
    // it returned.
  }
};
