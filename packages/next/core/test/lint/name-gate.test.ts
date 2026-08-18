import { test, expect } from 'vitest';
import ts from 'typescript';
import { sourceFiles } from './walk.js';

/** The §11 rename register: every retired identifier is a build failure anywhere in
 *  packages/next. Whole-identifier matching over real code identifiers — string
 *  literals and comments never trip the gate, so this register lists itself safely.
 *  Register rows that ban a field-in-context only (AgentSpec.mode, the world-audit
 *  outcome) are enforced by the field's absence from the types, not by token scan. */
const BANNED = new Set([
  'say', 'view', 'CallView', 'ReplyView', 'InstalledRule', 'ruleName',
  'intake', 'IntakeGate', 'IntakeTool', 'CertifiedIntake', 'intakeFromWorld',
  'toolDefs', 'expectedSurfaceHash', 'volatile', 'requiresBefore', 'readFirst',
  'forbidThisTurn', 'neverCall', 'consentRequired', 'resultInvariant',
  'destructiveThrottle', 'degenerationGuard', 'jargonScrub', 'llmCheck',
  'llmCheckLie', 'ask', 'control', 'ControlStrip', 'controlCompile',
  'stateView', 'modelParams', 'terminalProtocol', 'stopOnRepeatedToolCall',
  'redrives', 'tookEffect', 'effectInferred', 'probe', 'dryRun', 'preview',
  'sampling', 'Sampling', 'internal'
]);

test('no retired identifier from the rename register exists in the tree', () => {
  const hits: string[] = [];
  for (const f of sourceFiles()) {
    const sf = ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && BANNED.has(node.text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push(`${f.rel}:${line + 1} — ${node.text}`);
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  expect(hits).toEqual([]);
});
