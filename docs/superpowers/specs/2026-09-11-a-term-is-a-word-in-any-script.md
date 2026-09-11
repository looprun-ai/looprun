# A declared term is a word in any script

## 1 · The measurement

The Criaty subject `criaty-c2` declares `swapTerms({ peças: publicações, peça: publicação, … })`
— the trade words the brief forbids, translated on the way out. On the product's live ladder
(`yntelli/yntelli/evals/reports/rung3-c2`, cases `08-zero-quota` and `09-pulse-read`) the owner
still read "não consigo gerar a peça agora" and "vale planejar 4 peças por semana". The swap reads
a word as a run of ASCII identifier characters, so `peça` is three tokens — `pe`, `ç`, `a` — and
never a term. `test/cards/swap-terms.test.ts` shows it red on the unchanged engine: both accented
terms ride through untouched.

## 2 · The implementation

`packages/core/src/cards/catalog.ts:1004-1008`:

```ts
/** A character a word is made of, in any script that writes words in letters: a letter is a
 *  character with a case (ç, ã, é, ñ included), a digit, or the underscore. */
function isIdentChar(c: string): boolean {
  return (c >= '0' && c <= '9') || c === '_' || c.toLowerCase() !== c.toUpperCase();
}
```

No regex — the purity charter stands. Proofs: an accented term swaps whole; an ASCII term still
swaps; a word that merely contains a term (`cabeça`, `despeçamento`) is left alone; a hyphenated
compound swaps its word (`peça-chave`). Core suite 376/376, typecheck clean, build clean, the five
root gates clean. The measured build is the branch `microtest-unicode-terms`.

## 3 · The documentation

The law lives in the source header of `isIdentChar` and `swapTerms` ("literal, word-boundary, NO
regex"). Checked and found not to state the ASCII limit: `README.md`, `governance/GOVERNANCE.md`,
`docs/tutorial/01..06`.

## 4 · The skill

`agentspec/skill/references/norms.md` names the three rewrites; a term is now stated as a word in
the operator's own script. The bench subject that measures it is `agentspec-bench/subjects/criaty-c2`
on the product's live surface.
