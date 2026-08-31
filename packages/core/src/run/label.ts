/** The tool-result annotation at the seam where a recorded act reaches the model. A result is
 *  DATA the world handed back, and the record line says so on every field it arrived under: each
 *  field name is marked with the tool that returned it, so an instruction planted inside a value
 *  reaches the model already standing inside a named data field rather than beside the engine's
 *  own words.
 *
 *  The walk goes ALL THE WAY DOWN. A world hands back a block inside a block — a booking with a
 *  note on it, a list of rows each carrying a comment — and the field somebody writes into is
 *  almost never the top one. A mark that stopped at the first level would name the wrapper and
 *  leave the written field bare, which is the one field the mark exists for.
 *
 *  The mark is a NAME — the tool's — and never a word of a value: every value is carried through
 *  byte for byte, so what the model reads is what the world sent. Nothing is read, matched or
 *  inspected, and it costs no model call.
 *
 *  The STORED act is untouched. A disclosure recipe names the field the tool declares —
 *  `{result.nights}` — and the owed reads answer their aliases off the stored result, so the mark
 *  belongs on the way out and nowhere else. */
import type { Json } from '../contract/vocabulary.js';

function isFieldBlock(value: Json): value is { readonly [k: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function label(tool: string, result: Json): Json {
  if (Array.isArray(result)) return result.map(row => label(tool, row));
  if (!isFieldBlock(result)) return result;
  const marked: Record<string, Json> = {};
  for (const [field, value] of Object.entries(result)) {
    marked[`${tool}.${field}`] = label(tool, value);
  }
  return marked;
}
