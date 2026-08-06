/**
 * THE ENGINE'S OWN USER-FACING SENTENCES.
 *
 * Everything the engine itself puts on the user's screen lives here, so a host whose conversation runs in
 * another language declares them and the engine speaks it.
 *
 * The consent approval is why this is not cosmetic — the user must TYPE the token back, so they have to
 * be able to READ the instruction that asks for it. A user who cannot read the instruction answers in
 * their own words, every one of which is denied, and the act can never be consented to at all.
 *
 * The TOKEN itself is engine-issued and identical whatever language the sentence around it is written
 * in: the literal a user types is always the one the engine matches, and only the instruction moves.
 */
export interface EngineText {
  /** Closes a record that names at least one operation: the lines above it are the WHOLE of what this
   *  turn changed, so every operation they do not name is denied. */
  recordClosureSome: string;
  /**
   * Closes a record that names NONE.
   *
   * It is a SECOND sentence, not the same one, because "nothing else was changed" over an empty list
   * presupposes that something WAS changed — and beside a false claim that presupposition CONFIRMS it:
   *
   * ```
   *   message   "I cancelled the Dentist appointment."
   *   lines     (none)
   *   closure   "Nothing else was changed on this turn."
   *             the reader concludes → so it really was cancelled, and nothing further
   * ```
   *
   * This sentence asserts the absence outright, so there is nothing left to presuppose and the claim
   * above it stands contradicted.
   */
  recordClosureNone: string;
  /** The consent question: what the user is agreeing to, and the literal that agrees to it. */
  approval: (meaning: string, token: string) => string;
}

export const DEFAULT_ENGINE_TEXT: EngineText = Object.freeze({
  recordClosureSome: 'Nothing else was changed on this turn.',
  recordClosureNone: 'No operation was carried out on this turn.',
  approval: (meaning: string, token: string) => `To confirm ${meaning}, reply: ${token}`,
});

/** The pack a render call uses: the host's sentences where it declared them, the engine's elsewhere. */
export function resolveEngineText(t?: Partial<EngineText>): EngineText {
  return t ? { ...DEFAULT_ENGINE_TEXT, ...t } : DEFAULT_ENGINE_TEXT;
}
