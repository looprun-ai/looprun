/**
 * evals/cases.ts — the generated atlas eval set (Stage G3; debate-validated, one bucket file per
 * agent, merged here). Provenance + debate verdicts: EVALS-at-*.md (per bucket) and EVALS.md
 * (the merged sweep) — both in this evals/ directory.
 *
 * INDEPENDENCE: these cases were authored from tools.json + WORLD-MODEL.md + src/world/presets.ts
 * ONLY — never from the drafted specs. Boundary-biased across the dimension axes (happy path, gate
 * boundary, destructive protocol, honesty/fabrication, state visibility, scope boundary,
 * language/format, UNCHECKABLE-rule sweep).
 *
 * Bucket id ranges: at-rentals 01–12 · at-billing 21–32 · at-claims 41–52 · at-inventory 61–72 ·
 * at-admin 81–93 (93 = the post-E2 UNCHECKABLE sweep addition, sole-owner protection). 61 cases.
 */
import type { EvalCase } from '@looprun-ai/eval';
import { ATLAS_CASES_AT_RENTALS } from './cases-at-rentals.js';
import { ATLAS_CASES_AT_BILLING } from './cases-at-billing.js';
import { ATLAS_CASES_AT_CLAIMS } from './cases-at-claims.js';
import { ATLAS_CASES_AT_INVENTORY } from './cases-at-inventory.js';
import { ATLAS_CASES_AT_ADMIN } from './cases-at-admin.js';

export const CASES: EvalCase[] = [
  ...ATLAS_CASES_AT_RENTALS,
  ...ATLAS_CASES_AT_BILLING,
  ...ATLAS_CASES_AT_CLAIMS,
  ...ATLAS_CASES_AT_INVENTORY,
  ...ATLAS_CASES_AT_ADMIN,
];

/** agent-id → case ids (the "user picks the agent" classifier). Every case exactly once. */
export const CASE_MAP: Record<string, string[]> = {
  'at-rentals': [
    '01-book-availability-happy',
    '02-dispatch-technician-happy',
    '03-frozen-asset-booking-denied',
    '04-at-cap-booking-denied',
    '05-past-date-booking-denied',
    '06-reschedule-conflict-then-allow',
    '07-cancel-two-step-confirmed',
    '08-cancel-impatient-still-confirms',
    '09-nonexistent-booking-id',
    '10-checked-out-cannot-cancel',
    '11-checkin-defers-deposit-release',
    '12-garbled-one-clarifying-question',
  ],
  'at-billing': [
    '21-quote-numeric-fidelity',
    '22-invoice-generate-then-pay',
    '23-release-deposit-open-claim-deny',
    '24-release-deposit-no-claim-allow',
    '25-refund-above-cap-deny',
    '26-account-frozen-blocks-refund',
    '27-low-deposit-shortfall-surfaced',
    '28-pay-voided-invoice-deny',
    '29-limited-permission-payinvoice-denied',
    '30-impatient-two-money-moves-one-turn',
    '31-quote-total-none-exists',
    '32-garbled-amount-one-question',
  ],
  'at-claims': [
    '41-file-claim-add-evidence',
    '42-policy-lookup-grounded',
    '43-policy-no-fabricated-waiver',
    '44-release-hold-open-claim-deny',
    '45-release-standalone-legal-hold-confirmed',
    '46-resolve-claim-approve-confirmed',
    '47-place-hold-acts-directly',
    '48-impatient-release-still-two-step',
    '49-nonexistent-claim-not-fabricated',
    '50-refund-out-of-scope-defer-billing',
    '51-pii-minimal-disclosure',
    '52-garbled-one-question',
  ],
  'at-inventory': [
    '61-register-asset-happy',
    '62-schedule-then-complete-maintenance',
    '63-update-asset-condition',
    '64-retire-frozen-deny-sibling-allow',
    '65-transfer-reserved-asset-deny',
    '66-complete-maintenance-nothing-scheduled',
    '67-limited-permission-fleet-write-denied',
    '68-retire-probe-then-confirm',
    '69-retire-impatient-still-two-step',
    '70-retire-and-transfer-same-turn',
    '71-contradicted-maintenance-and-nonexistent-id',
    '72-scope-defer-and-garbled-recovery',
  ],
  'at-admin': [
    '81-invite-member-happy',
    '82-update-member-role-happy',
    '83-plan-usage-report',
    '84-invite-at-seat-cap-deny',
    '85-changeplan-non-owner-denied',
    '86-removemember-dispatcher-denied',
    '87-removemember-confirm-flow',
    '88-removemember-impatient-oneshot',
    '89-usage-numbers-fabrication',
    '90-garbled-member-recovery',
    '91-tenant-isolation-foreign-workspace',
    '92-scope-boundary-refund-defer',
    '93-remove-sole-owner-protected',
  ],
};
