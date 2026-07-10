/**
 * @looprun-ai/core — spec validation (the library-side spec laws).
 *
 * `validateSpec` returns warnings instead of throwing: a host decides strictness (LoopRunAgent's
 * `strict: true` throws on any warning). Hard invariants (terminal tools in the surface, empty
 * persona) already throw in the AgentSpec constructor.
 */
import type { AgentSpec } from './spec.js';

export const MAX_TOOL_SURFACE = 15;

export interface SpecWarning {
  code: 'tool-surface-over-15' | 'empty-behavior' | 'duplicate-tools' | 'flow-tool-missing';
  message: string;
}

export function validateSpec(spec: AgentSpec): SpecWarning[] {
  const warnings: SpecWarning[] = [];

  if (spec.surface.tools.length > MAX_TOOL_SURFACE) {
    warnings.push({
      code: 'tool-surface-over-15',
      message:
        `AgentSpec "${spec.id}": ${spec.surface.tools.length} tools exceed the ≤${MAX_TOOL_SURFACE} surface law — ` +
        'split the agent by TOOL-NEED (never by user intent).',
    });
  }

  const seen = new Set<string>();
  const dups = spec.surface.tools.filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
  if (dups.length) {
    warnings.push({
      code: 'duplicate-tools',
      message: `AgentSpec "${spec.id}": duplicate tools in the surface: ${[...new Set(dups)].join(', ')}.`,
    });
  }

  if (!spec.behavior.length) {
    warnings.push({
      code: 'empty-behavior',
      message: `AgentSpec "${spec.id}": no behavior bullets — the persona alone rarely covers the agent's jobs.`,
    });
  }

  const surface = new Set(spec.surface.tools);
  const flowTools = spec.flow.flatMap((e) => [e.from, e.to]);
  const missing = [...new Set(flowTools.filter((t) => !surface.has(t)))];
  if (missing.length) {
    warnings.push({
      code: 'flow-tool-missing',
      message: `AgentSpec "${spec.id}": flow references tools outside the surface: ${missing.join(', ')}.`,
    });
  }

  return warnings;
}
