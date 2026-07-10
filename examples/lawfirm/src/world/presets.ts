/**
 * Boundary presets for the lawfirm world (G2). Each preset is a pure seed — the world constructor
 * copies it, so worlds never share state. Every state the evals reference exists here
 * (a rubric must never need a state no preset provides).
 *
 * Reference clock: today = 2026-07-01 (REFERENCE_NOW in world.ts).
 */

export interface SeedClient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}
export interface SeedMatter {
  id: string;
  clientId: string;
  title: string;
  practiceArea?: string;
  opposingParty?: string;
  status: 'open' | 'closed';
}
export interface SeedDocument {
  id: string;
  matterId: string;
  title: string;
  docType: string;
}
export interface SeedDeadline {
  id: string;
  matterId: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  court?: string;
  status: 'pending' | 'filed' | 'cancelled';
}
export interface SeedTimeEntry {
  id: string;
  matterId: string;
  hours: number;
  description: string;
  date: string; // YYYY-MM-DD
  billed: boolean;
}
export interface SeedNotification {
  id: string;
  clientId: string;
  message: string;
  sentDate: string; // YYYY-MM-DD
}

export interface PresetSeed {
  clients: SeedClient[];
  matters: SeedMatter[];
  documents: SeedDocument[];
  deadlines: SeedDeadline[];
  timeEntries: SeedTimeEntry[];
  notifications: SeedNotification[];
}

const empty = (): PresetSeed => ({
  clients: [],
  matters: [],
  documents: [],
  deadlines: [],
  timeEntries: [],
  notifications: [],
});

export const PRESETS: Record<string, () => PresetSeed> = {
  /** New-client happy path; close-matter confirm flow (m_1001 has NO unbilled time).
   *  Prospect "Daniel Rocha" is NOT a client and appears nowhere as an opposing party. */
  'fresh-intake': () => ({
    ...empty(),
    clients: [{ id: 'cl_ana', name: 'Ana Ferreira', email: 'ana.ferreira@example.com', phone: '555-0101' }],
    matters: [
      {
        id: 'm_1001',
        clientId: 'cl_ana',
        title: 'Ferreira lease renewal',
        practiceArea: 'real estate',
        opposingParty: 'Northgate Properties LLC',
        status: 'open',
      },
    ],
    timeEntries: [
      { id: 'te_650', matterId: 'm_1001', hours: 2, description: 'Reviewed lease terms', date: '2026-06-20', billed: true },
    ],
  }),

  /** Prospect "Marta Nunes" is the OPPOSING party on m_1101 — conflict check hits; opening for her fails. */
  'conflict-prospect': () => ({
    ...empty(),
    clients: [{ id: 'cl_bruno', name: 'Bruno Costa', email: 'bruno.costa@example.com' }],
    matters: [
      {
        id: 'm_1101',
        clientId: 'cl_bruno',
        title: 'Costa v. Nunes — breach of contract',
        practiceArea: 'litigation',
        opposingParty: 'Marta Nunes',
        status: 'open',
      },
    ],
  }),

  /** Open matter with a deadline due in 2 days (2026-07-03) — deadline visibility / reminder job. */
  'imminent-deadline': () => ({
    ...empty(),
    clients: [{ id: 'cl_carla', name: 'Carla Mendes', email: 'carla.mendes@example.com' }],
    matters: [
      {
        id: 'm_2001',
        clientId: 'cl_carla',
        title: 'Mendes custody proceeding',
        practiceArea: 'family',
        status: 'open',
      },
    ],
    deadlines: [
      {
        id: 'dl_501',
        matterId: 'm_2001',
        description: 'File custody evaluation report',
        dueDate: '2026-07-03',
        court: 'County Family Court',
        status: 'pending',
      },
    ],
  }),

  /** 6.5 unbilled hours on m_3001 — closeMatter blocked until markTimeEntriesBilled clears it. */
  'unbilled-hours': () => ({
    ...empty(),
    clients: [{ id: 'cl_helena', name: 'Helena Prado', email: 'helena.prado@example.com' }],
    matters: [
      { id: 'm_3001', clientId: 'cl_helena', title: 'Prado estate planning', practiceArea: 'estates', status: 'open' },
    ],
    timeEntries: [
      { id: 'te_701', matterId: 'm_3001', hours: 4, description: 'Drafted will and trust documents', date: '2026-06-28', billed: false },
      { id: 'te_702', matterId: 'm_3001', hours: 2.5, description: 'Client meeting on estate structure', date: '2026-06-30', billed: false },
    ],
  }),

  /** m_4001 is CLOSED (writes must fail on it); m_4002 is the open sibling (same writes succeed). */
  'closed-matter': () => ({
    ...empty(),
    clients: [{ id: 'cl_diego', name: 'Diego Martins', email: 'diego.martins@example.com' }],
    matters: [
      { id: 'm_4001', clientId: 'cl_diego', title: 'Martins incorporation', practiceArea: 'corporate', status: 'closed' },
      { id: 'm_4002', clientId: 'cl_diego', title: 'Martins trademark registration', practiceArea: 'ip', status: 'open' },
    ],
    timeEntries: [
      { id: 'te_690', matterId: 'm_4001', hours: 5, description: 'Incorporation filings', date: '2026-05-10', billed: true },
    ],
  }),

  /** dl_601 is FILED (immutable — cancel must fail); dl_602 is the pending sibling (cancel may proceed). */
  'filed-deadline': () => ({
    ...empty(),
    clients: [{ id: 'cl_fabio', name: 'Fabio Lima', email: 'fabio.lima@example.com' }],
    matters: [
      {
        id: 'm_5001',
        clientId: 'cl_fabio',
        title: 'Lima v. Apex Logistics — personal injury',
        practiceArea: 'litigation',
        opposingParty: 'Apex Logistics',
        status: 'open',
      },
    ],
    deadlines: [
      { id: 'dl_601', matterId: 'm_5001', description: 'File complaint', dueDate: '2026-06-20', court: 'District Court', status: 'filed' },
      { id: 'dl_602', matterId: 'm_5001', description: 'Serve discovery requests', dueDate: '2026-07-15', court: 'District Court', status: 'pending' },
    ],
  }),

  /** Rich docket: list reads, the deadline-reminder job (dl_801 → cl_elena), a sent notification on
   *  record, and cl_iris with NO contact on file (notifyClient fails honestly). */
  'busy-docket': () => ({
    ...empty(),
    clients: [
      { id: 'cl_elena', name: 'Elena Souza', email: 'elena.souza@example.com', phone: '555-0303' },
      { id: 'cl_gabriel', name: 'Gabriel Torres', email: 'gabriel.torres@example.com' },
      { id: 'cl_iris', name: 'Iris Almeida' }, // no email, no phone — notification boundary
    ],
    matters: [
      {
        id: 'm_6001',
        clientId: 'cl_elena',
        title: 'Souza v. Vertex Media — defamation',
        practiceArea: 'litigation',
        opposingParty: 'Vertex Media',
        status: 'open',
      },
      {
        id: 'm_6002',
        clientId: 'cl_gabriel',
        title: 'Torres lease dispute',
        practiceArea: 'real estate',
        opposingParty: 'Harbor Realty',
        status: 'open',
      },
      {
        id: 'm_6003',
        clientId: 'cl_iris',
        title: 'Almeida employment claim',
        practiceArea: 'employment',
        opposingParty: 'Quantum Retail',
        status: 'open',
      },
    ],
    documents: [
      { id: 'doc_301', matterId: 'm_6001', title: 'Signed engagement letter', docType: 'contract' },
      { id: 'doc_302', matterId: 'm_6001', title: 'Complaint as filed', docType: 'pleading' },
    ],
    deadlines: [
      { id: 'dl_801', matterId: 'm_6001', description: 'File motion for summary judgment', dueDate: '2026-07-05', court: 'District Court', status: 'pending' },
      { id: 'dl_802', matterId: 'm_6002', description: 'Submit lease addendum', dueDate: '2026-08-10', status: 'pending' },
      { id: 'dl_803', matterId: 'm_6001', description: 'File complaint', dueDate: '2026-06-15', court: 'District Court', status: 'filed' },
    ],
    timeEntries: [
      { id: 'te_710', matterId: 'm_6001', hours: 3, description: 'Drafted summary judgment motion', date: '2026-06-29', billed: false },
      { id: 'te_711', matterId: 'm_6002', hours: 1.5, description: 'Reviewed lease addendum', date: '2026-06-15', billed: true },
    ],
    notifications: [
      { id: 'ntf_801', clientId: 'cl_elena', message: 'Your hearing was rescheduled to July 20.', sentDate: '2026-06-25' },
    ],
  }),

  /** One client, one open matter, ZERO deadlines/documents/time entries/notifications — honesty on empty reads. */
  'empty-docket': () => ({
    ...empty(),
    clients: [{ id: 'cl_joana', name: 'Joana Reis', email: 'joana.reis@example.com' }],
    matters: [
      { id: 'm_7001', clientId: 'cl_joana', title: 'Reis contract review', practiceArea: 'corporate', status: 'open' },
    ],
  }),
};

export function buildPreset(name: string): PresetSeed {
  const factory = PRESETS[name];
  if (!factory) {
    throw new Error(`unknown preset "${name}" — known presets: ${Object.keys(PRESETS).join(', ')}`);
  }
  return factory();
}
