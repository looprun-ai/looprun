/** The declarative world builder (increment 3a) — see `define-world.ts`. */
export { defineWorld } from './define-world.js';
export { compileFormula, FormulaError } from './formula.js';
export type { CompiledFormula } from './formula.js';
export type {
  WorldSpec,
  WorldFactory,
  BuiltWorld,
  WorldCall,
  AuditEntry,
  EntityDecl,
  ArgDecl,
  Gate,
  ToolDecl,
  ReadResult,
  CreateResult,
  TransitionResult,
  PresetDelta,
  DefineWorldOptions,
  CustomExecutor,
  CustomCtx,
  CustomResult,
  ScalarType,
  FieldType,
} from './types.js';
