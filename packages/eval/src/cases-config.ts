/**
 * @looprun-ai/eval — the `evals/cases.json` schema (zod) + loader.
 *
 * THE EXAM AS DATA. A case used to be a free TypeScript object; a global bulk regex edit could (and
 * did, in the Atlas run) corrupt fifteen of them at once because the format made a sweeping edit look
 * as safe as a surgical one. As a strict JSON object the corruption class dies: an anchored edit
 * touches ONE case object, and a bulk regex over structured data is simply pointless.
 *
 * The JSON shape (spec §1) is deliberately terser than the in-memory {@link SubjectCase}:
 *   - `agent` lives ON the case (the JSON is self-routing) — the loader lifts it into the subject's
 *     `caseAgent` map, so the runtime keeps its single routing surface.
 *   - `invariants.required` / `invariants.forbidden` use `{ tool, anyArgs }` (not `requiredToolCalls`
 *     / `{ name }`) — the loader translates to the runtime's `ReqCall` shape.
 *   - `rubric` and `targets` sit at the top level; `predict` is the E1 per-case prediction line.
 *
 * Every object is `.strict()`: an unknown key fails loudly by name, exactly as {@link loadNormsConfig}
 * does for `norms/<agent>.json`.
 */
import { z } from 'zod';
import type { SubjectCase } from './subject.js';

/** A config violation, with a path-qualified message. Thrown by {@link loadCasesConfig}. */
export class CasesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CasesConfigError';
  }
}

const reqCallSchema = z
  .object({ tool: z.string(), anyArgs: z.record(z.string(), z.unknown()).optional() })
  .strict();

const invariantsSchema = z
  .object({ required: z.array(reqCallSchema).optional(), forbidden: z.array(reqCallSchema).optional() })
  .strict();

const rubricItemSchema = z
  .object({ id: z.string(), description: z.string(), critical: z.boolean().optional() })
  .strict();

const caseSchema = z
  .object({
    id: z.string(),
    agent: z.string(),
    setup: z.object({ preset: z.string().optional(), clearConversation: z.boolean().optional() }).strict().optional(),
    turns: z.array(z.object({ userText: z.string() }).strict()).min(1),
    invariants: invariantsSchema.optional(),
    rubric: z.array(rubricItemSchema).optional(),
    targets: z.array(z.string()).optional(),
    predict: z.string().optional(),
  })
  .strict();

const casesConfigSchema = z.object({ cases: z.array(caseSchema).min(1) }).strict();

/** The validated shape of an `evals/cases.json`. */
export type CasesConfig = z.infer<typeof casesConfigSchema>;

/** The parsed pack: runtime cases PLUS the per-case routing the JSON declared. */
export interface ParsedCases {
  cases: SubjectCase[];
  caseAgent: Record<string, string>;
}

function toSubjectCase(c: z.infer<typeof caseSchema>): SubjectCase {
  const inv = c.invariants;
  const hasInv = inv && (inv.required?.length || inv.forbidden?.length);
  return {
    id: c.id,
    ...(c.setup ? { setup: c.setup } : {}),
    turns: c.turns,
    expectations: {
      ...(hasInv
        ? {
            invariants: {
              ...(inv?.required ? { requiredToolCalls: inv.required.map((r) => ({ name: r.tool, ...(r.anyArgs ? { anyArgs: r.anyArgs } : {}) })) } : {}),
              ...(inv?.forbidden ? { forbiddenToolCalls: inv.forbidden.map((r) => ({ name: r.tool, ...(r.anyArgs ? { anyArgs: r.anyArgs } : {}) })) } : {}),
            },
          }
        : {}),
      ...(c.rubric ? { rubric: c.rubric } : {}),
    },
    ...(c.targets ? { targets: c.targets } : {}),
  };
}

/** Parse an `evals/cases.json` value into runtime cases plus the routing it declares. Throws
 *  {@link CasesConfigError} with a path-qualified message on any violation (all at LOAD time). */
export function parseCasesConfig(json: unknown): ParsedCases {
  const parsed = casesConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CasesConfigError(`cases config invalid at ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  const cases: SubjectCase[] = [];
  const caseAgent: Record<string, string> = {};
  const seen = new Set<string>();
  for (const c of parsed.data.cases) {
    if (seen.has(c.id)) throw new CasesConfigError(`cases config: duplicate case id "${c.id}"`);
    seen.add(c.id);
    caseAgent[c.id] = c.agent;
    cases.push(toSubjectCase(c));
  }
  return { cases, caseAgent };
}

/** Load an `evals/cases.json` value into `SubjectCase[]` (the routing is available via
 *  {@link parseCasesConfig} when the caller needs it). */
export function loadCasesConfig(json: unknown): SubjectCase[] {
  return parseCasesConfig(json).cases;
}
