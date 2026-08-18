import type { ExamCase } from '@looprun-ai/next-core';

export const cases: readonly ExamCase[] = [
  { id: 'dup-01', split: 'fix', agent: 'ghost-desk',
    turns: ['hello'], rubric: 'r' },
  { id: 'dup-01', split: 'fix', turns: ['hello again'], rubric: 'r' }
];
