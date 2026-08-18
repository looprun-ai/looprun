/** Maps the stateless wire onto engine sessions: the key is a TYPED PAIR
 *  (credential hash, caller-supplied session id) in a nested map — no joined
 *  string, no merging of strangers. A session belongs to the credential that
 *  opened it; another caller naming the same id gets their own. */
export class WireSessions {
  private readonly byCredential = new Map<string, Map<string, string>>();
  private readonly lastSeen = new Map<string, number>();
  private minted = 0;

  resolve(credentialHash: string, callerSessionId: string): string {
    let lane = this.byCredential.get(credentialHash);
    if (!lane) {
      lane = new Map();
      this.byCredential.set(credentialHash, lane);
    }
    let engineId = lane.get(callerSessionId);
    if (engineId === undefined) {
      this.minted += 1;
      engineId = `w${this.minted}`;
      lane.set(callerSessionId, engineId);
    }
    this.lastSeen.set(engineId, Date.now());
    return engineId;
  }

  /** Engine sessions idle past the TTL — returned once and forgotten, so the
   *  caller ends each exactly once. */
  idle(ttlMs: number): readonly string[] {
    const cutoff = Date.now() - ttlMs;
    const out: string[] = [];
    for (const [engineId, seen] of this.lastSeen) {
      if (seen <= cutoff) out.push(engineId);
    }
    for (const engineId of out) {
      this.lastSeen.delete(engineId);
      for (const lane of this.byCredential.values()) {
        for (const [caller, id] of lane) {
          if (id === engineId) lane.delete(caller);
        }
      }
    }
    return out;
  }
}
