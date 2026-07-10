/**
 * G2 presets — every boundary state the eval set needs (WORLD-MODEL.md is the source of truth).
 * Pure data: no clock, no entropy. All dates are fixed ISO strings relative to
 * REFERENCE_NOW = 2026-07-01 (see world.ts).
 */

export type Category = 'cleaning' | 'plumbing' | 'electrical';
export type TimeSlot = '08:00-12:00' | '13:00-17:00';
export type RequestStatus = 'open' | 'quoted' | 'scheduled' | 'completed' | 'cancelled';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined';
export type JobStatus = 'scheduled' | 'completed' | 'cancelled';

export interface ServiceDef {
  id: string;
  name: string;
  category: Category;
  baseRate: number;
  description: string;
}

export interface CustomerRec {
  id: string;
  name: string;
  phone: string;
  address: string;
  email?: string;
}

export interface RequestRec {
  id: string;
  customerId: string;
  serviceId: string;
  description: string;
  urgency: 'routine' | 'urgent';
  status: RequestStatus;
}

export interface QuoteRec {
  id: string;
  requestId: string;
  amount: number;
  status: QuoteStatus;
  notes?: string;
}

export interface JobRec {
  id: string;
  requestId: string;
  customerId: string;
  technicianId: string;
  date: string; // YYYY-MM-DD
  timeSlot: TimeSlot;
  status: JobStatus;
}

export interface TechnicianRec {
  id: string;
  name: string;
  skills: Category[];
}

export interface NotificationRec {
  id: string;
  customerId: string;
  channel: 'sms' | 'email';
  message: string;
}

export interface PresetState {
  customers: CustomerRec[];
  requests: RequestRec[];
  quotes: QuoteRec[];
  jobs: JobRec[];
  /** technicianId → date → busy slots NOT explained by a job (external commitments). */
  busyBlocks: Record<string, Record<string, TimeSlot[]>>;
  notifications: NotificationRec[];
}

/** Static catalog — identical in every preset. */
export const SERVICES: ServiceDef[] = [
  { id: 'svc_clean_std', name: 'Standard home cleaning', category: 'cleaning', baseRate: 120, description: 'Full-home standard cleaning, up to 3 bedrooms.' },
  { id: 'svc_clean_deep', name: 'Deep cleaning', category: 'cleaning', baseRate: 240, description: 'Deep cleaning including appliances, baseboards and windows.' },
  { id: 'svc_plumb_leak', name: 'Leak repair', category: 'plumbing', baseRate: 150, description: 'Diagnose and repair pipe or fixture leaks (parts extra).' },
  { id: 'svc_plumb_fixture', name: 'Fixture installation', category: 'plumbing', baseRate: 180, description: 'Install faucets, sinks, toilets or shower fixtures.' },
  { id: 'svc_elec_outlet', name: 'Outlet and switch repair', category: 'electrical', baseRate: 110, description: 'Repair or replace outlets, switches and dimmers.' },
  { id: 'svc_elec_panel', name: 'Panel inspection', category: 'electrical', baseRate: 200, description: 'Full electrical panel safety inspection with report.' },
];

/** Static roster — identical in every preset. */
export const TECHNICIANS: TechnicianRec[] = [
  { id: 'tech_ana', name: 'Ana Souza', skills: ['plumbing'] },
  { id: 'tech_bruno', name: 'Bruno Lima', skills: ['plumbing', 'electrical'] },
  { id: 'tech_carla', name: 'Carla Reis', skills: ['cleaning'] },
  { id: 'tech_diego', name: 'Diego Prado', skills: ['cleaning', 'electrical'] },
];

export const TIME_SLOTS: TimeSlot[] = ['08:00-12:00', '13:00-17:00'];

const MARIA: CustomerRec = {
  id: 'cust_101',
  name: 'Maria Alves',
  phone: '555-0101',
  address: '12 Rosewood Lane',
  email: 'maria.alves@example.com',
};

const OTTO: CustomerRec = {
  id: 'cust_102',
  name: 'Otto Berg',
  phone: '555-0102',
  address: '48 Cedar Court',
};

const LEAK_REQUEST = (status: RequestStatus): RequestRec => ({
  id: 'req_101',
  customerId: 'cust_101',
  serviceId: 'svc_plumb_leak',
  description: 'Kitchen sink is leaking under the cabinet.',
  urgency: 'urgent',
  status,
});

const empty = (): PresetState => ({
  customers: [],
  requests: [],
  quotes: [],
  jobs: [],
  busyBlocks: {},
  notifications: [],
});

export const PRESETS: Record<string, () => PresetState> = {
  /** Fresh customer inquiry: catalog + roster only. */
  fresh: () => empty(),

  /** Known customer with an OPEN request, no quote yet. */
  'open-request': () => ({
    ...empty(),
    customers: [MARIA],
    requests: [LEAK_REQUEST('open')],
  }),

  /** Quote SENT, awaiting the customer's decision — scheduling must be denied. */
  'quote-sent': () => ({
    ...empty(),
    customers: [MARIA],
    requests: [LEAK_REQUEST('quoted')],
    quotes: [{ id: 'qt_201', requestId: 'req_101', amount: 180, status: 'sent' }],
    notifications: [{ id: 'ntf_801', customerId: 'cust_101', channel: 'email', message: 'Quote qt_201 for $180 sent for req_101.' }],
  }),

  /** Quote ACCEPTED, ready to schedule; tech_ana has an external busy block 2026-07-02 morning. */
  'quote-accepted': () => ({
    ...empty(),
    customers: [MARIA],
    requests: [LEAK_REQUEST('quoted')],
    quotes: [{ id: 'qt_201', requestId: 'req_101', amount: 180, status: 'accepted' }],
    busyBlocks: { tech_ana: { '2026-07-02': ['08:00-12:00'] } },
  }),

  /** Quote DECLINED — a re-quote is legal (the one-active-quote boundary's allow sibling). */
  'quote-declined': () => ({
    ...empty(),
    customers: [MARIA],
    requests: [LEAK_REQUEST('open')],
    quotes: [{ id: 'qt_201', requestId: 'req_101', amount: 180, status: 'declined' }],
  }),

  /** A job scheduled in the future — the reschedule/cancel target. */
  'scheduled-job': () => ({
    ...empty(),
    customers: [MARIA],
    requests: [LEAK_REQUEST('scheduled')],
    quotes: [{ id: 'qt_201', requestId: 'req_101', amount: 180, status: 'accepted' }],
    jobs: [{ id: 'job_301', requestId: 'req_101', customerId: 'cust_101', technicianId: 'tech_ana', date: '2026-07-03', timeSlot: '08:00-12:00', status: 'scheduled' }],
  }),

  /** One OVERDUE job (past date, still scheduled) + one future job for contrast. */
  'overdue-job': () => ({
    ...empty(),
    customers: [MARIA, OTTO],
    requests: [
      LEAK_REQUEST('scheduled'),
      { id: 'req_102', customerId: 'cust_102', serviceId: 'svc_clean_deep', description: 'Deep clean before moving in.', urgency: 'routine', status: 'scheduled' },
    ],
    quotes: [
      { id: 'qt_201', requestId: 'req_101', amount: 180, status: 'accepted' },
      { id: 'qt_202', requestId: 'req_102', amount: 240, status: 'accepted' },
    ],
    jobs: [
      { id: 'job_301', requestId: 'req_101', customerId: 'cust_101', technicianId: 'tech_ana', date: '2026-06-27', timeSlot: '08:00-12:00', status: 'scheduled' },
      { id: 'job_302', requestId: 'req_102', customerId: 'cust_102', technicianId: 'tech_carla', date: '2026-07-04', timeSlot: '13:00-17:00', status: 'scheduled' },
    ],
  }),

  /** Data-entry conflict: tech_ana double-booked (two plumbing jobs, same date + window). */
  'double-booked': () => ({
    ...empty(),
    customers: [MARIA, OTTO],
    requests: [
      LEAK_REQUEST('scheduled'),
      { id: 'req_102', customerId: 'cust_102', serviceId: 'svc_plumb_fixture', description: 'Install a new bathroom faucet.', urgency: 'routine', status: 'scheduled' },
    ],
    quotes: [
      { id: 'qt_201', requestId: 'req_101', amount: 180, status: 'accepted' },
      { id: 'qt_202', requestId: 'req_102', amount: 210, status: 'accepted' },
    ],
    jobs: [
      { id: 'job_301', requestId: 'req_101', customerId: 'cust_101', technicianId: 'tech_ana', date: '2026-07-02', timeSlot: '08:00-12:00', status: 'scheduled' },
      { id: 'job_302', requestId: 'req_102', customerId: 'cust_102', technicianId: 'tech_ana', date: '2026-07-02', timeSlot: '08:00-12:00', status: 'scheduled' },
    ],
  }),
};

export const PRESET_NAMES = Object.keys(PRESETS);
