/**
 * THE ENGINE'S OWN SENTENCES — the host declares them, and the record speaks whatever it declared.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_ENGINE_TEXT, resolveEngineText } from '../src/runtime/engine-text.js';
import { renderOperationReport } from '../src/runtime/claims.js';

describe('resolveEngineText', () => {
  it('defaults every sentence when the host declares none', () => {
    expect(resolveEngineText()).toEqual(DEFAULT_ENGINE_TEXT);
  });

  it('takes only the sentences the host overrides', () => {
    const t = resolveEngineText({ recordClosureNone: 'Nenhuma operação foi realizada neste turno.' });
    expect(t.recordClosureNone).toBe('Nenhuma operação foi realizada neste turno.');
    expect(t.recordClosureSome).toBe(DEFAULT_ENGINE_TEXT.recordClosureSome);
  });

  it('renders the challenge sentence from the meaning and the token', () => {
    expect(DEFAULT_ENGINE_TEXT.challenge('BK-1', 'CONFIRM BK-1')).toBe('To confirm BK-1, reply: CONFIRM BK-1');
  });
});

describe('the record speaks the declared language', () => {
  it('closes an empty record with the host sentence', () => {
    const text = resolveEngineText({ recordClosureNone: 'Nenhuma operação foi realizada neste turno.' });
    expect(renderOperationReport([{ op: 'inform' }], { text })).toBe('Nenhuma operação foi realizada neste turno.');
  });

  it('closes a record that names an operation with the host sentence', () => {
    const text = resolveEngineText({ recordClosureSome: 'Nada mais foi alterado neste turno.' });
    expect(renderOperationReport([{ op: 'update', target: 'BK-1', outcome: 'success' }], { text })).toBe(
      'BK-1: done\nNada mais foi alterado neste turno.',
    );
  });

  it('falls back to the engine sentences when the host declares none', () => {
    expect(renderOperationReport([{ op: 'inform' }])).toBe(DEFAULT_ENGINE_TEXT.recordClosureNone);
  });
});
