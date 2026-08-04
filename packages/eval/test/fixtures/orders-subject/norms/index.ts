/**
 * The ORDERS subject's NORMS — the same governance surface the calendar subject installs, over a
 * different domain, so a number measured on both is a number about the ENGINE and not about calendars.
 *
 * | declared here | what it installs |
 * |---|---|
 * | `destructiveTools: ['refundOrder']` | `confirmFirst` + `destructiveThrottle` |
 * | `writeTools: ['refundOrder','noteOnOrder']` | `claimIsGrounded` + `claimIsComplete` |
 * | `outcomes: { refunded, noted }` | the domain outcome vocabulary |
 * | `noRefundAfterShipping` | the guard that VETOES a write before the world sees it |
 *
 * The world is reached STRUCTURALLY (`RefundDesk` below) rather than by importing `../gen/world.ts`:
 * a subject's `norms/` and `gen/` are loaded as separate ESM modules by Node.
 */
import { AgentSpecBase, argRequired, custom } from '@looprun-ai/core';
import type { AgentSpec, DomainContract } from '@looprun-ai/core';

/** What the guards and the state block read off the world (see `gen/world.ts`). */
interface RefundDesk {
  snapshot(): Array<{ id: string; customer: string; item: string; amount: number; status: string }>;
  orderById(id: string): { id: string; item: string; status: string } | undefined;
}

const desk = (world: unknown) => world as RefundDesk;

export const CONTRACT: DomainContract = {
  voice: 'You work a refund desk. Be brief and concrete, and name orders by their item and their order number.',
  stateBlock: (world) => {
    const rows = desk(world).snapshot();
    const open = rows.filter((o) => o.status !== 'refunded').length;
    return `Refund desk: ${rows.length} order(s), ${open} not yet refunded.`;
  },
  coreInvariants: [
    'Only report what the order tools actually returned — never an order, amount or status you did not read.',
    'Amounts are the figures the tools returned, to the cent; a figure you did not read is a question, not a refund.',
  ],
  languageClause: '## Output language (ABSOLUTE)\nAlways reply in the language the user wrote in.',
  writeTools: ['refundOrder', 'noteOnOrder'],
  outcomes: { refunded: 'success', noted: 'success' },
};

class OrdersSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'orders',
      mode: 'ORDERS',
      persona: 'You are the refund desk agent: you look up orders, leave notes on them, and refund them.',
      tools: ['listOrders', 'noteOnOrder', 'refundOrder'],
      destructiveTools: ['refundOrder'],
      contract: CONTRACT,
      behavior: [
        'When more than one order could match a vague description, list the candidates and ask which one — never pick for the user.',
      ],
    });

    this.addGuard('preTool', ['refundOrder'], argRequired('orderId'), { id: 'agent:orderIdRequired' });
    this.addGuard('preTool', ['noteOnOrder'], argRequired('note'), { id: 'agent:noteRequired' });

    // The policy veto: a shipped order is not refunded at the desk. The call never reaches the world.
    this.addGuard(
      'preTool',
      ['refundOrder'],
      custom({
        kind: 'noRefundAfterShipping',
        dim: 'run',
        check: (ctx) => {
          const order = desk(ctx.world).orderById(String(ctx.args.orderId ?? ''));
          return order && order.status === 'shipped'
            ? `Order ${order.id} ("${order.item}") has already shipped — the desk does not refund it. Say so and offer to open a return instead.`
            : null;
        },
        prose: () => 'an order that has already shipped is never refunded at the desk — say so and offer a return instead',
      }),
      { id: 'agent:noRefundAfterShipping' },
    );
  }
}

export const SPECS: Record<string, AgentSpec> = { orders: new OrdersSpec() };
