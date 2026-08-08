/**
 * NATIVE SURFACE RECONCILIATION — the declared surface file (gen/tools.json) must describe THIS host.
 *
 * In native/MCP mode the tools execute themselves, so the file is the only place guard prose and
 * certification compose from. A file that names a tool the host lacks, misses one the surface
 * activates, or declares a schema the live tool no longer matches would have the model reading one
 * surface while the host validates another — construction throws instead.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';

/** The drift-relevant canonical projection of a JSON schema: type, sorted properties (recursed),
 *  sorted required, enum, items. Prose-level keys (`description`, `$schema`, titles) never enter it,
 *  so authored wording never fails the check while a renamed argument, a new field or a changed type
 *  does. */
export function schemaProjection(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return null;
  const rec = schema as Record<string, unknown>;
  const props =
    rec.properties && typeof rec.properties === 'object'
      ? Object.fromEntries(
          Object.entries(rec.properties as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, schemaProjection(v)]),
        )
      : undefined;
  return {
    type: rec.type ?? null,
    ...(rec.enum !== undefined ? { enum: rec.enum } : {}),
    ...(props ? { properties: props } : {}),
    ...(Array.isArray(rec.required) ? { required: [...(rec.required as string[])].sort() } : {}),
    ...(rec.items !== undefined ? { items: schemaProjection(rec.items) } : {}),
  };
}

/** Throws when the declared surface does not describe this host: the declared name set must equal the
 *  ACTIVE name set, and every declared inputSchema must project-equal the live tool's. A live schema
 *  is a zod validator; the file's is JSON Schema — both are compared through {@link schemaProjection}. */
export function reconcileNativeSurface(
  toolDefs: ReadonlyArray<{ name: string; inputSchema?: unknown }>,
  liveTools: Record<string, { inputSchema?: unknown }>,
  activeNames: readonly string[],
  specId: string,
): void {
  const declared = toolDefs.map((d) => d.name).sort();
  const live = [...activeNames].sort();
  if (JSON.stringify(declared) !== JSON.stringify(live)) {
    throw new Error(
      `LoopRunAgent "${specId}": gen/tools.json does not describe this host — ` +
        `declared [${declared.join(', ')}] vs live [${live.join(', ')}]. ` +
        'Re-run the surface intake step and re-certify.',
    );
  }
  for (const def of toolDefs) {
    const liveSchema = liveTools[def.name]?.inputSchema;
    const liveJson = liveSchema ? zodToJsonSchema(liveSchema as never, { $refStrategy: 'none' }) : undefined;
    const a = JSON.stringify(schemaProjection(def.inputSchema));
    const b = JSON.stringify(schemaProjection(liveJson));
    if (a !== b) {
      throw new Error(
        `LoopRunAgent "${specId}": the declared inputSchema of "${def.name}" does not match the live tool's — ` +
          'the model would read one schema while the host validates another. Re-run the surface intake step.',
      );
    }
  }
}
