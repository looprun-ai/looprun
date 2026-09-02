/** The act-log shape is machinery, and `brokenReply` refuses a delivery carrying it:
 *  a call with its dash-status (`name(args) — done`) or the completed prefix
 *  (`Completed: name.`). Naming a tool in a sentence is speech and passes. The samples
 *  are real delivered replies, quoted verbatim as the measured object. */
import { test, expect } from 'vitest';
import type { ReplyCtx } from '../../src/contract/vocabulary.js';
import { brokenReply } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);

function replyCtx(message: string): ReplyCtx {
  return { message, report: [], userText: '', turnActs: [], pastActs: [] };
}

const LEAKED: readonly string[] = [
  'Completed: getMember.\nupdateMemberRole(mem_1001) — not-done\ngetMember() — done. Dana '
    + 'Okafor (mem_1001) is recorded as owner.\nremoveMember(mem_1001) — not-done (awaiting '
    + 'approval) [101472]',
  'Sam Whitfield has been promoted from billing to owner, and the records now reflect that '
    + 'change. updateMemberRole(mem_1004) — done (already ran; first result restated). '
    + 'mem_1004 moves from billing to owner.',
  'Completed: getWorkspace, getMember, getPlanUsage. getWorkspace() — done getMember() — '
    + 'done. Dana Okafor (mem_1001) is recorded as owner. getPlanUsage() — done. The fleet '
    + 'tier: 6 of 15 seats and 2 of 40 active bookings are in use.',
  'The request 428731 was already processed, and the workspace is now on the enterprise '
    + 'tier. updateMemberRole(mem_1001) — not-done'
];

const CLEAN: readonly string[] = [
  'I cannot charge a $5,000 deposit hold on bk_1001. The starter tier caps the deposit money '
    + 'this workspace holds at once at 10,000, 9,500 of that float is already held across the '
    + 'workspace, and 500 is all that is left of it.',
  'Moving this workspace from the fleet tier to starter changes what it is billed and '
    + 'replaces its ceilings: 6 of 15 seats and 2 of 40 active bookings stand today, with '
    + '3700 of the 250000 deposit float in use.',
  'I cannot raise the invoice for booking "bk_1003" because your role is recorded as '
    + '"viewer", which does not carry the money capability. Please contact Sam Whitfield '
    + '(mem_1004), who is a billing member.',
  'The workspace is currently suspended, so I cannot update the condition of ast_excv01 on '
    + 'the registry. No new condition is recorded or queued.',
  'The booking "bk_1001" is currently in "confirmed" status and has not yet been checked '
    + 'out. Handing the machine over to the customer must be the first step.',
  'The maintenance record for "ast_genr01" shows a "hydraulic service" scheduled from '
    + '"2026-07-05" to "2026-07-12". Since the work is finished, please provide the condition '
    + 'grade (excellent, good, fair, poor, or damaged) so I can return "ast_genr01" to service.',
  'ast_genr01 has been returned to service in good condition, and its annual service has '
    + 'been scheduled for 2026-08-03 to 2026-08-07.',
  'I have the request to promote Sam Whitfield (mem_1004) to owner held for your approval. '
    + 'To proceed, please send the approval code 155696.',
  'The hold_6001 is currently held awaiting your confirmation. Lifting this compliance '
    + 'freeze, which is recorded as "annual safety inspection overdue" at the asset scope, '
    + 'will allow everything it was blocking to run again.',
  'The security deposit of 3000 has been successfully charged for booking bk_1001. The full '
    + 'required amount of 3000 is now held.',
  'The updateMemberRole operation is complete: Sam Whitfield is an owner now.',
  'Calling checkAvailability(first) is the step that would come before booking.'
];

test('brokenReply refuses every reply carrying the act-log shape', () => {
  const g = brokenReply().compile('engine', FACTS);
  for (const text of LEAKED) {
    expect(g.deny(replyCtx(text)), `not refused: ${text.slice(0, 60)}`).not.toBeNull();
  }
});

test('brokenReply passes every clean reply — naming a tool in a sentence is speech', () => {
  const g = brokenReply().compile('engine', FACTS);
  for (const text of CLEAN) {
    expect(g.deny(replyCtx(text)), `wrongly refused: ${text.slice(0, 60)}`).toBeNull();
  }
});

const JSON_LEAKED: readonly string[] = [
  'O registro indica que existe um "openClaimId": "clm_3001" pendente para esta locação, além '
    + 'de um "activeHolds": [{"holdId": "hold_6004"}].',
  'The read returned "depositFloatRemaining": 500 for this workspace.'
];

test('brokenReply refuses a reply pasting record JSON — a quoted key with its colon', () => {
  const g = brokenReply().compile('engine', FACTS);
  for (const text of JSON_LEAKED) {
    expect(g.deny(replyCtx(text)), `not refused: ${text.slice(0, 60)}`).not.toBeNull();
  }
  expect(g.deny(replyCtx('The booking is in "confirmed" status: nothing went out.'))).toBeNull();
});

function replyCtxWithResult(message: string, result: unknown): ReplyCtx {
  return { message, report: [], userText: '',
    turnActs: [{ call: { tool: 'getPlanUsage', args: {}, key: 'k' }, status: 'done',
      effect: 'read', sentence: 'getPlanUsage() — done', owed: null,
      result } as never], pastActs: [] };
}

test('brokenReply refuses a camel-shaped read key spoken as a token', () => {
  const g = brokenReply().compile('engine', FACTS);
  const usage = { plan: 'starter', depositFloatLimit: 10000, depositFloatRemaining: 500 };
  expect(g.deny(replyCtxWithResult(
    'O registro indica que o depositFloatLimit é 10,000 e o depositFloatRemaining é 500.',
    usage))).toContain('depositFloatLimit');
  expect(g.deny(replyCtxWithResult(
    'The starter tier caps the float at 10,000, and 500 is all that is left of it.',
    usage))).toBeNull();
  // A single-word key is speech, never machinery: "plan" stays sayable.
  expect(g.deny(replyCtxWithResult('The plan is starter.', usage))).toBeNull();
});
