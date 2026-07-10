/**
 * G2 world — a DETERMINISTIC in-memory world for BrightNest Home Services.
 *
 * Purity laws (lint-enforced): no wall clock, no entropy, no I/O anywhere — "now" is the fixed
 * REFERENCE_NOW constant; minted ids derive from (seed, counter). A destructive PROBE
 * (confirmed !== true) is side-effect-free; advanceTurn() never auto-finishes a user-gated action.
 * Every tool result follows { success: boolean, ... } with `label` for produced artifacts and
 * `requiresConfirmation: true` on destructive probes.
 */
import type { AgentWorld } from 'looprun';
import type {
  Category,
  JobRec,
  NotificationRec,
  PresetState,
  QuoteRec,
  RequestRec,
  TimeSlot,
} from './presets.js';
import { PRESETS, SERVICES, TECHNICIANS, TIME_SLOTS } from './presets.js';

/** The fixed reference clock — the ONLY notion of "now" in this world. */
export const REFERENCE_NOW = '2026-07-01T09:00:00.000Z';
export const TODAY = REFERENCE_NOW.slice(0, 10); // '2026-07-01'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Result = { success: boolean; [k: string]: unknown };

const fail = (error: string): Result => ({ success: false, error });

export class HomeServicesWorld implements AgentWorld {
  [k: string]: unknown;

  readonly toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> = [];
  readonly sseActions: unknown[] = [];

  private readonly state: PresetState;
  private readonly seed: number;
  private mintCounter = 0;
  private turnCounter = 0;
  private attachmentCounter = 0;
  private readonly attachments: string[] = [];
  readonly replies: Array<{ tool: string; text: string }> = [];

  constructor(preset: string, seed: number) {
    const make = PRESETS[preset];
    if (!make) throw new Error(`HomeServicesWorld: unknown preset "${preset}" (known: ${Object.keys(PRESETS).join(', ')})`);
    this.state = structuredClone(make());
    this.seed = seed;
  }

  // ── AgentWorld seams ─────────────────────────────────────────────────────────

  exec(name: string, args: Record<string, unknown>): unknown {
    const result = this.dispatch(name, args ?? {});
    this.toolCalls.push({ name, args, result, tookEffect: (result as Result).success !== false });
    return result;
  }

  advanceTurn(): void {
    // Nothing flips between turns: pending confirmations stay pending, probes stay effect-free.
    this.turnCounter += 1;
  }

  ingestAttachment(url: string): string {
    this.attachmentCounter += 1;
    const label = `att_${900 + this.attachmentCounter}`;
    this.attachments.push(`${label}:${url}`);
    return label;
  }

  // ── accessors a deterministic check / stateBlock may read ───────────────────

  projection(): Record<string, unknown> {
    const open = this.state.requests.filter((r) => r.status === 'open');
    const awaiting = this.state.quotes.filter((q) => q.status === 'sent');
    const scheduled = this.state.jobs.filter((j) => j.status === 'scheduled');
    const overdue = scheduled.filter((j) => j.date < TODAY);
    return {
      today: TODAY,
      customerCount: this.state.customers.length,
      openRequests: open.map((r) => `${r.id} (${this.serviceName(r.serviceId)}, ${r.urgency})`).join('; '),
      quotesAwaitingDecision: awaiting.map((q) => `${q.id} (${q.requestId}, $${q.amount})`).join('; '),
      scheduledJobs: scheduled.map((j) => `${j.id} (${j.date} ${j.timeSlot}, ${j.technicianId})`).join('; '),
      overdueJobs: overdue.map((j) => j.id).join('; '),
      notificationCount: this.state.notifications.length,
    };
  }

  hasCustomer(id: string): boolean {
    return this.state.customers.some((c) => c.id === id);
  }

  hasRequest(id: string): boolean {
    return this.state.requests.some((r) => r.id === id);
  }

  hasQuote(id: string): boolean {
    return this.state.quotes.some((q) => q.id === id);
  }

  hasJob(id: string): boolean {
    return this.state.jobs.some((j) => j.id === id);
  }

  requestHasAcceptedQuote(requestId: string): boolean {
    return this.state.quotes.some((q) => q.requestId === requestId && q.status === 'accepted');
  }

  jobStatus(jobId: string): string | null {
    return this.state.jobs.find((j) => j.id === jobId)?.status ?? null;
  }

  quoteStatus(quoteId: string): string | null {
    return this.state.quotes.find((q) => q.id === quoteId)?.status ?? null;
  }

  overdueJobIds(): string[] {
    return this.state.jobs.filter((j) => j.status === 'scheduled' && j.date < TODAY).map((j) => j.id);
  }

  /** Defensive seam for media-convention guards — this domain has no media labels. */
  hasMediaLabel(_label: string): boolean {
    return false;
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private mint(prefix: string): string {
    this.mintCounter += 1;
    return `${prefix}_${900 + this.seed * 40 + this.mintCounter}`;
  }

  private serviceName(serviceId: string): string {
    return SERVICES.find((s) => s.id === serviceId)?.name ?? serviceId;
  }

  private busySlots(technicianId: string, date: string, ignoreJobId?: string): TimeSlot[] {
    const fromJobs = this.state.jobs
      .filter((j) => j.technicianId === technicianId && j.date === date && j.status === 'scheduled' && j.id !== ignoreJobId)
      .map((j) => j.timeSlot);
    const fromBlocks = this.state.busyBlocks[technicianId]?.[date] ?? [];
    return TIME_SLOTS.filter((s) => fromJobs.includes(s) || fromBlocks.includes(s));
  }

  private slotFree(technicianId: string, date: string, slot: TimeSlot, ignoreJobId?: string): boolean {
    return !this.busySlots(technicianId, date, ignoreJobId).includes(slot);
  }

  private notify(customerId: string, channel: 'sms' | 'email', message: string): NotificationRec {
    const rec: NotificationRec = { id: this.mint('ntf'), customerId, channel, message };
    this.state.notifications.push(rec);
    return rec;
  }

  private dispatch(name: string, args: Record<string, unknown>): Result {
    switch (name) {
      // Terminal tools are runtime-owned; the world just records them.
      case 'replyToUser':
      case 'askUser': {
        this.replies.push({ tool: name, text: String(args.text ?? '') });
        return { success: true };
      }
      case 'listServices': return this.listServices(args);
      case 'findCustomer': return this.findCustomer(args);
      case 'createCustomer': return this.createCustomer(args);
      case 'createServiceRequest': return this.createServiceRequest(args);
      case 'getServiceRequest': return this.getServiceRequest(args);
      case 'listServiceRequests': return this.listServiceRequests(args);
      case 'createQuote': return this.createQuote(args);
      case 'sendQuote': return this.sendQuote(args);
      case 'recordQuoteDecision': return this.recordQuoteDecision(args);
      case 'scheduleJob': return this.scheduleJob(args);
      case 'rescheduleJob': return this.rescheduleJob(args);
      case 'cancelJob': return this.cancelJob(args);
      case 'assignTechnician': return this.assignTechnician(args);
      case 'listJobs': return this.listJobs(args);
      case 'listTechnicians': return this.listTechnicians(args);
      case 'getTechnicianAvailability': return this.getTechnicianAvailability(args);
      case 'sendNotification': return this.sendNotification(args);
      case 'listNotifications': return this.listNotifications(args);
      default:
        return fail(`unknown tool: ${name}`);
    }
  }

  private listServices(args: Record<string, unknown>): Result {
    const category = args.category as Category | undefined;
    const services = SERVICES.filter((s) => !category || s.category === category);
    return { success: true, services };
  }

  private findCustomer(args: Record<string, unknown>): Result {
    const query = String(args.query ?? '').trim().toLowerCase();
    if (!query) return fail('query is required');
    const matches = this.state.customers.filter((c) =>
      [c.name, c.phone, c.email ?? ''].some((f) => f.toLowerCase().includes(query)),
    );
    return { success: true, matches };
  }

  private createCustomer(args: Record<string, unknown>): Result {
    const name = String(args.name ?? '').trim();
    const phone = String(args.phone ?? '').trim();
    const address = String(args.address ?? '').trim();
    if (!name || !phone || !address) return fail('name, phone and address are required');
    const existing = this.state.customers.find((c) => c.phone === phone);
    if (existing) return fail(`a customer with phone ${phone} already exists: ${existing.id} (${existing.name})`);
    const id = this.mint('cust');
    const email = args.email === undefined ? undefined : String(args.email);
    this.state.customers.push({ id, name, phone, address, ...(email ? { email } : {}) });
    return { success: true, label: id, customerId: id };
  }

  private createServiceRequest(args: Record<string, unknown>): Result {
    const customerId = String(args.customerId ?? '');
    const serviceId = String(args.serviceId ?? '');
    const description = String(args.description ?? '').trim();
    const urgency = String(args.urgency ?? '');
    if (!this.hasCustomer(customerId)) return fail(`unknown customerId: ${customerId} — find or create the customer first`);
    const service = SERVICES.find((s) => s.id === serviceId);
    if (!service) return fail(`unknown serviceId: ${serviceId} — read listServices for the catalog`);
    if (!description) return fail('description is required');
    if (urgency !== 'routine' && urgency !== 'urgent') return fail("urgency must be 'routine' or 'urgent'");
    const id = this.mint('req');
    const rec: RequestRec = { id, customerId, serviceId, description, urgency, status: 'open' };
    this.state.requests.push(rec);
    return { success: true, label: id, requestId: id, status: 'open', service: service.name };
  }

  private requestView(r: RequestRec): Record<string, unknown> {
    const quote = this.state.quotes.find((q) => q.requestId === r.id && q.status !== 'declined')
      ?? this.state.quotes.find((q) => q.requestId === r.id);
    const job = this.state.jobs.find((j) => j.requestId === r.id && j.status === 'scheduled')
      ?? this.state.jobs.find((j) => j.requestId === r.id);
    return {
      ...r,
      service: this.serviceName(r.serviceId),
      quote: quote ? { quoteId: quote.id, amount: quote.amount, status: quote.status } : null,
      job: job ? { jobId: job.id, technicianId: job.technicianId, date: job.date, timeSlot: job.timeSlot, status: job.status } : null,
    };
  }

  private getServiceRequest(args: Record<string, unknown>): Result {
    const requestId = String(args.requestId ?? '');
    const rec = this.state.requests.find((r) => r.id === requestId);
    if (!rec) return fail(`no service request found with id ${requestId}`);
    return { success: true, request: this.requestView(rec) };
  }

  private listServiceRequests(args: Record<string, unknown>): Result {
    const status = args.status as RequestRec['status'] | undefined;
    const customerId = args.customerId as string | undefined;
    const requests = this.state.requests
      .filter((r) => (!status || r.status === status) && (!customerId || r.customerId === customerId))
      .map((r) => this.requestView(r));
    return { success: true, requests };
  }

  private createQuote(args: Record<string, unknown>): Result {
    const requestId = String(args.requestId ?? '');
    const amount = args.amount;
    const rec = this.state.requests.find((r) => r.id === requestId);
    if (!rec) return fail(`no service request found with id ${requestId}`);
    if (rec.status === 'cancelled' || rec.status === 'completed') return fail(`request ${requestId} is ${rec.status} — it cannot be quoted`);
    if (typeof amount !== 'number' || !(amount > 0)) return fail('amount must be a positive number');
    const active = this.state.quotes.find((q) => q.requestId === requestId && q.status !== 'declined');
    if (active) return fail(`request ${requestId} already has an active quote: ${active.id} (${active.status}) — a new quote is allowed only after a decline`);
    const id = this.mint('qt');
    const notes = args.notes === undefined ? undefined : String(args.notes);
    const quote: QuoteRec = { id, requestId, amount, status: 'draft', ...(notes ? { notes } : {}) };
    this.state.quotes.push(quote);
    return { success: true, label: id, quoteId: id, status: 'draft', amount };
  }

  private sendQuote(args: Record<string, unknown>): Result {
    const quoteId = String(args.quoteId ?? '');
    const quote = this.state.quotes.find((q) => q.id === quoteId);
    if (!quote) return fail(`no quote found with id ${quoteId}`);
    if (quote.status === 'sent') return fail(`quote ${quoteId} was already sent to the customer and is awaiting their decision`);
    if (quote.status !== 'draft') return fail(`quote ${quoteId} was already ${quote.status} — it cannot be re-sent`);
    quote.status = 'sent';
    const request = this.state.requests.find((r) => r.id === quote.requestId);
    if (request && request.status === 'open') request.status = 'quoted';
    if (request) this.notify(request.customerId, 'email', `Quote ${quote.id} for $${quote.amount} sent for ${request.id}.`);
    return { success: true, quoteId, status: 'sent' };
  }

  private recordQuoteDecision(args: Record<string, unknown>): Result {
    const quoteId = String(args.quoteId ?? '');
    const decision = String(args.decision ?? '');
    const quote = this.state.quotes.find((q) => q.id === quoteId);
    if (!quote) return fail(`no quote found with id ${quoteId}`);
    if (decision !== 'accepted' && decision !== 'declined') return fail("decision must be 'accepted' or 'declined'");
    if (quote.status === 'draft') return fail(`quote ${quoteId} has not been sent yet — send it before recording a decision`);
    if (quote.status !== 'sent') return fail(`quote ${quoteId} was already ${quote.status}`);
    quote.status = decision;
    const request = this.state.requests.find((r) => r.id === quote.requestId);
    if (request && decision === 'declined' && request.status === 'quoted') request.status = 'open';
    return { success: true, quoteId, status: decision };
  }

  private scheduleJob(args: Record<string, unknown>): Result {
    const requestId = String(args.requestId ?? '');
    const technicianId = String(args.technicianId ?? '');
    const date = String(args.date ?? '');
    const timeSlot = args.timeSlot as TimeSlot;
    const request = this.state.requests.find((r) => r.id === requestId);
    if (!request) return fail(`no service request found with id ${requestId}`);
    if (!this.requestHasAcceptedQuote(requestId)) return fail(`request ${requestId} has no ACCEPTED quote — scheduling requires the customer's acceptance`);
    const existing = this.state.jobs.find((j) => j.requestId === requestId && j.status === 'scheduled');
    if (existing) return fail(`request ${requestId} already has a scheduled job: ${existing.id} (${existing.date} ${existing.timeSlot}) — reschedule it instead`);
    const tech = TECHNICIANS.find((t) => t.id === technicianId);
    if (!tech) return fail(`unknown technicianId: ${technicianId} — read listTechnicians for the roster`);
    const service = SERVICES.find((s) => s.id === request.serviceId);
    if (service && !tech.skills.includes(service.category)) {
      return fail(`${tech.name} (${technicianId}) is not qualified for ${service.category} work — pick a technician with that skill`);
    }
    if (!DATE_RE.test(date)) return fail('date must be YYYY-MM-DD');
    if (date < TODAY) return fail(`cannot schedule in the past (today is ${TODAY})`);
    if (!TIME_SLOTS.includes(timeSlot)) return fail(`timeSlot must be one of: ${TIME_SLOTS.join(', ')}`);
    if (!this.slotFree(technicianId, date, timeSlot)) {
      return fail(`${tech.name} (${technicianId}) is not available on ${date} ${timeSlot} — check getTechnicianAvailability`);
    }
    const id = this.mint('job');
    const job: JobRec = { id, requestId, customerId: request.customerId, technicianId, date, timeSlot, status: 'scheduled' };
    this.state.jobs.push(job);
    request.status = 'scheduled';
    return { success: true, label: id, jobId: id, requestId, technicianId, date, timeSlot, status: 'scheduled' };
  }

  private rescheduleJob(args: Record<string, unknown>): Result {
    const jobId = String(args.jobId ?? '');
    const date = String(args.date ?? '');
    const timeSlot = args.timeSlot as TimeSlot;
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!job) return fail(`no job found with id ${jobId}`);
    if (job.status !== 'scheduled') return fail(`job ${jobId} is ${job.status} — only scheduled jobs can be rescheduled`);
    if (!DATE_RE.test(date)) return fail('date must be YYYY-MM-DD');
    if (date < TODAY) return fail(`cannot reschedule into the past (today is ${TODAY})`);
    if (!TIME_SLOTS.includes(timeSlot)) return fail(`timeSlot must be one of: ${TIME_SLOTS.join(', ')}`);
    if (!this.slotFree(job.technicianId, date, timeSlot, job.id)) {
      return fail(`${job.technicianId} is not available on ${date} ${timeSlot} — check getTechnicianAvailability or assign another technician`);
    }
    job.date = date;
    job.timeSlot = timeSlot;
    return { success: true, jobId, technicianId: job.technicianId, date, timeSlot, status: 'scheduled' };
  }

  private cancelJob(args: Record<string, unknown>): Result {
    const jobId = String(args.jobId ?? '');
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!job) return fail(`no job found with id ${jobId}`);
    if (job.status !== 'scheduled') return fail(`job ${jobId} is already ${job.status}`);
    if (args.confirmed !== true) {
      // Side-effect-free PROBE.
      return {
        success: true,
        requiresConfirmation: true,
        question: `Cancel job ${job.id} (${job.date} ${job.timeSlot}, ${job.technicianId})? This cannot be undone. Please confirm.`,
      };
    }
    job.status = 'cancelled';
    const request = this.state.requests.find((r) => r.id === job.requestId);
    if (request && request.status === 'scheduled') {
      request.status = this.requestHasAcceptedQuote(request.id) ? 'quoted' : 'open';
    }
    return { success: true, jobId, status: 'cancelled', reason: args.reason === undefined ? null : String(args.reason) };
  }

  private assignTechnician(args: Record<string, unknown>): Result {
    const jobId = String(args.jobId ?? '');
    const technicianId = String(args.technicianId ?? '');
    const job = this.state.jobs.find((j) => j.id === jobId);
    if (!job) return fail(`no job found with id ${jobId}`);
    if (job.status !== 'scheduled') return fail(`job ${jobId} is ${job.status} — only scheduled jobs can be reassigned`);
    const tech = TECHNICIANS.find((t) => t.id === technicianId);
    if (!tech) return fail(`unknown technicianId: ${technicianId} — read listTechnicians for the roster`);
    const request = this.state.requests.find((r) => r.id === job.requestId);
    const service = request ? SERVICES.find((s) => s.id === request.serviceId) : undefined;
    if (service && !tech.skills.includes(service.category)) {
      return fail(`${tech.name} (${technicianId}) is not qualified for ${service.category} work — pick a technician with that skill`);
    }
    if (!this.slotFree(technicianId, job.date, job.timeSlot, job.id)) {
      return fail(`${tech.name} (${technicianId}) is not available on ${job.date} ${job.timeSlot} — check getTechnicianAvailability`);
    }
    job.technicianId = technicianId;
    return { success: true, jobId, technicianId, date: job.date, timeSlot: job.timeSlot, status: 'scheduled' };
  }

  private listJobs(args: Record<string, unknown>): Result {
    const status = args.status as JobRec['status'] | undefined;
    const customerId = args.customerId as string | undefined;
    const technicianId = args.technicianId as string | undefined;
    const jobs = this.state.jobs
      .filter((j) => (!status || j.status === status) && (!customerId || j.customerId === customerId) && (!technicianId || j.technicianId === technicianId))
      .map((j) => ({
        ...j,
        service: this.serviceName(this.state.requests.find((r) => r.id === j.requestId)?.serviceId ?? ''),
        overdue: j.status === 'scheduled' && j.date < TODAY,
      }));
    return { success: true, today: TODAY, jobs };
  }

  private listTechnicians(args: Record<string, unknown>): Result {
    const skill = args.skill as Category | undefined;
    const technicians = TECHNICIANS.filter((t) => !skill || t.skills.includes(skill));
    return { success: true, technicians };
  }

  private getTechnicianAvailability(args: Record<string, unknown>): Result {
    const technicianId = String(args.technicianId ?? '');
    const date = String(args.date ?? '');
    const tech = TECHNICIANS.find((t) => t.id === technicianId);
    if (!tech) return fail(`unknown technicianId: ${technicianId} — read listTechnicians for the roster`);
    if (!DATE_RE.test(date)) return fail('date must be YYYY-MM-DD');
    const busySlots = this.busySlots(technicianId, date);
    const freeSlots = TIME_SLOTS.filter((s) => !busySlots.includes(s));
    return { success: true, technicianId, name: tech.name, date, freeSlots, busySlots };
  }

  private sendNotification(args: Record<string, unknown>): Result {
    const customerId = String(args.customerId ?? '');
    const channel = String(args.channel ?? '');
    const message = String(args.message ?? '').trim();
    if (!this.hasCustomer(customerId)) return fail(`unknown customerId: ${customerId}`);
    if (channel !== 'sms' && channel !== 'email') return fail("channel must be 'sms' or 'email'");
    if (!message) return fail('message is required');
    const rec = this.notify(customerId, channel, message);
    return { success: true, label: rec.id, notificationId: rec.id, channel, customerId };
  }

  private listNotifications(args: Record<string, unknown>): Result {
    const customerId = args.customerId as string | undefined;
    const notifications = this.state.notifications.filter((n) => !customerId || n.customerId === customerId);
    return { success: true, notifications };
  }
}

/** The eval/config seam: a fresh deterministic world per (preset, seed=rep). */
export function worldFactory(preset: string, seed: number): HomeServicesWorld {
  return new HomeServicesWorld(preset, seed);
}
