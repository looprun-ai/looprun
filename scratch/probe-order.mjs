// Drives the compiled Rulebook over one call with a precondition beside an ask,
// on both orderings, and shows the direction each ordering fails in.
import { Rulebook } from '../packages/core/dist/run/rulebook.js';
import { precondition, choiceFromUser, confirmFirst } from '../packages/core/dist/cards/catalog.js';

const FACTS = { tools: {
  updateAssetCondition: { name: 'updateAssetCondition', label: 'Update asset condition',
                          effect: 'write', entity: 'assets', target: 'assetId' },
  releaseDeposit: { name: 'releaseDeposit', label: 'Release the deposit',
                    effect: 'destructive', entity: 'bookings', target: 'bookingId' } } };

const state = {
  assets: { ast_1: { status: 'active' } },
  workspace: { ws: { status: 'suspended' } },
  bookings: { bk_1: { status: 'returned', depositHeld: 1200 } }
};

const ctx = (tool, args) => ({
  call: { tool, args, key: `${tool}:1` }, effect: FACTS.tools[tool].effect,
  consented: false, state, userText: '', userTexts: [''], choices: {},
  turnActs: [], pastActs: []
});

const suspended = precondition('updateAssetCondition',
  ({ state: s }) => s['workspace']['ws']['status'] !== 'suspended'
    ? true : 'the workspace is suspended, and the equipment register takes no changes',
  'The equipment register takes no changes while the workspace is suspended.');
const grade = choiceFromUser('updateAssetCondition', 'condition',
  ['excellent', 'good', 'fair', 'poor', 'damaged'],
  'The condition grade is the operator’s word.');

// The author's MISTAKE, in the direction that costs money: a reading that is
// well-formed and wrong, on an act nothing should block.
const wrongKey = precondition('releaseDeposit',
  ({ record, state: s }) => s['invoices']?.[record?.['id']]?.status === 'paid'
    ? true : 'the deposit is bound to an unpaid invoice',
  'A deposit is released only once its invoice is paid.');
const consent = confirmFirst('releaseDeposit', 'Release the deposit');

const guards = (seeds) => seeds.map(g => g.compile('contract', FACTS));
const show = (label, book, c) => {
  const v = book.checkPreTool(c);
  console.log(label.padEnd(46), '|', v.kind, v.detail ?? v.sentence ?? (v.options ? `ask ${v.arg}` : ''));
};

const book = new Rulebook({ guards: guards([suspended, grade, wrongKey, consent]),
                            limits: {}, rewrites: [], facts: FACTS });
show('suspended workspace, grade is gated', book, ctx('updateAssetCondition', { assetId: 'ast_1', condition: 'fair' }));
show('a mistaken reading on a destructive act', book, ctx('releaseDeposit', { bookingId: 'bk_1' }));

// The same two calls with nothing standing in the way of the ask.
const open = new Rulebook({ guards: guards([grade, consent]), limits: {}, rewrites: [], facts: FACTS });
show('no condition declared, grade is gated', open, ctx('updateAssetCondition', { assetId: 'ast_1', condition: 'fair' }));
show('no condition declared, deposit release', open, ctx('releaseDeposit', { bookingId: 'bk_1' }));
