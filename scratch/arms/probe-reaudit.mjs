// The claims the re-audit's corrected conditions rest on, each with its own cheap test.
//  1 · the row a precondition receives is the SAME object the snapshot files under its key,
//      so the key a record arrives without is recoverable by identity;
//  2 · the stored invoice row carries paid and refunded and NOT refundable;
//  3 · the corrected refund condition licenses the partly-paid invoice the old one refused,
//      and still refuses the one with nothing left to give back.
import { Rulebook } from '../../packages/core/dist/run/rulebook.js';
import { precondition } from '../../packages/core/dist/cards/catalog.js';

const FACTS = { tools: {
  refundInvoice: { name: 'refundInvoice', label: 'pay money back on an invoice',
                   effect: 'destructive', entity: 'invoices', target: 'invoiceId' },
  sellFuel: { name: 'sellFuel', label: 'Sell fuel', effect: 'write',
              entity: 'vessels', target: 'vesselId' } } };

// harborpoint's own stored rows, verbatim from the world's records.
const state = {
  invoices: {
    inv_1: { vesselId: 'ves_2', amount: 1054, paid: 1054, balance: 0, refunded: 0, status: 'paid' },
    inv_2: { vesselId: 'ves_1', amount: 880, paid: 300, balance: 580, refunded: 0, status: 'open' },
    inv_3: { vesselId: 'ves_4', amount: 412, paid: 0, balance: 412, refunded: 0, status: 'open' }
  },
  vessels: { ves_1: { name: 'Sea Ranger' }, ves_2: { name: 'Kittiwake' } },
  holds: { hd_2: { scope: 'vessel', vesselId: 'ves_1', type: 'insurance', active: true,
                   reason: 'insurance certificate under review' } }
};

const ctx = (tool, args) => ({
  call: { tool, args, key: `${tool}:1` }, effect: FACTS.tools[tool].effect,
  consented: false, state, userText: '', userTexts: [''], choices: {},
  turnActs: [], pastActs: []
});

const run = (seed, c) => {
  const book = new Rulebook({ guards: [seed.compile('contract', FACTS)],
                              limits: {}, rewrites: [], facts: FACTS });
  const v = book.checkPreTool(c);
  return v.kind === 'refuse' ? `refuse — ${v.detail}` : v.kind;
};

// ── 1 · the key is recoverable by identity ──────────────────────────────────────
const keyProbe = precondition('sellFuel', ({ record, state: s }) => {
  const key = Object.entries(s['vessels'] ?? {}).find(([, row]) => row === record)?.[0];
  return key === undefined ? 'the row arrived without its key' : `the key is ${key}`;
}, 'probe');
console.log('1 · key by identity           ', run(keyProbe, ctx('sellFuel', { vesselId: 'ves_1' })));

// ── 2 · what the stored invoice row actually carries ────────────────────────────
const fieldProbe = precondition('refundInvoice', ({ record }) =>
  `stored fields: ${Object.keys(record ?? {}).join(', ')} | refundable is `
  + `${String(record?.['refundable'])}`, 'probe');
console.log('2 · the stored row            ', run(fieldProbe, ctx('refundInvoice', { invoiceId: 'inv_2' })));

// ── 3 · the condition I wrote against the corrected one ─────────────────────────
const written = precondition('refundInvoice', ({ record }) => record?.['status'] === 'paid',
  'Money goes back only on an invoice that was paid.');
const ownersForm = precondition('refundInvoice', ({ record }) => Number(record?.['refundable']) > 0,
  'Money goes back only while something on the invoice is still refundable.');
const corrected = precondition('refundInvoice', ({ record }) =>
  (Number(record?.['paid'] ?? 0) - Number(record?.['refunded'] ?? 0)) > 0,
  'Money goes back only while something on the invoice is still refundable.');

const drained = { ...state, invoices: { ...state.invoices,
  inv_4: { vesselId: 'ves_1', amount: 300, paid: 300, balance: 0, refunded: 300, status: 'paid' } } };
const drainedCtx = { ...ctx('refundInvoice', { invoiceId: 'inv_4' }), state: drained };
const drainedRun = (seed) => {
  const book = new Rulebook({ guards: [seed.compile('contract', FACTS)],
                              limits: {}, rewrites: [], facts: FACTS });
  return book.checkPreTool(drainedCtx).kind;
};

for (const [label, seed] of [['as written  status===paid', written],
                             ['owner form  refundable>0 ', ownersForm],
                             ['corrected   paid-refunded', corrected]]) {
  console.log(`3 · ${label} | inv_2 (300 paid, 300 back-able, world ALLOWS):`,
    run(seed, ctx('refundInvoice', { invoiceId: 'inv_2' })).split(' —')[0].padEnd(7),
    '| inv_4 (300 paid, 300 already back, world REFUSES):', drainedRun(seed));
}
