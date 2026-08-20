/** The §11 rename register: every retired identifier is a build failure anywhere in
 *  the tree and in every subject. Whole-identifier matching over real code
 *  identifiers — string literals and comments never trip the gate, so this register
 *  lists itself safely. Register rows that ban a field-in-context only are enforced
 *  by the field's absence from the types, not by token scan. */
export const RETIRED_NAMES: readonly string[] = [
  'say', 'view', 'CallView', 'ReplyView', 'InstalledRule', 'ruleName',
  'intake', 'IntakeGate', 'IntakeTool', 'CertifiedIntake', 'intakeFromWorld',
  'toolDefs', 'expectedSurfaceHash', 'volatile', 'requiresBefore', 'readFirst',
  'forbidThisTurn', 'neverCall', 'consentRequired', 'resultInvariant',
  'destructiveThrottle', 'degenerationGuard', 'jargonScrub', 'llmCheck',
  'llmCheckLie', 'ask', 'control', 'ControlStrip', 'controlCompile',
  'stateView', 'modelParams', 'terminalProtocol', 'stopOnRepeatedToolCall',
  'redrives', 'tookEffect', 'effectInferred', 'probe', 'dryRun', 'preview',
  'sampling', 'Sampling', 'internal'
];
