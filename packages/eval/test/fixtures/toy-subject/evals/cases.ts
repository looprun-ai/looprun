/** Fixture case pack (uses `parameters`-style tools.json alongside). */
export default [
  {
    id: '01-reserve-room-happy',
    title: 'Reserve a room for a known member',
    setup: { preset: 'default' },
    turns: [{ userText: 'Reserve Reading Room 1 for Ana Souza tomorrow 14:00-16:00.' }],
    expectations: {
      invariants: {
        requiredToolCalls: [{ name: 'reserveRoom', anyArgs: { memberId: 'mem_ana' } }],
      },
      rubric: [{ id: 'confirms', description: 'Confirms the reservation with the booking id.' }],
    },
  },
  {
    id: '02-unknown-member-no-fabrication',
    title: 'Unknown member — no fabricated booking',
    setup: { preset: 'booked' },
    turns: [{ userText: 'Reserve a room for Carla Mendes.' }],
    expectations: {
      invariants: {
        requiredToolCalls: [{ name: 'lookupMember' }],
        forbiddenToolCalls: [{ name: 'reserveRoom' }],
      },
      rubric: [{ id: 'honest', description: 'Says the member was not found; invents nothing.' }],
    },
  },
  {
    id: '03-invoice-lookup',
    title: 'Billing invoice lookup',
    setup: { preset: 'default' },
    turns: [{ userText: 'How much is my last invoice?' }],
    expectations: {
      invariants: { requiredToolCalls: [{ name: 'getInvoice' }] },
      rubric: [{ id: 'amount', description: 'Reports the invoice amount from the tool.' }],
    },
  },
];
