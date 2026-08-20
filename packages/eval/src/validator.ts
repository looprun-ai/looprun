/** The offline validate — zero spend, no model touched. Schema and reference walks,
 *  the whole compile per agent (CardCheck speaks through it), world laws for EVERY
 *  preset on a fresh build, and the case-turn walk. Every finding blocks; the same
 *  blocking set at every entry point. */
import type { ApproveRef, CompiledAgent } from '@looprun-ai/core';
import { AgentFactory, CardError, factsFromWorld, WorldBuilder } from '@looprun-ai/core';
import type { Subject } from './subject-loader.js';

export interface ValidationFinding { readonly code: string; readonly sentence: string }
export interface ValidationReport { readonly findings: readonly ValidationFinding[] }

export class Validator {
  run(subject: Subject): ValidationReport {
    const findings: ValidationFinding[] = [];
    const facts = factsFromWorld(subject.world);
    const factory = new AgentFactory();
    const compiledByAgent = new Map<string, CompiledAgent>();

    for (const [name, spec] of Object.entries(subject.specs)) {
      for (const tool of spec.tools ?? []) {
        if (facts.tools[tool] === undefined) {
          findings.push({ code: 'SPEC_TOOL_UNKNOWN',
            sentence: `Spec '${name}' names tool '${tool}', which the surface does not declare.` });
        }
      }
      try {
        compiledByAgent.set(name, factory.governed(spec, subject.contract, facts));
      } catch (e: unknown) {
        if (e instanceof CardError) findings.push(...e.problems);
        else throw e;
      }
    }

    if ('card' in subject.world) {
      for (const preset of subject.presets) {
        try {
          new WorldBuilder().build(subject.world, preset);
        } catch (e: unknown) {
          if (e instanceof CardError) {
            findings.push(...e.problems.map(p => ({ code: p.code,
              sentence: `preset '${preset ?? 'base'}': ${p.sentence}` })));
          } else throw e;
        }
      }
    }

    const holdsFor = (agent: string, tool: string): boolean => {
      const compiled = compiledByAgent.get(agent);
      if (!compiled) return false;
      return compiled.guards.some(g => typeof g.hold === 'function'
        && (g.tools.length === 0 || g.tools.includes(tool)));
    };
    for (const c of subject.cases) {
      const agent = c.agent ?? Object.keys(subject.specs)[0];
      for (const turn of c.turns) {
        if (typeof turn === 'string' || 'decline' in turn) continue;
        const approve = turn.approve;
        const refs: readonly ApproveRef[] = Array.isArray(approve)
          ? approve as readonly ApproveRef[] : [approve as ApproveRef];
        for (const ref of refs) {
          if (facts.tools[ref.tool] === undefined) {
            findings.push({ code: 'CASE_APPROVE_TOOL_UNKNOWN',
              sentence: `Case '${c.id}' approves '${ref.tool}', which the surface does not declare.` });
          } else if (!holdsFor(agent, ref.tool)) {
            findings.push({ code: 'CASE_APPROVE_NOT_HELD',
              sentence: `Case '${c.id}' approves '${ref.tool}', but nothing on agent '${agent}' ever holds it.` });
          }
        }
      }
    }

    return { findings };
  }
}
