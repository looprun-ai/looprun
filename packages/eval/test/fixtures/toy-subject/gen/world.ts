/** Deterministic fixture world. Preset 'default' = empty day; 'booked' = one existing booking. */
import type { AgentWorld } from '@looprun-ai/core';

interface WorldCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  tookEffect?: boolean;
}

const MEMBERS: Record<string, { id: string; name: string }> = {
  'ana souza': { id: 'mem_ana', name: 'Ana Souza' },
};

export class ToyWorld implements AgentWorld {
  toolCalls: WorldCall[] = [];
  sseActions: unknown[] = [];
  bookingCount: number;
  [k: string]: unknown;

  constructor(preset = 'default') {
    this.bookingCount = preset === 'booked' ? 1 : 0;
  }

  exec(name: string, args: Record<string, unknown>): unknown {
    if (name === 'respond') return { success: true };
    const push = (result: unknown, tookEffect: boolean) => {
      this.toolCalls.push({ name, args, result, tookEffect });
      return result;
    };
    switch (name) {
      case 'lookupMember': {
        const member = MEMBERS[String(args.query ?? '').toLowerCase()];
        return push(member ? { ok: true, member } : { ok: true, member: null }, false);
      }
      case 'listRooms':
        return push({ ok: true, rooms: [{ id: 'room_1', name: 'Reading Room 1' }] }, false);
      case 'reserveRoom': {
        const known = Object.values(MEMBERS).some((m) => m.id === args.memberId);
        if (!known) return push({ ok: false, error: 'unknown member' }, false);
        this.bookingCount += 1;
        return push({ ok: true, bookingId: `bk_${this.bookingCount}` }, true);
      }
      case 'registerVisitor':
        return push({ ok: true, visitorId: 'vis_1' }, true);
      case 'getInvoice':
        return push({ ok: true, invoice: { id: 'inv_1', amount: 42 } }, false);
      default:
        return push({ ok: false, error: `unknown tool ${name}` }, false);
    }
  }

  advanceTurn(): void {}

  ingestAttachment(): string {
    return 'att_1';
  }
}
