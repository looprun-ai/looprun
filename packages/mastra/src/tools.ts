/**
 * @looprun-ai/mastra — tool wiring: JSON-schema ToolDefs → Mastra tools executed through the world seam.
 *
 * Terminal tools (replyToUser/askUser) are runtime-owned: their execute captures the user-facing
 * text into the ACTIVE session's ledger. Domain tools route to `world.exec(name, args)`.
 */
import { createTool } from '@mastra/core/tools';
import { isTerminal, recordTerminal, terminalToolDefs } from '@looprun-ai/core';
import type { ToolDef } from '@looprun-ai/core';
import type { LoopRunSession } from './session.js';
import { jsonSchemaToZodObject } from './json-schema-zod.js';

export type SessionAccessor = () => LoopRunSession;

/** Build the Mastra tool map for a spec surface: domain tools (world.exec) + the terminal tools. */
export function buildWorldTools(
  toolDefs: ToolDef[],
  surface: ReadonlySet<string>,
  getSession: SessionAccessor,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  const byName = new Map(toolDefs.map((d) => [d.name, d]));
  // Backfill terminal defs when the host's toolDefs omit them.
  for (const def of terminalToolDefs()) if (!byName.has(def.name)) byName.set(def.name, def);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};
  for (const def of byName.values()) {
    if (!surface.has(def.name) && !isTerminal(def.name)) continue;
    if (isTerminal(def.name)) {
      tools[def.name] = createTool({
        id: def.name,
        description: def.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: jsonSchemaToZodObject(def.inputSchema) as any,
        execute: async (input: unknown) => {
          const args = (input ?? {}) as Record<string, unknown>;
          const session = getSession();
          recordTerminal(session.ledger, def.name, args);
          return session.world.exec(def.name, args);
        },
      });
      continue;
    }
    tools[def.name] = createTool({
      id: def.name,
      description: def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: jsonSchemaToZodObject(def.inputSchema) as any,
      execute: async (input: unknown) => getSession().world.exec(def.name, (input ?? {}) as Record<string, unknown>),
    });
  }
  return tools;
}

/** Build ONLY the terminal tools (native-tools mode: domain tools execute themselves). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildTerminalTools(getSession: SessionAccessor): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};
  for (const def of terminalToolDefs()) {
    tools[def.name] = createTool({
      id: def.name,
      description: def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: jsonSchemaToZodObject(def.inputSchema) as any,
      execute: async (input: unknown) => {
        const args = (input ?? {}) as Record<string, unknown>;
        recordTerminal(getSession().ledger, def.name, args);
        return { success: true };
      },
    });
  }
  return tools;
}
