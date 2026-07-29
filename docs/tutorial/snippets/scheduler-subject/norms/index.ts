/**
 * The subject's NORMS — the governed half of the bundle: which specs the exam may route to, and
 * the domain contract they share. `loadSubject` reads exactly `SPECS`, `CONTRACT` and the optional
 * `CASE_AGENT` map from this module.
 *
 * Nothing is re-declared here: the spec and the contract are the same objects chapters 02–04 built.
 * A subject that copies its spec is a subject that certifies a copy.
 *
 * Relative imports inside a subject carry the `.ts` extension because this directory is loaded by
 * NODE (`looprun-eval` → `loadSubject` → dynamic import with type stripping), where a `.js`
 * specifier does not resolve to a `.ts` file.
 */
import type { AgentSpec, DomainContract } from 'looprun';
import { SCHEDULER_CONTRACT } from '../../scheduler/contract.ts';
import { schedulerSpec } from '../../scheduler/spec.ts';

/** agent id → spec. The key must equal `spec.id`, or the subject preflight says so. */
export const SPECS: Record<string, AgentSpec> = { scheduler: schedulerSpec };

export const CONTRACT: DomainContract = SCHEDULER_CONTRACT;

// No CASE_AGENT map: a one-spec subject routes every case to that spec (see `agentForCase`).
