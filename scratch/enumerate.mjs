// Walks a run's dumps and names every case whose acts reached a hold or a choice ask.
// The choice guard names are read out of the subject's own cards file, so no case is
// picked by the look of its name.
import { readdirSync, readFileSync } from 'node:fs';

const [runDir, cardsFile] = process.argv.slice(2);
const cards = readFileSync(cardsFile, 'utf8');
const choiceGuards = new Set();
for (const m of cards.matchAll(/choiceFromUser\([\s\S]*?name:\s*'([^']+)'/g)) choiceGuards.add(m[1]);

const rows = [];
const files = readdirSync(`${runDir}/dumps`).sort();
for (const file of files) {
  const dump = JSON.parse(readFileSync(`${runDir}/dumps/${file}`, 'utf8'));
  const hits = new Set();
  for (const record of dump.records ?? []) {
    for (const act of record.acts ?? []) {
      if (act.reason === 'held') hits.add(`hold:${act.call.tool}`);
      if (act.guard != null && choiceGuards.has(act.guard)) hits.add(`choose:${act.call.tool}`);
    }
  }
  if (hits.size > 0) rows.push([dump.case, [...hits].join(' ')]);
}
console.error(`${rows.length} of ${files.length} :: choice guards ${[...choiceGuards].join(',')}`);
for (const [id, why] of rows) console.log(`${id}\t${why}`);
