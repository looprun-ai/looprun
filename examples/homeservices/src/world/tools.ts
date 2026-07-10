/**
 * G2 tool surface — TOOL_DEFS materialized from the G1-generated `tools.json` (the pipeline's hard
 * vocabulary; keep both in sync — tools.json is the provenance artifact, this file is the runtime
 * export). Terminal tools (replyToUser/askUser) are runtime-owned and NOT defined here.
 */
import type { ToolDef } from 'looprun';

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'listServices',
    description:
      'Read the service catalog (id, name, category, base rate, description). Optionally filter by category. This is the ONLY source of offered services and prices.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['cleaning', 'plumbing', 'electrical'], description: 'Optional category filter.' },
      },
      required: [],
    },
  },
  {
    name: 'findCustomer',
    description:
      'Search customers by name, phone or email (case-insensitive substring). Returns matches (possibly empty). Always search before creating a customer.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Name, phone or email fragment.' } },
      required: ['query'],
    },
  },
  {
    name: 'createCustomer',
    description:
      'Create a customer record. Fails if a customer with the same phone already exists — search with findCustomer first. Returns the new cust_ id as label.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['name', 'phone', 'address'],
    },
  },
  {
    name: 'createServiceRequest',
    description:
      "Open a service request for an EXISTING customer (real cust_ id) and an EXISTING catalog service (real svc_ id). Returns the new req_ id as label. New requests start in status 'open'.",
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', pattern: '^cust_[a-z0-9]+$' },
        serviceId: { type: 'string', pattern: '^svc_[a-z0-9_]+$' },
        description: { type: 'string', description: 'What the customer needs, in their words.' },
        urgency: { type: 'string', enum: ['routine', 'urgent'] },
      },
      required: ['customerId', 'serviceId', 'description', 'urgency'],
    },
  },
  {
    name: 'getServiceRequest',
    description:
      'Read one service request by req_ id: status, customer, service, plus its quote summary (qt_ id, amount, quote status) and job summary (job_ id, date, window) when they exist. Fails honestly when the id does not exist.',
    inputSchema: {
      type: 'object',
      properties: { requestId: { type: 'string', pattern: '^req_[a-z0-9]+$' } },
      required: ['requestId'],
    },
  },
  {
    name: 'listServiceRequests',
    description:
      "List service requests, optionally filtered by status and/or customer. The honest source for 'what is open / quoted / scheduled'.",
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'quoted', 'scheduled', 'completed', 'cancelled'] },
        customerId: { type: 'string', pattern: '^cust_[a-z0-9]+$' },
      },
      required: [],
    },
  },
  {
    name: 'createQuote',
    description:
      'Create a DRAFT quote for an existing request. Fails when the request already has an active (draft/sent/accepted) quote — a new quote is allowed only when the previous one was declined. Returns the new qt_ id as label. A draft is NOT visible to the customer until sendQuote.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', pattern: '^req_[a-z0-9]+$' },
        amount: { type: 'number', description: 'Total quoted amount in USD.' },
        notes: { type: 'string' },
      },
      required: ['requestId', 'amount'],
    },
  },
  {
    name: 'sendQuote',
    description:
      "Send a DRAFT quote to the customer (marks it 'sent', sets the request to 'quoted', and logs an email notification). Fails when the quote was already sent, accepted or declined.",
    inputSchema: {
      type: 'object',
      properties: { quoteId: { type: 'string', pattern: '^qt_[a-z0-9]+$' } },
      required: ['quoteId'],
    },
  },
  {
    name: 'recordQuoteDecision',
    description:
      "Record the customer's decision on a SENT quote: 'accepted' or 'declined' (e.g. communicated by phone). Fails when the quote is still a draft or was already decided. Scheduling requires an accepted quote.",
    inputSchema: {
      type: 'object',
      properties: {
        quoteId: { type: 'string', pattern: '^qt_[a-z0-9]+$' },
        decision: { type: 'string', enum: ['accepted', 'declined'] },
      },
      required: ['quoteId', 'decision'],
    },
  },
  {
    name: 'scheduleJob',
    description:
      "Book a job for a request: requires the request's quote ACCEPTED, a technician with the service's skill, a valid future date (YYYY-MM-DD) and a free time window. Returns the new job_ id as label and sets the request to 'scheduled'.",
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', pattern: '^req_[a-z0-9]+$' },
        technicianId: { type: 'string', pattern: '^tech_[a-z0-9]+$' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        timeSlot: { type: 'string', enum: ['08:00-12:00', '13:00-17:00'] },
      },
      required: ['requestId', 'technicianId', 'date', 'timeSlot'],
    },
  },
  {
    name: 'rescheduleJob',
    description:
      'Move a SCHEDULED job to a new date and/or time window (its technician must be free there). Not destructive — act directly when the user asks. Fails on completed or cancelled jobs.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', pattern: '^job_[a-z0-9]+$' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        timeSlot: { type: 'string', enum: ['08:00-12:00', '13:00-17:00'] },
      },
      required: ['jobId', 'date', 'timeSlot'],
    },
  },
  {
    name: 'cancelJob',
    description:
      'Cancel a scheduled job — DESTRUCTIVE, two-step: call WITHOUT confirmed:true first; the tool returns a confirmation question to relay to the user; call again with confirmed:true ONLY after the user explicitly agrees in a later turn. Cancellation cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', pattern: '^job_[a-z0-9]+$' },
        reason: { type: 'string' },
        confirmed: { type: 'boolean', description: 'true ONLY after explicit user confirmation in a later turn.' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'assignTechnician',
    description:
      "Replace the technician on a SCHEDULED job (keeps date and window). The new technician must have the service's skill and be free in that window.",
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', pattern: '^job_[a-z0-9]+$' },
        technicianId: { type: 'string', pattern: '^tech_[a-z0-9]+$' },
      },
      required: ['jobId', 'technicianId'],
    },
  },
  {
    name: 'listJobs',
    description:
      'List jobs with full records (request, customer, technician, date, window, status, overdue flag). Optionally filter by status, customer or technician. The honest source for schedules and overdue work.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['scheduled', 'completed', 'cancelled'] },
        customerId: { type: 'string', pattern: '^cust_[a-z0-9]+$' },
        technicianId: { type: 'string', pattern: '^tech_[a-z0-9]+$' },
      },
      required: [],
    },
  },
  {
    name: 'listTechnicians',
    description:
      'Read the technician roster (tech_ id, name, skills by category). Optionally filter by skill. The honest source for who can do what.',
    inputSchema: {
      type: 'object',
      properties: { skill: { type: 'string', enum: ['cleaning', 'plumbing', 'electrical'] } },
      required: [],
    },
  },
  {
    name: 'getTechnicianAvailability',
    description:
      "Read a technician's free and booked time windows for a date (YYYY-MM-DD). Read this BEFORE booking or reassigning.",
    inputSchema: {
      type: 'object',
      properties: {
        technicianId: { type: 'string', pattern: '^tech_[a-z0-9]+$' },
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      },
      required: ['technicianId', 'date'],
    },
  },
  {
    name: 'sendNotification',
    description:
      'Send the customer a message by sms or email and log it. Use for status updates the customer should see (schedule changes, reminders).',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', pattern: '^cust_[a-z0-9]+$' },
        channel: { type: 'string', enum: ['sms', 'email'] },
        message: { type: 'string' },
      },
      required: ['customerId', 'channel', 'message'],
    },
  },
  {
    name: 'listNotifications',
    description:
      "Read the log of notifications already sent (optionally for one customer). The honest source for 'was the customer notified?'.",
    inputSchema: {
      type: 'object',
      properties: { customerId: { type: 'string', pattern: '^cust_[a-z0-9]+$' } },
      required: [],
    },
  },
];
