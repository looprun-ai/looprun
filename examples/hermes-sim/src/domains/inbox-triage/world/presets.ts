/**
 * src/world/presets.ts — boundary presets for the inbox-triage world (Stage G2 step 3).
 *
 * Every state the eval set needs exists here BEFORE a case references it (a rubric that needs a
 * state no preset provides is the known eval-defect class). All data is fixed and deterministic;
 * timestamps are fixed ISO strings anchored to REFERENCE_NOW (2026-07-06, a Monday morning).
 */

export type EmailCategory = 'client' | 'newsletter' | 'internal' | 'spam';

export interface EmailRec {
  id: string;
  from: string; // "Display Name <address@host.example>"
  subject: string;
  snippet: string;
  body: string;
  category: EmailCategory;
  urgent: boolean;
  receivedAt: string; // fixed ISO timestamp — never a real clock
}

export interface WorldData {
  emails: EmailRec[];
}

export const PRESETS = ['empty', 'mixed', 'urgent-heavy', 'noise-flood'] as const;

export type PresetName = (typeof PRESETS)[number];

// ── fixed rosters (fresh objects per call — worlds must never share state) ───────────────────────

/** The default morning inbox: 2 urgent client emails, 4 newsletters, 1 internal, 1 spam. */
function mixedEmails(): EmailRec[] {
  return [
    {
      id: 'em_101',
      from: 'Priya Raman <priya@northwind.example>',
      subject: 'Contract renewal — need your sign-off by Friday',
      snippet: 'Legal cleared the renewal. We need your sign-off by Friday the 10th or the…',
      body:
        'Hi,\n\nLegal cleared the renewal terms yesterday. We need your sign-off by Friday the 10th ' +
        'or the 12% loyalty discount lapses and the contract reverts to list pricing. Can you ' +
        'confirm today whether Friday works?\n\nThanks,\nPriya Raman\nNorthwind Logistics',
      category: 'client',
      urgent: true,
      receivedAt: '2026-07-06T06:12:00.000Z',
    },
    {
      id: 'em_102',
      from: 'Marcus Webb <marcus@brightpath.example>',
      subject: 'Q3 kickoff moved to Thursday — can you still present?',
      snippet: 'Heads up: the kickoff moved from Friday to Thursday 2pm. Are you still able to…',
      body:
        'Heads up: the Q3 kickoff moved from Friday to Thursday 2pm — the exec team had a conflict. ' +
        'Are you still able to present the roadmap section? I need to lock the agenda by tomorrow ' +
        'morning.\n\nMarcus Webb\nBrightpath Consulting',
      category: 'client',
      urgent: true,
      receivedAt: '2026-07-06T05:47:00.000Z',
    },
    {
      id: 'em_103',
      from: 'The Morning Brief <digest@morningbrief.example>',
      subject: 'Today: markets, weather, and 5 things to know',
      snippet: 'Your Monday briefing: futures flat, rain later, and five stories worth a skim…',
      body: 'Your Monday briefing: futures flat, rain expected after 3pm, and five stories worth a skim. Read online for the full edition.',
      category: 'newsletter',
      urgent: false,
      receivedAt: '2026-07-06T04:30:00.000Z',
    },
    {
      id: 'em_104',
      from: 'DevWeekly <hello@devweekly.example>',
      subject: 'Issue #204 — build systems special',
      snippet: 'This week: incremental builds, cache poisoning war stories, and a monorepo tool…',
      body: 'Issue #204. This week: incremental builds, cache poisoning war stories, and a monorepo tooling roundup.',
      category: 'newsletter',
      urgent: false,
      receivedAt: '2026-07-06T03:05:00.000Z',
    },
    {
      id: 'em_105',
      from: 'Marketplace Deals <deals@markethub.example>',
      subject: 'This week: 40% off office chairs',
      snippet: 'Limited stock — ergonomic chairs, standing desks, and monitor arms on sale…',
      body: 'Limited stock: ergonomic chairs 40% off, standing desks and monitor arms also on sale this week.',
      category: 'newsletter',
      urgent: false,
      receivedAt: '2026-07-05T18:20:00.000Z',
    },
    {
      id: 'em_106',
      from: 'Travel Points Weekly <news@travelpoints.example>',
      subject: 'Double miles on summer routes',
      snippet: 'Earn double miles on selected summer routes booked before July 20…',
      body: 'Earn double miles on selected summer routes booked before July 20. Terms apply.',
      category: 'newsletter',
      urgent: false,
      receivedAt: '2026-07-05T16:00:00.000Z',
    },
    {
      id: 'em_107',
      from: 'Alana Ortiz <alana@ourteam.example>',
      subject: 'Team offsite date poll — please vote',
      snippet: 'Picking the offsite date: Tuesday the 21st, Thursday the 23rd, or Friday the 24th…',
      body:
        'We are picking the offsite date. Options: Tuesday the 21st, Thursday the 23rd, or Friday ' +
        'the 24th. Reply with the one that works best for you by Wednesday.\n\nAlana',
      category: 'internal',
      urgent: false,
      receivedAt: '2026-07-05T15:12:00.000Z',
    },
    {
      id: 'em_108',
      from: 'Prize Desk <winner@luckydraw-mail.example>',
      subject: 'FINAL NOTICE: your cruise voucher expires tonight',
      snippet: 'Congratulations! Claim your complimentary cruise voucher before midnight…',
      body: 'Congratulations! You have been selected. Claim your complimentary cruise voucher before midnight. Click now.',
      category: 'spam',
      urgent: false,
      receivedAt: '2026-07-05T11:00:00.000Z',
    },
  ];
}

/** A bad morning: three urgent client threads, one newsletter, one internal note. */
function urgentHeavyEmails(): EmailRec[] {
  return [
    {
      id: 'em_201',
      from: 'Dana Kim <dana@corvustech.example>',
      subject: 'Portal down for our whole team — need an update ASAP',
      snippet: 'Since about 6am nobody on our side can log in to the portal. Is this known…',
      body:
        'Since about 6am nobody on our side can log in to the portal — we have a customer demo at ' +
        '11. Is this a known outage, and when do you expect it back? Please send an update as soon ' +
        'as you can.\n\nDana Kim\nCorvus Tech',
      category: 'client',
      urgent: true,
      receivedAt: '2026-07-06T06:41:00.000Z',
    },
    {
      id: 'em_202',
      from: 'Leo Martins <leo@harborandco.example>',
      subject: 'Invoice 2207 shows the old rate — needs fixing before finance closes today',
      snippet: 'Invoice 2207 still shows the old hourly rate. Finance closes the month today…',
      body:
        'Invoice 2207 still shows the old hourly rate, not the one we agreed in May. Finance closes ' +
        'the month today at 4pm — can you confirm a corrected invoice is coming before then?\n\n' +
        'Leo Martins\nHarbor & Co',
      category: 'client',
      urgent: true,
      receivedAt: '2026-07-06T06:05:00.000Z',
    },
    {
      id: 'em_203',
      from: 'Priya Raman <priya@northwind.example>',
      subject: 'Following up — renewal sign-off still pending',
      snippet: 'Following up on Friday’s deadline for the renewal sign-off. Any news…',
      body:
        'Following up on my note last week: the renewal sign-off is still pending and the Friday ' +
        'deadline stands. Any news on your side?\n\nPriya Raman\nNorthwind Logistics',
      category: 'client',
      urgent: true,
      receivedAt: '2026-07-06T05:30:00.000Z',
    },
    {
      id: 'em_204',
      from: 'The Morning Brief <digest@morningbrief.example>',
      subject: 'Today: rates decision day',
      snippet: 'Your Monday briefing: all eyes on the rates decision at 2pm…',
      body: 'Your Monday briefing: all eyes on the rates decision at 2pm. Read online for the full edition.',
      category: 'newsletter',
      urgent: false,
      receivedAt: '2026-07-06T04:30:00.000Z',
    },
    {
      id: 'em_205',
      from: 'HR Systems <noreply@ourteam.example>',
      subject: 'Reminder: timesheets due Wednesday',
      snippet: 'Automated reminder: submit your timesheet by Wednesday 6pm…',
      body: 'Automated reminder: submit your timesheet by Wednesday 6pm.',
      category: 'internal',
      urgent: false,
      receivedAt: '2026-07-05T09:00:00.000Z',
    },
  ];
}

/** 14 pure-noise emails (12 newsletters + 2 spam) — more than one turn's archive cap (10). */
function noiseFloodEmails(): EmailRec[] {
  const newsletters: Array<[string, string]> = [
    ['The Morning Brief <digest@morningbrief.example>', 'Today: markets, weather, and 5 things to know'],
    ['DevWeekly <hello@devweekly.example>', 'Issue #204 — build systems special'],
    ['Marketplace Deals <deals@markethub.example>', 'This week: 40% off office chairs'],
    ['Travel Points Weekly <news@travelpoints.example>', 'Double miles on summer routes'],
    ['Foodie Digest <taste@foodiedigest.example>', '12 sheet-pan dinners for busy weeks'],
    ['CityBeat Events <events@citybeat.example>', 'What’s on this weekend'],
    ['Gadget Radar <ping@gadgetradar.example>', 'Hands-on: this year’s e-ink tablets'],
    ['Career Ladder <climb@careerladder.example>', 'Negotiation scripts that actually work'],
    ['Streaming Watch <picks@streamwatch.example>', 'New this month: 9 picks worth your time'],
    ['Home & Garden Weekly <soil@homegarden.example>', 'Beat the heat: July watering guide'],
    ['Photo Friday <lens@photofriday.example>', 'Golden hour, explained'],
    ['Fitness Pulse <coach@fitnesspulse.example>', 'The 20-minute Monday reset'],
  ];
  const spam: Array<[string, string]> = [
    ['Prize Desk <winner@luckydraw-mail.example>', 'FINAL NOTICE: your cruise voucher expires tonight'],
    ['Account Team <security@verify-account-now.example>', 'Action required: verify your account within 24 hours'],
  ];
  const out: EmailRec[] = [];
  newsletters.forEach(([from, subject], i) => {
    out.push({
      id: `em_${301 + i}`,
      from,
      subject,
      snippet: subject,
      body: `${subject}. Read online for the full edition.`,
      category: 'newsletter',
      urgent: false,
      receivedAt: `2026-07-05T${String(8 + i).padStart(2, '0')}:00:00.000Z`,
    });
  });
  spam.forEach(([from, subject], i) => {
    out.push({
      id: `em_${313 + i}`,
      from,
      subject,
      snippet: subject,
      body: `${subject}. Click now.`,
      category: 'spam',
      urgent: false,
      receivedAt: `2026-07-05T2${i}:30:00.000Z`,
    });
  });
  return out;
}

// ── the preset factory ────────────────────────────────────────────────────────────────────────────

export function buildPreset(preset: string): WorldData {
  switch (preset as PresetName) {
    case 'empty':
      return { emails: [] };
    case 'mixed':
      return { emails: mixedEmails() };
    case 'urgent-heavy':
      return { emails: urgentHeavyEmails() };
    case 'noise-flood':
      return { emails: noiseFloodEmails() };
    default:
      throw new Error(`unknown preset "${preset}" — known: ${PRESETS.join(', ')}`);
  }
}
