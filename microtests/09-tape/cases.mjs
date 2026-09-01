// Microtest 9 — the scripted 24-turn desk session the four tape arms all replay.
//
// Everything an operator says, every tool result, and every act sentence is fixed here.
// Only the assistant replies come from the model. Three FACTS are planted early and are
// asked back at turn 12 and turn 22:
//
//   FIGURE   turn 2  — 118 EUR per berth-hour, agreed by the operator. It appears NOWHERE
//                      in STATE (STATE says 46), so a correct answer can only come from tape.
//   ID       turn 5  — BK-4477, returned by the create tool.
//   DECISION turn 8  — Q-04 stays free for the Marisol Trader all week.

export const TOTAL_TURNS = 24;

// The turns that cost two model calls: the call that emits the tool line, and the call
// that speaks after the tool result comes back.
export const WRITE_TURNS = new Set([5, 11, 20]);

// The two turns that ask the tape to remember.
export const MEMORY_TURNS = { 12: 'figure', 22: 'id' };

export const PLANTED = {
  figure: '118',
  id: 'BK-4477',
  decision: 'Q-04',
};

export const OPERATOR = [
  /*  1 */ 'Good morning. Which quays can take a vessel of twelve point eight metres draft today?',
  /*  2 */ 'Before anything else, note the commercial terms: for this charter we agreed a flat rate of 118 EUR per berth-hour, which overrides the published tariff. Confirm you have noted 118 EUR per berth-hour.',
  /*  3 */ 'What is the length of the Northern Gantry?',
  /*  4 */ 'Is Q-01 free tomorrow morning?',
  /*  5 */ 'Book the Northern Gantry on Q-01 from 06:00 to 14:00 tomorrow. I approve the booking.',
  /*  6 */ 'Is the Salt Harrier cleared to come alongside?',
  /*  7 */ 'How long is the waitlist on Q-02?',
  /*  8 */ 'A decision for the record: Q-04 stays free for the Marisol Trader all week. Do not book Q-04 to anyone else.',
  /*  9 */ 'What is the account balance for the Northern Gantry owner?',
  /* 10 */ 'Which quays are marked deep?',
  /* 11 */ 'Move the Northern Gantry booking to start at 08:00 instead. I approve the amendment.',
  /* 12 */ 'Remind me: what was the figure we agreed at the start of this session?',
  /* 13 */ 'Is Q-03 under maintenance?',
  /* 14 */ 'What is the credit limit on account AC-102?',
  /* 15 */ 'Can the Marisol Trader be booked today?',
  /* 16 */ 'What hours is Q-05 taken tomorrow?',
  /* 17 */ 'Which desk owns the customs hold on the Marisol Trader?',
  /* 18 */ 'What does the late cancellation fee come to?',
  /* 19 */ 'Who is second on the Q-02 waitlist?',
  /* 20 */ 'Cancel BK-4403 please. I approve the cancellation.',
  /* 21 */ 'Is the Bright Fennec short enough for Q-05?',
  /* 22 */ 'Which booking id did we open for the Northern Gantry earlier in this session?',
  /* 23 */ 'How many bookings are on Q-01 tomorrow?',
  /* 24 */ 'Give me a one-line close for the day.',
];

export const TOOL_RESULTS = {
  5: 'TOOL RESULT create_booking → { "bookingCode": "BK-4477", "vesselCode": "VS-1002", "quayCode": "Q-01", "startHour": 6, "endHour": 14, "status": "confirmed" }',
  11: 'TOOL RESULT amend_booking → { "bookingCode": "BK-4477", "startHour": 8, "endHour": 14 }',
  20: 'TOOL RESULT cancel_booking → { "bookingCode": "BK-4403", "feeApplied": 0 }',
};

// The record lines the engine appends to an assistant message: what ran on that turn.
// These are the bytes the window-2 rewrite strips off older turns.
export const ACTS = {
  1: ['ACT read_quay {"quayCode":"Q-01"} — ran, returned lengthM 240, deep true.'],
  2: [],
  3: ['ACT read_vessel {"vesselCode":"VS-1002"} — ran, returned lengthM 232, draftM 12.8.'],
  4: ['ACT list_bookings_for_quay {"quayCode":"Q-01","day":"2026-09-15"} — ran, returned 0 rows.'],
  5: [
    'ACT create_booking {"vesselCode":"VS-1002","quayCode":"Q-01","startHour":6,"endHour":14} — ran, returned bookingCode BK-4477.',
  ],
  6: ['ACT read_vessel {"vesselCode":"VS-1003"} — ran, returned clearance held.'],
  7: ['ACT read_waitlist {"quayCode":"Q-02","day":"2026-09-14"} — ran, returned 2 entries.'],
  8: [],
  9: ['ACT read_account {"accountCode":"AC-102"} — ran, returned balance 1517.'],
  10: ['ACT read_quay {"quayCode":"Q-04"} — ran, returned deep true.'],
  11: ['ACT amend_booking {"bookingCode":"BK-4477","startHour":8,"endHour":14} — ran, returned startHour 8.'],
  12: [],
  13: ['ACT read_quay {"quayCode":"Q-03"} — ran, returned underMaintenance true.'],
  14: ['ACT read_account {"accountCode":"AC-102"} — ran, returned creditLimit 5500.'],
  15: ['ACT read_vessel {"vesselCode":"VS-1004"} — refused, vessel not in STATE.vessels.'],
  16: ['ACT list_bookings_for_quay {"quayCode":"Q-05","day":"2026-09-15"} — ran, returned 1 row.'],
  17: [],
  18: ['ACT read_tariff {"tariffKey":"cancel.late"} — ran, returned amount 380.'],
  19: ['ACT read_waitlist {"quayCode":"Q-02","day":"2026-09-14"} — ran, returned VS-1005, VS-1006.'],
  20: ['ACT cancel_booking {"bookingCode":"BK-4403"} — ran, returned feeApplied 0.'],
  21: ['ACT read_vessel {"vesselCode":"VS-1005"} — ran, returned lengthM 88.'],
  22: [],
  23: ['ACT list_bookings_for_quay {"quayCode":"Q-01","day":"2026-09-15"} — ran, returned 1 row.'],
  24: [],
};

// How the bookings block in STATE changes as write acts land.
export function mutate(bookings, turn) {
  if (turn === 5)
    return [
      ...bookings,
      { code: 'BK-4477', vessel: 'VS-1002', quay: 'Q-01', start: 6, end: 14, status: 'confirmed' },
    ];
  if (turn === 11) return bookings.map((b) => (b.code === 'BK-4477' ? { ...b, start: 8 } : b));
  if (turn === 20) return bookings.map((b) => (b.code === 'BK-4403' ? { ...b, status: 'cancelled' } : b));
  return bookings;
}

// ── the checkpoint summary ─────────────────────────────────────────────────────
// Written here, by the script, from what the script already knows. It is deterministic:
// no model writes it. `keepFacts:false` is arm D — the same summary with the three
// planted facts left out, which is the arm that proves the bar has teeth.
export function summaryBlock(throughTurn, keepFacts) {
  const head = [
    `SESSION SUMMARY — turns 1 to ${throughTurn} of this conversation, compacted.`,
    '',
    'This block replaces the turns it names. It is history, not STATE. Treat every line',
    'below as something the operator and this desk established earlier in this same session.',
    '',
  ];
  const withFacts = [
    'Established facts from the compacted turns:',
    '- Commercial terms: the operator and this desk agreed a flat rate of 118 EUR per berth-hour',
    '  for this charter, and that rate overrides the published tariff.',
    '- Open booking: BK-4477, the Northern Gantry (VS-1002) on Q-01, created in the compacted turns.',
    '- Standing decision: Q-04 stays free for the Marisol Trader all week and is booked to nobody else.',
    '',
    'Also covered in the compacted turns: quay depth and length questions, the Salt Harrier',
    'clearance state, the Q-02 waitlist length, and account balance questions.',
  ];
  const withoutFacts = [
    'What the compacted turns covered:',
    '- Commercial terms for the charter were discussed and settled.',
    '- A berth booking was created for the Northern Gantry and later amended.',
    '- A standing decision was recorded about quay availability for the week.',
    '',
    'Also covered in the compacted turns: quay depth and length questions, the Salt Harrier',
    'clearance state, the Q-02 waitlist length, and account balance questions.',
  ];
  return [...head, ...(keepFacts ? withFacts : withoutFacts), ''].join('\n');
}

// Compaction schedule: a checkpoint fires at the END of turn 8 and turn 16; each one
// replaces every turn older than the last four with one summary block.
export const CHECKPOINTS = [8, 16];
export const KEEP_LIVE = 4;

export function checkpointFor(turnBeingBuilt) {
  let cp = 0;
  for (const c of CHECKPOINTS) if (turnBeingBuilt > c) cp = c;
  return cp;
}
