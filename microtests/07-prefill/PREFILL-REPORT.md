# MICRO-TEST 7 — what the frozen-prefix layout actually costs in prefill

**The question.** The engine builds `system = frozen head + mutating STATE` and rebuilds it on
every model step (`turn.ts:239`). The TO-BE layout (design §C3 = D3) freezes `[A]-[D]` and moves
STATE out of the system, so that "re-prefill starts at `[G]`". This counts the tokens a real
local server actually prefilled under each layout.

**The answer: AS-IS is the cheapest layout on both instruments. Neither TO-BE variant beat it.**
The append-only variant costs 1.74× the prefill of AS-IS; the STATE-last variant costs 6.5×.

---

## 1 · The headline — three layouts, one conversation

Eight turns, write acts on turns 2, 4 and 6, one rep per arm, same scripted operator, same
model, same server. The number is `timings.prompt_n` — the tokens the server actually
prefilled. Cache hits are excluded from it, so it is the true cost of the layout.

```
 turn │ act   │      AS-IS       │  TO-BE-2 append-only      │ TO-BE-1
       │       │  prefill    ms   │  prefill    ms    context │ STATE-last
 ──────┼───────┼──────────────────┼───────────────────────────┼────────────
   1   │ read  │   4 065   8 519  │   4 069   9 730    4 069  │   4 069
   2   │ WRITE │     902   1 953  │   1 795   4 922    5 856  │   8 417
   3   │ read  │      62     359  │     921   2 555    6 773  │   4 340
   4   │ WRITE │   1 041   2 198  │   1 790   5 264    8 555  │   8 818
   5   │ read  │      58     352  │     896   2 719    9 447  │   4 498
   6   │ WRITE │   1 248   2 850  │   1 804   5 549   11 243  │   9 167
   7   │ read  │      47     360  │     883   2 790   12 122  │   4 644
   8   │ read  │      58     352  │     884   2 896   13 002  │   4 688
 ──────┼───────┼──────────────────┼───────────────────────────┼────────────
 TOTAL │       │   7 481         │  13 042                    │  48 641
 vs AS-IS      │   1.00×          │   1.74×                   │   6.50×
```

Turn 1 is cold in every arm — the 3 253-token head has never been seen. Everything after
turn 1 is where the layouts separate.

**The shape of it.** AS-IS is almost free on a read turn (47–62 tokens) because nothing before
the end of the prompt moved; it pays 900–1 250 tokens on a write turn, when STATE changes.
Append-only never gets the free read turn: it pays ~890 tokens on *every* turn, because it
appends a fresh 776-token STATE block each time and those tokens are genuinely new — no cache
can supply them. It is steadier than AS-IS but not cheaper.

---

## 2 · The context-growth trade the append-only arm makes

Never removing a stale STATE block means the prompt itself grows by ~776 tokens per turn:

```
 context tokens at end of turn
 turn      1      2      3      4      5      6      7      8
 AS-IS  4 065  4 356  4 414  4 537  4 591  4 721  4 764  4 818   ← flat, +753 over 8 turns
 acc.   4 069  5 856  6 773  8 555  9 447 11 243 12 122 13 002   ← +8 933 over 8 turns
```

After eight short turns the append-only tape is **2.7× the size** of the AS-IS prompt, and it
keeps climbing linearly. At this rate a 65 536-token window holds roughly 60 turns before the
tape has to be cut. **This arm's steadiness is borrowed against the tape ceiling** — the pruning
work in BACKLOG row 1 owns that growth, and until pruning exists the growth is unbounded.

---

## 3 · The ruler, and that it works

The instrument is `prompt_n` from `/completion` with `cache_prompt: true`. Verification: send a
prompt, then send the byte-identical prompt again.

```
 ruler call 1 (cold)        prefill = 4 069 tokens
 ruler call 2 (identical)   prefill =     4 tokens     ◄ collapses — prefix caching engages
```

Four tokens against 4 069. The ruler is sound.

---

## 4 · Why STATE-last lost so badly — the reuse window

The result is not about "frozen bytes". It is about **how far from the END of the prompt the
first changed byte sits.** Controlled probe: one 3 622-token prompt, one word changed, that word
moved to different depths.

```
 first changed byte, distance from the END │ prefill
 ──────────────────────────────────────────┼─────────
                              108 tokens   │     516
                              378 tokens   │     516      ◄ cheap
                              738 tokens   │   3 622      ◄ full re-prefill
                            1 818 tokens   │   3 622
```

A cliff between 378 and 738 tokens. Now the three layouts against it:

```
 AS-IS      [ head 3253 ][ STATE 776 ][ history ][ new operator msg ]
                              ▲                                    ▲
                     changes here on a write             new bytes at the very end → free

 TO-BE-1    [ head 3253 ][ history ][ new operator msg ][ STATE 776 ]
                                            ▲
              new bytes land here, and STATE's 776 tokens sit AFTER them,
              so every new byte is ≥776 from the end → past the cliff → full re-prefill

 TO-BE-2    [ head 3253 ][ history ][ msg ][ STATE ][ msg ][ STATE ]  ← append-only
                                                              ▲
              new bytes are always last → cache is never invalidated,
              but ~776 of them are new every turn and must be prefilled regardless
```

The mutating block is 776 tokens long. Putting it last means nothing else can ever be near the
end. **The STATE-last layout is a win only if the mutating block is shorter than the server's
reuse window; here it is roughly twice as long, and the layout inverts.**

An honesty note on this probe: it says a divergence deeper than ~512 tokens forces a full
re-prefill, yet the AS-IS write turns diverged at roughly 800–1 250 tokens from the end and were
still served *partially* (902, 1 041, 1 248 — not 4 000). So the server's reuse rule is not a
plain function of divergence depth. I am not inventing the mechanism that reconciles the two —
the diagram above is the shape of the effect, not a proof of the server's internals.

---

## 5 · The riders

Measured on the ram24 instrument in the same pass. The owner's final trim deferred these; they
had already run, so they are reported rather than discarded.

**Rider 1 — the shared-`[A]` desk switch.** Two desks whose `[A]` identity+laws block is
byte-identical. `sharedFirst` puts the shared bytes first; the control puts each desk's own
rules first. Warm three turns on desk A, then switch to desk B.

```
 variant       │ desk A warm (3 calls)  │ desk B first call after the switch
 ──────────────┼────────────────────────┼───────────────────────────────────
 sharedFirst   │ 4 069 · 852 · 826      │ 3 845 tokens   (10.9 s)
 control       │ 4 069 · 852 · 846      │ 3 845 tokens   (10.4 s)
```

**The shared head bought nothing — 3 845 tokens either way, byte for byte.** Ordering the
identical house laws first did not let desk B reuse them. The reason is the same cliff: desk B's
head diverges from desk A's at the `[C]` boundary, ~1 800 tokens from the end of the prompt,
far past the reuse window. Sharing `[A]` across desks is justified on authoring and audit
grounds; on this server it is worth zero prefill.

**Rider 2 — the owed-read micro-step fork.** From a warm conversation: one call presenting a
SINGLE tool card (same system, forked messages), then back to the main loop.

```
 main loop, before the fork    4 380 tokens prefilled
 the FORK (one tool card)      3 664 tokens prefilled   ← the fork costs a near-full prefill
 main loop, after the fork     1 232 tokens prefilled   ← the main branch SURVIVED
```

**The fork costs about one full prefill, and the main loop survives it.** Returning to the main
branch cost 1 232 tokens rather than the 4 380 a cold restart would need, so the server kept the
main branch's KV alongside the fork's. The micro-step is affordable but it is not free: budget
roughly one extra full prefill every time one fires.

---

## 6 · Serving — exactly what was measured

**Instrument 2 (the headline): the `ram24` tier.**

| item | value |
|---|---|
| model | `Qwen3.6-35B-A3B-UD-IQ2_XXS.gguf` with baked MTP, `--spec-type draft-mtp` |
| server | llama.cpp `llama-server`, build commit `9723942a` |
| context | 65 536 · `-np 1` · KV f16 · `--cache-ram 16384` · `-ctxcp 64` |
| thinking | OFF — `--chat-template-kwargs '{"enable_thinking":false}'` on the server; every prompt rendered by hand with an empty `<think></think>` pair after the assistant tag. **No `<think>` tag appears in any of the 60 generated outputs** (`anyThinkTagInOutput: false`) |
| sampling | `temperature: 0`, `top_k: 1`, `n_predict: 64` |
| box | Apple M1 Max, 64 GB |

Measured speed and memory, per arm:

| arm | prefill tok/s (median / worst) | decode tok/s (median / worst) |
|---|---|---|
| AS-IS | 212 / 131 | 51.6 / 42.4 |
| TO-BE-2 append-only | 339 / 305 | 37.7 / 24.6 |
| TO-BE-1 STATE-last | 442 / 383 | 44.9 / 28.0 |

Prefill tok/s reads *higher* on the losing arms because a large contiguous prefill batches
better than a 50-token one. It is a rate, not a cost — the cost is the token count in §1.

Server RSS: 14.1 GB idle after load, 14.5 GB during AS-IS, 14.6–14.9 GB during the TO-BE arms,
**15.7 GB peak** (92 samples at 2 s).

**Prompt material** (measured with `/tokenize`):

| block | tokens |
|---|---|
| `[A]` identity + house laws · `[B]` other desks · `[C]` ~37 desk rules · `[D]` 12 tool cards as JSON schemas — the frozen head | 3 253 |
| STATE — vessels, quays, accounts, tariffs, bookings, waitlist | 776 |
| AS-IS system block (head + STATE) | 4 030 |

The design context quotes ≈3 300 for the head and ≈600 for STATE. The head landed at 3 253,
close. STATE landed at 776, about 30% over — and STATE's length is exactly what decides this
result. A 600-token STATE would shrink the append-only arm's per-turn cost by roughly a fifth;
it would not reverse the ranking, and 600 is still past the 378-token point where the cheap band
ends.

**Instrument 1 (history): the 27B.** The same three-arm question was first run against
`Qwen3.8-27B-UD-Q4_K_M.gguf` (unsloth/Qwen3.8-27B-GGUF, 15 GB) on the same build, at ~70 tok/s
prefill and ~5.5 tok/s decode with the GPU verified at 98–99% during decode. It produced the
same verdict on the STATE-last layout — 7 101 tokens for AS-IS against 48 171 for STATE-last,
**6.8×** — which is why the owner's trim dropped that arm from the final pass. The mechanism
(distance-from-the-end of the first changed byte) is identical on both instruments, and the
reuse-window probe returned the same cliff on both.

---

## 7 · What this does NOT prove

- **Nothing about quality.** Replies were generated for real and are transcripted, but no reply
  was judged. This times structure, not governance. A layout that is cheaper and answers worse
  is not a win, and this measurement cannot see that. In particular, the append-only arm asks
  the model to ignore every stale STATE block in favour of the last one — whether it actually
  does that is **unmeasured here and is the risk that arm carries**.
- **Nothing about hosted models.** Gemini-side implicit caching has a different granularity and
  a different price model. A result about llama.cpp's slot cache does not transfer to it.
- **Nothing about other servers or builds.** The reuse window is a property of this build and
  these flags. An earlier build tested in this same session did not collapse on the ruler at all.
- **Nothing statistical.** One rep per arm. Prefill counts are deterministic given identical
  bytes, but each arm's generated replies differ, so the histories are not byte-identical. That
  is tens of tokens against gaps of thousands.
- **Nothing about the non-cache reasons to freeze the prefix.** One string forever has value for
  auditability and for the one-prefix-per-turn goal of §AB2. This measures only prefill.
- **The riders were run on one instrument only**, and rider 1's null result is a statement about
  this server's reuse window, not about whether sharing `[A]` is good design.

---

## 8 · RECOMMENDATION for D3

**Specify AS-IS. Do not move STATE out of the system block for cache reasons.** On both
instruments the current layout was the cheapest measured: 7 481 prefill tokens over eight turns
against 13 042 for append-only (1.74×) and 48 641 for STATE-last (6.50×), and it also keeps the
prompt flat at ~4 800 tokens where append-only reaches 13 002 and climbs.

If D3 ships anyway for the non-cache reasons in §AB2, ship the **append-only** shape, never
STATE-last — but only behind the tape pruning in BACKLOG row 1, because its 776-tokens-per-turn
growth is unbounded without it, and re-measure the reuse window on the target serving stack
first: this whole result turns on a 776-token STATE against a ~500-token window, and shrinking
STATE below that window is the one change that would make the frozen-prefix layout pay.
