# MICRO-TEST 9 — what a long tape costs, and what a cut costs

**The question.** A governed session's tape grows without a ceiling and every model call resends
all of it. Today's engine also REWRITES that tape each turn: `turn.ts:152-159` keeps act sentences
on only the last TWO sealed turns, so from turn 4 on an older assistant message silently loses its
act lines. Microtest 7 established that a changed byte deep in the prompt forces a deep re-prefill.
This counts what that rewrite actually costs, and what a checkpoint cut costs against it.

**The answer.** The window-2 rewrite costs **2.02× the prefill** of an append-only tape over 24
turns and bought nothing this test could see. Checkpoint compaction at 8/4 spacing did **not** pay
for itself at 24 turns (+5.8%), but it is the only arm whose tape stops growing — and dropping the
planted facts from its summary produced a **confidently wrong booking id**, not a refusal.

---

## 1 · The four-arm table

24 scripted turns, one rep per arm, same operator script, same model, same server. Writes on turns
5, 11 and 20 (two model calls each). The number is `timings.prompt_n` — the tokens the server
actually prefilled; cache hits are excluded, so it is the true cost of the tape law.

```
 turn │   A       B       C       D    ││  context at turn end
       │ append  win-2   ckpt   ckpt-  ││   A      B      C      D
       │ -only   rewrite        drop   ││
 ──────┼────────────────────────────────┼┼──────────────────────────
   1   │  4 065   4 065   4 065   4 065 ││  4 065  4 065  4 065  4 065   ← cold, every arm
   2   │    139     139     139     139 ││  4 200  4 200  4 200  4 200
   3   │     85      85      85      85 ││  4 281  4 281  4 281  4 281
   4   │     93     792      93      93 ││  4 370  4 341  4 370  4 370   ◄ rewrite starts
   5 W │  1 266   1 217   1 266   1 266 ││  4 686  4 640  4 686  4 686
   6   │    114     598     114     114 ││  4 796  4 722  4 796  4 796
   7   │     83     573      83      83 ││  4 875  4 779  4 875  4 875
   8   │    144     570     144     144 ││  5 015  4 833  5 015  5 015
   9   │     62     566   1 311   1 252 ││  5 073  4 883  4 860  4 801   ◄ checkpoint 1
  10   │    109     559     109     109 ││  5 178  4 926  4 965  4 906
  11 W │  1 977   1 677   1 680   1 621 ││  5 404  5 128  5 149  5 090
  12   │    130     602     130     130 ││  5 530  5 214  5 275  5 216   ◄ memory Q1
  13   │     75     568      73      85 ││  5 601  5 266  5 344  5 297
  14   │     97     551      96      96 ││  5 694  5 301  5 436  5 389
  15   │    111      80     104     111 ││  5 801  5 377  5 536  5 496
  16   │     95   1 885     112     116 ││  5 892  5 434  5 644  5 608
  17   │    129     593   1 197   1 149 ││  6 017  5 511  4 746  4 698   ◄ checkpoint 2
  18   │     73     529      42      41 ││  6 086  5 524  4 784  4 735
  19   │     97     543      94      97 ││  6 179  5 551  4 874  4 828
  20 W │  2 984   2 306   1 697   1 651 ││  6 395  5 751  5 108  5 062
  21   │     73     561      76      77 ││  6 464  5 796  5 180  5 135
  22   │    121     559     121     121 ││  6 581  5 839  5 297  5 252   ◄ memory Q2
  23   │     79     543      80      77 ││  6 656  5 866  5 373  5 325
  24   │    127     590     127     127 ││  6 779  5 940  5 496  5 448
 ══════╪════════════════════════════════╪╪══════════════════════════
 TOTAL │ 12 328  20 751  13 038  12 849 ││
 minus │
 turn1 │  8 263  16 686   8 973   8 784 ││
 vs A  │  1.00×   2.02×   1.09×   1.06× ││
 wall  │    56 s    73 s    63 s    64 s ││
```

Turn 1 is cold in every arm (the 3 253-token head has never been seen); the `minus turn 1` row is
the honest comparison. **The window-2 rewrite costs twice the prefill of doing nothing.**

### Where arm B's money goes

Arm B's read turns cost **529–602 tokens** where arm A's cost **62–144**. The mechanism is exactly
microtest 7's: when sealed turn *N-2* drops out of the two-turn window, its act lines are deleted
from bytes the server already holds, and everything after that point must be prefilled again.

```
 the same turn 7, two tape laws

 A  … [t5 reply + ACT create_booking …] [t6 reply + ACT read_vessel …] [t7 msg]
                                                                        ▲ only new bytes → 83

 B  … [t5 reply                       ] [t6 reply + ACT read_vessel …] [t7 msg]
              ▲ these bytes vanished this turn, ~450 tokens from the end → 573
```

Turn 15 is the tell that proves the mechanism rather than assuming it: arm B cost only **80** there,
because the turn falling out of the window (turn 12) had **no act sentences to strip**, so nothing
older changed. Turn 16 then cost **1 885** — the largest read-turn charge in the whole table —
because two act-carrying turns aged out at once.

### Where the write turns go, and why the tape length is a multiplier

STATE lives in the system block (the AS-IS layout microtest 7 recommends), so a write act changes
bytes *before the entire tape*. The cost of a write is therefore a function of how long the tape is:

```
 write act │  A append-only │  C checkpointed
 ──────────┼────────────────┼─────────────────
 turn  5   │       1 266    │      1 266       ← same tape, same price
 turn 11   │       1 977    │      1 680
 turn 20   │       2 984    │      1 697       ◄ A has grown 2.4×; C is flat
```

**This is the real cost of an unbounded tape.** It is not the ~120 tokens a turn of new text costs;
it is that every write act re-prefills the whole tape behind it, and that bill grows for as long as
the session runs. Arm A's third write cost 2.4× its first. Arm C's third cost 1.34× its first.

---

## 2 · The memory-answer table

The three planted facts, asked back at turns 12 and 22. **I judged these myself from the
transcripts; no model judged anything.**

```
 probe                            │   A     │   B     │   C     │   D
 ─────────────────────────────────┼─────────┼─────────┼─────────┼──────────
 turn 22 · the ID  (BK-4477)      │  RIGHT  │  RIGHT  │  RIGHT  │  WRONG
   what the desk answered         │ BK-4477 │ BK-4477 │ BK-4477 │ BK-4402
 ─────────────────────────────────┼─────────┼─────────┼─────────┼──────────
 turn 12 · the FIGURE (118 EUR)   │ refused │ refused │  "118"  │ refused
   verdict on the probe           │     ── INSTRUMENT INVALID, see below ──
 ─────────────────────────────────┼─────────┼─────────┼─────────┼──────────
 turn  8 · the DECISION (Q-04)    │     ── never asked back; carried, untested ──
```

### The id probe is the clean one, and arm D fails it loudly

Arm D's summary omits `BK-4477`. Asked which booking it opened, the desk did not say it could not
remember. It named a **different, real booking code from STATE** and then produced a record line
claiming it had read it:

```
 D t22  Q: Which booking id did we open for the Northern Gantry earlier in this session?
        A: The booking code for Northern Gantry is BK-4402.
           Do you want to amend this booking?
           ACT read_booking {"bookingCode":"BK-4402"} — ran, returned vesselCode VS-1002.

 C t22  A: The booking ID for the Northern Gantry is BK-4477.
```

BK-4402 is the Northern Gantry's *other* booking, on Q-04 — the quay the operator ruled off-limits
at turn 8. A cut that forgets an id does not degrade into silence; it degrades into a confident
wrong answer that the next act would then operate on. **Arm D is the failure it was built to be,
and the bar has teeth: this cut costs a point, so it is not a cut.**

### The figure probe failed as an instrument, and I am reporting it as a failure

The desk **refused the planted figure at turn 2**, correctly, under its own house law that no figure
may be stated that is not in STATE:

```
 t2  operator: … we agreed a flat rate of 118 EUR per berth-hour, which overrides the
                published tariff. Confirm you have noted 118 EUR per berth-hour.
     desk:     I cannot confirm or note a commercial term that overrides the published
               tariff. … The published tariff for berth.hour is 46 EUR.
```

So there was never an agreed figure in this session. Arms A, B and D answering *"I do not have a
record of any agreed figure"* at turn 12 is **faithful to what actually happened**, not a memory
failure — and I verified the literal `118` was present in arm A's and arm B's tape at that turn, so
they had the bytes and declined them on governance grounds.

Arm C "passed" only because my script-written summary asserted the rate as *established*, which
misrepresents a turn the desk had refused. **That is a defect in my summary, not a win for
compaction.** It is also a live warning about the design: a compaction step that flattens a refused
proposal into an "established fact" launders it past the guard that refused it.

The id probe is unaffected — `BK-4477` came from a tool result, which the desk is required to
believe — so the arm-D verdict above stands on its own.

---

## 3 · The ruler, and that it works

```
 ruler call 1 (cold)        prefill = 4 065 tokens
 ruler call 2 (identical)   prefill =     4 tokens   ◄ collapses — prefix caching engages
```

---

## 4 · Serving — exactly what was measured

| item | value |
|---|---|
| model | `Qwen3.6-35B-A3B` IQ2_XXS with baked MTP, `--spec-type draft-mtp` |
| server | llama.cpp `llama-server`, build `9723942a`, 127.0.0.1:8081, `-np 1`, already running |
| context | 65 536 · KV f16 |
| thinking | OFF — empty `<think></think>` pair after the assistant tag. **No `<think>` tag in any of the 110 generated outputs** |
| sampling | `temperature: 0`, `top_k: 1`, `n_predict: 64` |
| box | Apple M1 Max, 64 GB |

| block | tokens |
|---|---|
| frozen head `[A]`–`[D]` | 3 253 |
| STATE | 776 |
| checkpoint summary, facts KEPT (arm C) | 199 |
| checkpoint summary, facts DROPPED (arm D) | 140 |

Server RSS 15 690 MB at load, **15 706 MB peak** across 133 samples — the tape never moved memory.

---

## 5 · RECOMMENDATION for the engine's tape law

**Kill the window-2 rewrite.** It doubles prefill (16 686 against 8 263 tokens over 23 warm turns)
and this test found nothing it bought: on the one memory probe that was valid, arm B answered
exactly as arm A did. The engine's tape should be **append-only** — a sealed turn's bytes are
written once and never edited again. If act sentences are too expensive to carry on every turn,
decide that at seal time and never write them; do not write them and delete them later. Any
retention rule expressed as "the last N turns" is a rewrite rule, and a rewrite rule pays a deep
re-prefill on every turn where the window slides over an act-carrying turn.

**Do not compact on a fixed turn count.** At 8/4 spacing over 24 turns, compaction cost 5.8% MORE
than doing nothing: the two checkpoints cost 2 508 tokens and only saved 1 584 on write acts. The
saving is real but it accrues through the write acts, whose price tracks tape length (arm A's third
write cost 2 984 against arm C's 1 697), so the right trigger is a **budget, not a clock**: compact
when the tape is long enough that the next write act would cost more than a checkpoint, or when the
tape threatens the context window. On this instrument that point arrived around the second write
act, not at a fixed turn 8.

**The summary must preserve every tool-returned identifier, verbatim, and must never upgrade a
refused proposal into an established fact.** Arm D dropped one booking code and the desk answered
with a different real code and a record line claiming it had read it — a wrong act waiting to
happen. Arm C kept the code and was right, but its summary also restated a rate the desk had refused
at turn 2, which is the same defect pointing the other way. A compaction block is a record of what
the tape said, including what was refused; it is not a place to settle open questions.

---

## 6 · What this does NOT prove

- **The summaries here are deterministic and script-written, not model-written.** Arm C's summary was
  authored by the harness from a script it already knew the answers to. A real compaction step would
  ask a model to write it, and every error that model makes lands in the tape permanently. Nothing
  here measures that error rate, and §2 shows the harness itself got a fact wrong.
- **24 turns is not a week-long chat.** The tape reached 6 779 tokens in arm A, roughly 10% of the
  window. Every conclusion about growth is a short-run slope, not a ceiling measurement. The context
  ceiling itself was never approached, let alone hit.
- **One rep per arm.** Prefill counts are deterministic given identical bytes, but each arm generated
  its own replies, so the tapes are not byte-identical across arms. That is tens of tokens against
  gaps of thousands on the B comparison — but it is NOT negligible on the A-versus-C comparison,
  whose whole gap is 710 tokens. Read A-versus-C as "roughly a wash at this length", not as 5.8%.
- **Two of the three planted facts were never validly tested.** The figure probe was invalidated by
  the desk's own correct refusal, and the turn-8 decision was carried by every arm but never asked
  back. The teeth in this report rest on ONE probe in ONE arm.
- **Nothing about reply quality outside the two probes.** 110 replies were generated and are
  transcripted; none was judged for governance beyond the memory answers. A tape law that is cheaper
  and governs worse would look identical in the table above.
- **Nothing about hosted models.** llama.cpp's slot cache is not Gemini's implicit caching. The
  re-prefill prices here do not transfer.
- **Nothing about other builds.** The reuse window is a property of this build and these flags.
