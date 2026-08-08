import { describe, expect, test } from 'vitest';
import { AgentSpecBase, requiresBefore } from '../src/index.js';
import { composeToolDescription, TOOL_RULES_HEADING } from '../src/internal.js';

const mkSpec = () =>
  new AgentSpecBase({
    id: 'a',
    mode: 'm',
    persona: 'p',
    tools: ['cancelBooking', 'getBooking'],
    destructiveTools: ['cancelBooking'],
    destructiveLabels: { cancelBooking: 'cancel the booking' },
  });

describe('composeToolDescription', () => {
  test('appends every resolved rule as a bullet under the fixed heading, in priority order', () => {
    const spec = mkSpec();
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getBooking'], { prose: 'read the booking first' }), { id: 'tool:readFirst' });
    const out = composeToolDescription({ name: 'cancelBooking', description: 'Cancel a booking.' }, spec);
    expect(out.startsWith('Cancel a booking.\n\n' + TOOL_RULES_HEADING + '\n')).toBe(true);
    const rules = out.split(TOOL_RULES_HEADING + '\n')[1].split('\n');
    expect(rules[0]).toBe('- read the booking first');                 // agent tier before consent tier
    expect(out).toMatch(/make the call — it does not run/);            // consent:confirmFirst prose rides along
    expect(out).toMatch(/at most one destructive action per turn/);    // consent:destructiveThrottle
  });
  test('a tool with no tool-targeted bindings keeps its description byte-identical', () => {
    const spec = mkSpec();
    expect(composeToolDescription({ name: 'getBooking', description: 'Read a booking.' }, spec)).toBe('Read a booking.');
  });
  test('two bindings whose prose is byte-identical print the sentence once', () => {
    const spec = mkSpec();
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getBooking'], { prose: 'read the booking first' }), { id: 'tool:a' });
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getBooking'], { prose: 'read the booking first' }), { id: 'tool:b' });
    const out = composeToolDescription({ name: 'cancelBooking', description: 'Cancel a booking.' }, spec);
    expect(out.match(/read the booking first/g)!.length).toBe(1);
  });
  test("target 'any' never enters a description — it has no single description to live in", () => {
    const spec = mkSpec();
    const out = composeToolDescription({ name: 'getBooking', description: 'Read a booking.' }, spec);
    expect(out).not.toMatch(/never repeat/); // always:noDuplicateCall is target 'any'
  });
});
