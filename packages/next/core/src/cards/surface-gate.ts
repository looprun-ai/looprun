/** Enforces the surface law at construction of a live surface: reconciliation
 *  against the live host (renamed tool, new field, changed type → throw),
 *  deny-by-default surface intersection with a STRUCTURAL exclusions report, and the
 *  certification fingerprint over a CANONICAL schema form — sorted keys, stable
 *  across validator-library versions. */
import { createHash } from 'node:crypto';
import type { Json, SurfaceFacts } from '../contract/vocabulary.js';
import { CardError } from '../contract/vocabulary.js';
import { canonicalJson } from '../contract/canonical-call.js';

export interface LiveTool { readonly name: string; readonly description: string;
                            readonly schema: Json;
                            readonly execute: (args: Readonly<Record<string, Json>>) => Promise<unknown> }
export interface SurfaceReport { readonly active: readonly string[];
                                 readonly excluded: readonly { readonly name: string;
                                                              readonly why: 'off-surface' }[] }

export class SurfaceGate {
  check(facts: SurfaceFacts, live: readonly LiveTool[], seal: string | null): SurfaceReport {
    const problems: { code: string; sentence: string }[] = [];
    const liveByName = new Map(live.map(t => [t.name, t]));
    for (const fact of Object.values(facts.tools)) {
      const hosted = liveByName.get(fact.name);
      if (hosted === undefined) {
        problems.push({ code: 'SURFACE_TOOL_MISSING',
          sentence: `Declared tool '${fact.name}' is not served by the live host.` });
        continue;
      }
      if (canonicalJson(hosted.schema) !== canonicalJson(fact.schema)) {
        problems.push({ code: 'SURFACE_DRIFT',
          sentence: `Tool '${fact.name}' drifted: the live schema differs from the declared one.` });
      }
    }
    if (seal !== null && seal !== this.fingerprint(facts)) {
      problems.push({ code: 'SURFACE_SEAL_MISMATCH',
        sentence: 'The certification seal does not match this surface — re-certify or fix the drift.' });
    }
    if (problems.length > 0) throw new CardError(problems);
    const active = Object.keys(facts.tools);
    const excluded = live.filter(t => facts.tools[t.name] === undefined)
      .map(t => ({ name: t.name, why: 'off-surface' as const }));
    return { active, excluded };
  }

  fingerprint(facts: SurfaceFacts): string {
    const rows = Object.values(facts.tools)
      .map(f => ({ effect: f.effect, name: f.name, schema: f.schema }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return createHash('sha256').update(canonicalJson(rows)).digest('hex');
  }
}
