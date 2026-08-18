/** The declarative world vocabulary and its one validating door. A WorldCard is
 *  closed data — no functions, no regexes, no clock inside the card; custom executors
 *  pass OUTSIDE, in world()'s second argument. The sibling cards (mcpWorld/liveWorld)
 *  carry remote entries that execute elsewhere. */
import type { CustomExecutor, DeclaredWorld, LiveWorldCard, McpWorldCard, WorldCard,
              WorldToolEntry } from '../contract/vocabulary.js';
import { CardError } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';

export type { ActionForm, AuditRow, CustomExecutor, DeclaredWorld, Gate, LiveWorldCard,
              McpWorldCard, RemoteToolEntry, WorldCard, WorldToolEntry }
  from '../contract/vocabulary.js';

function entries(card: WorldCard): readonly (readonly [string, WorldToolEntry])[] {
  return [
    ...Object.entries(card.reads ?? {}),
    ...Object.entries(card.writes ?? {}),
    ...Object.entries(card.destructive ?? {})
  ];
}

/** Validates and freezes a world declaration; every problem throws at once. */
export function world(card: WorldCard,
                      executors: Readonly<Record<string, CustomExecutor>> = {}): DeclaredWorld {
  const problems: { code: string; sentence: string }[] = [];
  const seen = new Set<string>();
  for (const [name, entry] of entries(card)) {
    if (seen.has(name)) {
      problems.push({ code: 'WORLD_TOOL_DUP',
        sentence: `Tool '${name}' is declared in two effect blocks — one tool, one effect.` });
    }
    seen.add(name);
    if (entry.form === 'run' && !(name in executors)) {
      problems.push({ code: 'WORLD_EXECUTOR_MISSING',
        sentence: `Tool '${name}' declares form 'run' but no executor was passed for it.` });
    }
  }
  for (const name of Object.keys(executors)) {
    if (!seen.has(name)) {
      problems.push({ code: 'WORLD_EXECUTOR_UNKNOWN',
        sentence: `Executor '${name}' names no declared run tool.` });
    }
  }
  if (problems.length > 0) throw new CardError(problems);
  // The note is a function and survives the clone by reattachment — the DATA
  // half of the card is deep-copied, the note rides as declared.
  const { note, ...data } = card;
  return deepFreeze({ card: { ...structuredClone(data), ...(note !== undefined ? { note } : {}) },
    executors: { ...executors } });
}

/** Freezes an MCP surface card — remote entries, no records, no gates. */
export function mcpWorld(card: McpWorldCard): McpWorldCard {
  return deepFreeze(structuredClone(card));
}

/** Freezes a live surface card — tools that execute themselves on the named host. */
export function liveWorld(card: LiveWorldCard): LiveWorldCard {
  return deepFreeze(structuredClone(card));
}
