/** The single producer of prompt bytes: byte-stable, cache-shaped — business-common
 *  blocks first, per-agent divergence as late as possible; the state block and the
 *  open questions ride the tail. Channel law: a CONTRACT tool guard's rule renders
 *  into the tool's own card; a SPEC guard's rule renders into the per-agent tail-end
 *  block of the system prefix. */
import type { Question, StateSnapshot, ToolCard } from '../contract/vocabulary.js';
import type { CompiledAgent } from '../cards/cards.js';
import { deepFreeze } from '../contract/freeze.js';

/** The model reads a schema to fill arguments. The draft-07 url, the validator's own
 *  flag and the id patterns the guards enforce answer nothing it must decide. */
function slim(schema: ToolCard['schema']): ToolCard['schema'] {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === '$schema' || k === 'additionalProperties' || k === 'pattern') continue;
      out[k] = walk(v);
    }
    return out;
  };
  return walk(schema) as ToolCard['schema'];
}

export class PromptWriter {
  private readonly compiled: CompiledAgent;
  private frozenSystem: string | null = null;
  private frozenCards: readonly ToolCard[] | null = null;

  constructor(compiled: CompiledAgent) {
    this.compiled = compiled;
  }

  /** Frozen after first render — byte-identical across turns. */
  system(): string {
    if (this.frozenSystem === null) {
      const p = this.compiled.promptParts;
      const lines: string[] = [];
      if (p.voice !== null) lines.push(p.voice);
      for (const factLine of p.facts) lines.push(`FACT: ${factLine}`);
      lines.push(p.persona);
      // The desk knows its colleagues: one line per teammate, by name.
      if (p.teammates !== null && Object.keys(p.teammates).length > 0) {
        lines.push('OTHER DESKS:');
        for (const [name, covers] of Object.entries(p.teammates)) {
          lines.push(`- ${name}: ${covers}`);
        }
      }
      const specRules = this.compiled.guards
        .filter(g => g.home === 'spec')
        .map(g => `RULE: ${g.rule}`);
      lines.push(...specRules);
      this.frozenSystem = lines.join('\n');
    }
    return this.frozenSystem;
  }

  /** One card per surface tool; does = the declared does + the tool's contract-guard rules. */
  toolCards(): readonly ToolCard[] {
    if (this.frozenCards === null) {
      const cards: ToolCard[] = [];
      for (const fact of Object.values(this.compiled.facts.tools)) {
        const guardRules = this.compiled.guards
          .filter(g => g.home === 'contract' && g.tools.includes(fact.name))
          .map(g => ` ${g.rule}`)
          .join('');
        cards.push({ name: fact.name, does: `${fact.does}${guardRules}`, schema: slim(fact.schema) });
      }
      this.frozenCards = deepFreeze(cards);
    }
    return this.frozenCards;
  }

  /** Only the tail varies across turns. */
  tail(userText: string, state: StateSnapshot | string | null, open: readonly Question[]): string {
    const parts: string[] = [];
    if (typeof state === 'string') { if (state !== '') parts.push(`STATE: ${state}`); }
    else if (state !== null) parts.push(`STATE: ${JSON.stringify(state)}`);
    for (const q of open) parts.push(`OPEN QUESTION [${q.code}]: ${q.sentence}`);
    return parts.join('\n');
  }

  correction(sentences: readonly string[]): string {
    return ['Correct the reply before finishing:', ...sentences.map(s => `- ${s}`)].join('\n');
  }
}
