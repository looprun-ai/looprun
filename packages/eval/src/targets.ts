/** The R4·ASK surface: ask/targets.json declares EVERY serving fact per target —
 *  provider kind, model, key env-var, tier, runaway brakes. Nothing is inferred
 *  from an id's spelling or a hostname. A row is an operator's declaration that
 *  the target may take a governed seat; the floor law (certification over reps)
 *  is the Certifier's, at seal time. */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ModelTarget } from '@looprun-ai/core';
import { CardError } from '@looprun-ai/core';

const ROW = z.object({
  id: z.string().optional(),
  provider: z.string(),
  model: z.string(),
  keyEnv: z.string().nullable().optional(),
  apiKeyEnv: z.string().optional(),           // the bench spelling of the same declaration
  tier: z.union([z.literal('cloud'), z.object({ local: z.string() })]).optional(),
  brakes: z.object({ maxTurns: z.number().int().positive() }).partial().optional()
}).strict();

const FILE = z.object({ targets: z.array(ROW).min(1) }).passthrough();

export interface DeclaredTarget {
  readonly target: ModelTarget;
  readonly model: string;
  readonly brakes: Readonly<Record<string, number>>;
}

export function loadTargets(path: string): readonly DeclaredTarget[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e: unknown) {
    throw new CardError([{ code: 'TARGETS_UNREADABLE',
      sentence: `${path} is not readable json: ${e instanceof Error ? e.message.split('\n')[0] : 'unknown'}` }]);
  }
  const checked = FILE.safeParse(parsed);
  if (!checked.success) {
    throw new CardError(checked.error.issues.map(issue => ({ code: 'TARGETS_INVALID',
      sentence: `${path}: ${issue.path.join('.')} — ${issue.message}` })));
  }
  return checked.data.targets.map(row => ({
    target: {
      id: row.id ?? row.model,
      provider: row.provider,
      keyEnv: row.keyEnv ?? row.apiKeyEnv ?? null,
      tier: row.tier ?? 'cloud',
      certified: true
    },
    model: row.model,
    brakes: row.brakes ?? {}
  }));
}
