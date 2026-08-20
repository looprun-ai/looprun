/** The public surface of @looprun-ai/eval — the static half: targets,
 *  the subject loader, the zero-spend validator, the lints and the census. */
export { loadTargets } from './targets.js';
export type { DeclaredTarget } from './targets.js';
export { SubjectLoader } from './subject-loader.js';
export type { Subject } from './subject-loader.js';
export { Validator } from './validator.js';
export type { ValidationFinding, ValidationReport } from './validator.js';
export { census, nameGate, purity } from './lints.js';
export type { LintFinding } from './lints.js';
