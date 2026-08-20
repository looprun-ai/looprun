/** The sound sibling of gate-broken: one read, one desk, no rule a check does not carry, and no
 *  pattern. The gate's list over this directory is empty. */

export const ordersWorld = {
  records: { orders: { ord_7: { status: 'OPEN', total: 120 } } },
  reads: { getOrder: { form: 'get', entity: 'orders', label: 'Look up an order' } }
};

export const ordersDesk = {
  name: 'ordersDesk',
  persona: 'You are the orders desk. Every figure you state comes from the read on this turn.'
};
