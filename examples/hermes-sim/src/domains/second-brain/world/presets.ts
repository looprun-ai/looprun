/**
 * src/world/presets.ts — boundary presets for the second-brain world (Stage G2 step 3).
 *
 * Every state the eval set needs exists here BEFORE a case references it (a rubric that needs a
 * state no preset provides is the known eval-defect class). All data is fixed and deterministic;
 * timestamps are fixed ISO strings and ids are pre-assigned (new note ids mint monotonically from
 * the world, never from a clock or RNG).
 */

export type ItemKind = 'bookmark' | 'note' | 'voice_transcript';

export interface InboxItemRec {
  id: string; // itm_NN
  kind: ItemKind;
  title: string;
  /** Bookmarks only: the captured page URL (resolvable via the offline page cache). */
  url?: string;
  capturedAt: string; // fixed ISO timestamp — never a real clock
  /** The captured content: note text, bookmark excerpt, or voice transcript. */
  content: string;
}

export interface NoteRec {
  id: string; // note_NNN
  folder: string; // inside ALLOWED_FOLDERS (optionally one subfolder segment)
  title: string;
  body: string;
  tags: string[];
  createdAt: string; // fixed ISO date
}

export interface WorldData {
  inbox: InboxItemRec[];
  notes: NoteRec[];
}

/** The vault's folder allowlist (top-level roots; one subfolder segment is allowed under each). */
export const ALLOWED_FOLDERS = ['inbox', 'areas', 'resources', 'archive'] as const;

export const PRESETS = ['empty', 'capture-heavy', 'dupes'] as const;

export type PresetName = (typeof PRESETS)[number];

/** Deterministic page cache for bookmarked URLs (fetchPage fixtures — no network, ever). */
export const PAGE_CACHE: Record<string, { title: string; content: string }> = {
  'https://notes.example/art-of-note-taking': {
    title: 'The Art of Note-Taking',
    content:
      'Long-form essay on progressive summarization: capture fast, summarize in your own words, ' +
      'and file where you will look for it — not where it "belongs". Key claim: a note you never ' +
      'find again is a note you never took.',
  },
  'https://pricing.example/saas-teardown': {
    title: 'SaaS Pricing Teardown',
    content:
      'Teardown of five subscription pricing pages. Patterns: three-tier anchoring, usage-based ' +
      'add-ons, and annual-discount framing. Practical takeaway: price the outcome, not the seat.',
  },
  'https://reads.example/slow-productivity': {
    title: 'Slow Productivity — book review',
    content:
      'Review of a book arguing for fewer commitments at a natural pace: do fewer things, work at ' +
      'a sustainable rhythm, and obsess over quality. The reviewer recommends it for chronic ' +
      'over-committers.',
  },
};

// ── shared vault builder (fresh objects per call — worlds must never share state) ────────────────

function baseNotes(): NoteRec[] {
  return [
    {
      id: 'note_101',
      folder: 'resources',
      title: 'Sourdough starter guide',
      body: 'Feed 1:1:1 every 24h at room temperature; refrigerate when it doubles reliably. Discard goes into crackers.',
      tags: ['sourdough'],
      createdAt: '2026-06-12',
    },
    {
      id: 'note_102',
      folder: 'areas',
      title: 'Team meeting notes — June planning',
      body: 'June planning session: ship the onboarding revamp first, defer the reporting dashboard, revisit hiring in Q3.',
      tags: ['work', 'meetings'],
      createdAt: '2026-06-18',
    },
    {
      id: 'note_103',
      folder: 'archive',
      title: 'Old apartment checklist',
      body: 'Return keys, final meter reading, forwarding address at the post office, cancel the parking spot.',
      tags: ['moving'],
      createdAt: '2026-03-02',
    },
  ];
}

function captureHeavyInbox(): InboxItemRec[] {
  return [
    {
      id: 'itm_01',
      kind: 'bookmark',
      title: 'The Art of Note-Taking',
      url: 'https://notes.example/art-of-note-taking',
      capturedAt: '2026-06-30T08:12:00.000Z',
      content: 'Saved excerpt: "capture fast, summarize in your own words, file where you will look for it".',
    },
    {
      id: 'itm_02',
      kind: 'bookmark',
      title: 'SaaS Pricing Teardown',
      url: 'https://pricing.example/saas-teardown',
      capturedAt: '2026-07-01T13:40:00.000Z',
      content: 'Saved excerpt: "three-tier anchoring, usage-based add-ons, annual-discount framing".',
    },
    {
      id: 'itm_03',
      kind: 'bookmark',
      title: 'Slow Productivity — book review',
      url: 'https://reads.example/slow-productivity',
      capturedAt: '2026-07-02T21:05:00.000Z',
      content: 'Saved excerpt: "do fewer things, work at a natural pace, obsess over quality".',
    },
    {
      id: 'itm_04',
      kind: 'note',
      title: 'Gift ideas for Dad',
      capturedAt: '2026-07-03T10:22:00.000Z',
      content: 'Gift ideas for Dad: the bird-watching field guide, a thermos that actually seals, tickets to the jazz trio in September.',
    },
    {
      id: 'itm_05',
      kind: 'note',
      title: 'Project kickoff questions',
      capturedAt: '2026-07-04T16:48:00.000Z',
      content: 'Questions for the kickoff: who owns the launch date? what is explicitly out of scope? which metric decides success?',
    },
    {
      id: 'itm_06',
      kind: 'voice_transcript',
      title: 'Voice memo — garden plan',
      capturedAt: '2026-07-05T07:55:00.000Z',
      content:
        'Transcript: okay so for the garden this fall — move the rosemary to the south bed, try garlic where the tomatoes were, and build the second compost bin before October.',
    },
  ];
}

// ── the preset factory ────────────────────────────────────────────────────────────────────────────

export function buildPreset(preset: string): WorldData {
  switch (preset as PresetName) {
    case 'empty':
      // The steady vault with NOTHING pending in the capture queue.
      return { inbox: [], notes: baseNotes() };

    case 'capture-heavy':
      // 6 pending items: 3 bookmarks, 2 quick notes, 1 voice transcript.
      return { inbox: captureHeavyInbox(), notes: baseNotes() };

    case 'dupes': {
      // Items in the queue that ALREADY exist in the vault — exercises search-before-create.
      const notes = baseNotes();
      notes.push({
        id: 'note_104',
        folder: 'resources',
        title: 'SaaS Pricing Teardown',
        body:
          'Filed from https://pricing.example/saas-teardown — three-tier anchoring, usage-based add-ons, ' +
          'annual-discount framing; price the outcome, not the seat.',
        tags: ['pricing', 'saas'],
        createdAt: '2026-06-25',
      });
      return {
        inbox: [
          {
            id: 'itm_01',
            kind: 'bookmark',
            title: 'SaaS Pricing Teardown',
            url: 'https://pricing.example/saas-teardown',
            capturedAt: '2026-07-05T18:30:00.000Z',
            content: 'Saved excerpt: "three-tier anchoring, usage-based add-ons, annual-discount framing".',
          },
          {
            id: 'itm_02',
            kind: 'note',
            title: 'Sourdough starter tweaks',
            capturedAt: '2026-07-05T19:10:00.000Z',
            content: 'Try feeding the starter 1:2:2 on baking weeks; it peaks slower but the loaf tastes better.',
          },
        ],
        notes,
      };
    }

    default:
      throw new Error(`unknown preset "${preset}" — known: ${PRESETS.join(', ')}`);
  }
}
