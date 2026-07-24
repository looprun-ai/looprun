/** Toy fixture subject — a small member library front desk. Self-contained: no external data. */
import { AgentSpecBase } from '@looprun-ai/core';
import type { AgentSpec, AgentWorld, DomainContract } from '@looprun-ai/core';

export const CONTRACT: DomainContract = {
  voice:
    'You are the assistant of the Toy Library, a small member library. You help members find and ' +
    'reserve reading rooms, register visitors at the front desk, and answer billing questions about ' +
    'membership invoices. You are precise, friendly and concise, and you always ground every answer ' +
    'in what the tools actually returned.',
  stateBlock: (world: AgentWorld) => `## Account state\n- open bookings: ${world.bookingCount ?? 0}`,
  coreInvariants: [
    'Never invent members, rooms or bookings — only report what a tool returned.',
    'Never reserve a room for a member you could not find.',
  ],
  languageClause: '## Output language (ABSOLUTE)\nReply in the language the user wrote in.',
};

const frontDesk: AgentSpec = new AgentSpecBase({
  id: 'front-desk',
  mode: 'FRONT_DESK',
  persona: 'You are the front-desk agent: room reservations and visitor registration.',
  tools: ['lookupMember', 'listRooms', 'reserveRoom', 'registerVisitor'],
  contract: CONTRACT,
});

const billing: AgentSpec = new AgentSpecBase({
  id: 'billing',
  mode: 'BILLING',
  persona: 'You are the billing agent: membership invoices only.',
  tools: ['getInvoice'],
  contract: CONTRACT,
});

export const SPECS: Record<string, AgentSpec> = { 'front-desk': frontDesk, billing };

export const CASE_AGENT: Record<string, string> = {
  '01-reserve-room-happy': 'front-desk',
  '02-unknown-member-no-fabrication': 'front-desk',
  '03-invoice-lookup': 'billing',
};
