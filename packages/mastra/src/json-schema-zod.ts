/**
 * @looprun-ai/mastra — JSON Schema → Zod (shallow; sufficient for Mastra createTool inputSchema).
 */
import { z } from 'zod';

export function jsonTypeToZod(def: Record<string, unknown>): z.ZodTypeAny {
  const type = def.type as string | undefined;
  if (def.enum) return z.enum(def.enum as [string, ...string[]]);
  if (type === 'string') return z.string();
  if (type === 'number' || type === 'integer') return z.number();
  if (type === 'boolean') return z.boolean();
  if (type === 'array') {
    const items = def.items as Record<string, unknown> | undefined;
    return z.array(items ? jsonTypeToZod(items) : z.unknown());
  }
  if (type === 'object') {
    const props = (def.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = (def.required ?? []) as string[];
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [k, v] of Object.entries(props)) shape[k] = required.includes(k) ? jsonTypeToZod(v) : jsonTypeToZod(v).optional();
    return z.object(shape).passthrough();
  }
  return z.unknown();
}

export function jsonSchemaToZodObject(schema: Record<string, unknown>): z.ZodTypeAny {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [k, v] of Object.entries(props)) shape[k] = required.includes(k) ? jsonTypeToZod(v) : jsonTypeToZod(v).optional();
  return z.object(shape).passthrough();
}
