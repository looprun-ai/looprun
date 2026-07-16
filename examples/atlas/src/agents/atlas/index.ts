/**
 * GENERATED domain bundle — atlas: the at-* AgentSpecs (each with its OWN persona — 283b4ed)
 * + the generated ATLAS_THEME (business-common skin — NO persona).
 */
import type { AgentSpec, TrunkTheme } from 'looprun';
import atRentals from './at-rentals-spec.js';
import atBilling from './at-billing-spec.js';
import atClaims from './at-claims-spec.js';
import atInventory from './at-inventory-spec.js';
import atAdmin from './at-admin-spec.js';
import { ATLAS_THEME } from './theme.js';

export const SPECS: Record<string, AgentSpec> = {
  'at-rentals': atRentals,
  'at-billing': atBilling,
  'at-claims': atClaims,
  'at-inventory': atInventory,
  'at-admin': atAdmin,
};

export const THEME: TrunkTheme = ATLAS_THEME;
