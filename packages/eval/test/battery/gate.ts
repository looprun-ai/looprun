/**
 * THE GATE — the battery spends money on a real model, so it is OFF unless two things are true.
 *
 * ```
 *   LOOPRUN_BATTERY=1                 the operator asked for it
 *   GOOGLE_GENERATIVE_AI_API_KEY=…    the subject model can actually be reached
 * ```
 *
 * Both, or the gated suite reports why it did nothing and passes. An arming flag with no key would
 * fail the everyday suite on a laptop; a key with no flag would bill every `pnpm test`.
 *
 * The MEASURING code this gate protects is not gated at all: `battery.ts` and everything it calls run
 * against the fake model in `battery-metrics.test.ts`, in the everyday suite, on every commit.
 */

/** The arming flag. Named here and nowhere else. */
export const BATTERY_ENV = 'LOOPRUN_BATTERY';

/** The subject model's key — the same variable `geminiFlashLiteThinkOff()` reads. */
export const KEY_ENV = 'GOOGLE_GENERATIVE_AI_API_KEY';

/** Why the battery is not running, or `null` when it is armed. */
export function batterySkipReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env[BATTERY_ENV]) return `${BATTERY_ENV} is not set — the battery is a gated suite, not part of the everyday run`;
  if (!env[KEY_ENV]) return `${BATTERY_ENV} is set but ${KEY_ENV} is not — the subject model cannot be reached`;
  return null;
}

/** True when both the flag and the key are present. */
export function batteryArmed(env: NodeJS.ProcessEnv = process.env): boolean {
  return batterySkipReason(env) === null;
}
