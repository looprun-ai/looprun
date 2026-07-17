# What people actually run on personal-agent harnesses

Ten tasks real users run on Hermes-Agent / OpenClaw-class harnesses, researched from primary
sources (Hacker News, power-user writeups, the official user-story catalogs). They are the demand
side of this sim: most of them act autonomously (cron-fired, nobody watching), and the experienced
users consistently draw a manual safety line exactly where declarative guards operate —
*draft, never send*; *alert, never act*; *hard caps on volume*.

The three marked **[E2E]** are implemented as governed example domains and exercised by this sim.

| # | Task | What the user asks | Surface | Side effects |
|---|---|---|---|---|
| 1 | `morning-briefing` | Daily ~6:30am cron: weather + first meetings + headlines, delivered to Telegram, archived to the vault | web, calendar, messaging, files | sends messages, writes notes |
| 2 | `inbox-triage` **[E2E]** | Cron/heartbeat: summarize unread, archive noise, DRAFT replies to urgent mail — never auto-send | email, messaging | archives, labels, creates drafts |
| 3 | `second-brain-filing` **[E2E]** | Bookmarks/notes dropped in a chat get fetched, summarized, tagged and filed into the vault | files, browser, messaging | writes/moves files |
| 4 | `monitoring-alerting` | Every ~30min: check services/disk/validators, alert on state CHANGE only; advanced variant auto-remediates | terminal, messaging | alerts; (advanced) restarts services |
| 5 | `scrape-and-summarize` | Overnight research fan-out (X/Reddit/HN/web) synthesized into a cited report in the vault | browser, files, messaging | saves documents, posts digests |
| 6 | `calendar-management` **[E2E]** | "Add dentist Tuesday 3pm, remind me the day before" from chat; business variant chains onboarding | calendar, messaging | creates/updates events, reminders |
| 7 | `price-deal-watching` | Scheduled marketplace/price watchers that flag opportunities; extreme variants negotiate or trade | browser, messaging | alerts; (advanced) sends offers, trades |
| 8 | `backup-routine` | Nightly 4am: sanitize configs, commit+push to a private repo, self-update, report status | terminal, files | pushes, restarts, deletes |
| 9 | `social-posting` | Autonomous posts in the user's voice (LinkedIn/X), content repurposing pipelines | social APIs, files | posts publicly as the user |
| 10 | `home-automation` | "Turn off the living-room lights", temperature checks, routines; extends to vehicles/IoT | smart-home APIs, messaging | actuates physical devices |

## Sources

- Ask HN: "Any real OpenClaw users?" — https://news.ycombinator.com/item?id=46838946
  (inbox triage, second-brain filing, overnight research, marketplace negotiation, 24/7 posting
  agents, remote devops from a phone; also documents the safety lines users improvise by hand)
- velvet-shark, "OpenClaw after 50 days: all prompts for 20 real workflows" —
  https://gist.github.com/velvet-shark/b4c6724c391f612c4de4e9a07b0a74b6
  (morning briefing #1, backup routine #3, monitoring #4, research #5, draft-only email #10,
  calendar #11, vault filing #16-17, home automation #20)
- Hermes-Agent official user stories — https://hermes-agent.nousresearch.com/docs/user-stories
  (inbox-to-Slack summaries, daily research briefs, LinkedIn/X posting, validator monitoring,
  Home Assistant add-on, weather-market cron trading)
- awesome-hermes-agent community catalog — https://github.com/0xNyk/awesome-hermes-agent
  (Incident Commander auto-remediation, content-studio posting packs)
- Hostinger, "25 OpenClaw use cases" — https://www.hostinger.com/tutorials/openclaw-use-cases/
  (calendar/booking chains, price tracking, home automation)
- Hermes-Agent cron docs — https://github.com/NousResearch/hermes-agent (website/docs, cron feature)
  ("daily reports, nightly backups, weekly audits… running unattended")

## Why these three E2E

- **inbox-triage** — the canonical draft-never-send line: the send tool exists on the surface and
  a guard hard-vetoes it; archive volume is capped per turn.
- **second-brain-filing** — destructive file ops: folder allowlist scoping + confirm-first delete.
- **calendar-management** — outward side effects with availability preconditions, confirm-first
  deletes and single-question clarification on ambiguity.

Together they cover the three side-effect classes (outbound communication, file mutation,
scheduled commitments) that make autonomous harness tasks risky in the first place.
