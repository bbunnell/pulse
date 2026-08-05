# Team Pulse — Product Overview

> **Purpose of this document:** structured source material for marketing content generation.
> Everything below is drawn from the actual codebase and deployment, not aspirational roadmap.
> Sections marked **[NOT VERIFIED]** are business facts the codebase can't confirm — fill these in before publishing.

---

## 1. Product identity

| Field | Value |
|---|---|
| Product name | **Team Pulse** |
| Internal/repo codename | TimeBoard (directory + some docs still use this) |
| Category | Employee time & attendance / workforce visibility |
| Deployment model | **Self-hosted** (Docker or bare-metal Ubuntu + Nginx) |
| Live instance | `pulse.nbit.com` |
| License / commercial model | **[NOT VERIFIED]** — no license file or pricing in repo |
| Target market | **[NOT VERIFIED]** — see "Inferred fit" below |

**Naming note:** the repo, some docs, and the deploy path disagree (`TimeBoard`, `/opt/timeboard` in docs vs `/opt/teampulse` actual). Standardize on **Team Pulse** for all external material.

---

## 2. One-line descriptions

Pick by context:

- **Shortest:** Real-time team attendance, scheduling, and payroll reporting — self-hosted.
- **Standard:** Team Pulse gives managers a live view of who's working, who's on break, and who's out — with shift scheduling, coverage-gap alerts, and payroll-ready weekly exports.
- **Microsoft-shop angle:** A self-hosted time and attendance app that lives inside Microsoft Teams, signs in with Entra ID, and syncs out-of-office straight from Microsoft 365 calendars.

---

## 3. Core problem it solves

The app is built around a single operational question: **"Who is actually working right now?"**

Most time-clock software is built for payroll first and visibility second — you find out about a coverage gap after the fact. Team Pulse inverts that: the default screen is a live operational dashboard, and payroll reporting is a downstream export.

Specific pain points addressed in the code:

1. **No live picture of team status** → dashboard with real-time status groups
2. **Coverage gaps discovered too late** → hour-by-hour gap detection + minimum-staffing alerts on the dashboard
3. **Distributed/remote teams across timezones** → per-employee timezone with schedule times converted for display
4. **Manual payroll prep** → weekly report with paid/unpaid break math and CSV export
5. **Missed and forgotten punches** → missing-punch detection, late flags, manager-side corrections
6. **Time-off tracked in a separate system** → time off entry, approval-free workflow, ICS calendar files, and M365 out-of-office sync

---

## 4. User roles

Three-tier RBAC, enforced both in navigation and at the API layer.

| Role | Access |
|---|---|
| **Employee** | Own clock, own time, own schedule, submit time off, view team calendar/events |
| **Manager** | All of the above + full dashboard detail (late/missing-punch counts), manual punch corrections, mark others' time off, weekly reports, scheduling |
| **Admin** | All of the above + user management, teams, SSO config, email config, reminders, staffing rules, audit log |

---

## 5. Feature inventory

### 5.1 Time clock

- Punch in / punch out
- **Break** and **Lunch** tracked as separate segment types with live running timers
- Paid vs unpaid segment handling in payroll totals (break paid, lunch deducted)
- Manager-side manual punch in/out on behalf of an employee (for forgotten punches)
- "My Clock" widget with today's break and lunch totals

### 5.2 Live attendance dashboard *(the flagship screen)*

Real-time status groups, auto-refreshing:

- **Scheduled Now** — shift window is active but hasn't clocked in
- **Clocked In** — actively working, with break/lunch shown inline and color-coded
- **Late / Not Clocked In** — past grace period, still inside their work window
- **Out Today** — vacation, sick, or business trip
- **Not In** — scheduled today, not yet started
- **Off Today** — not scheduled, shown as compact chips for full-team visibility

Plus:

- Summary stat bar: Scheduled / Clocked In / On Break / Out / Late / Missing Punch
- **Coverage gap banner** — flags hours of the day with zero scheduled coverage
- **Understaffed banner** — flags hours scheduled below the configured minimum
- Live search and team filter
- Recent activity feed
- Eight distinct attendance states, each color- and icon-coded

### 5.3 Monitor mode

A dedicated compact, dark, pop-out window (`/monitor`) designed to sit on a second screen or wall display — condensed roster with live status dots, durations, and headline counts.

### 5.4 Scheduling

- Explicit shift scheduling with start/end times per employee per day
- **Recurring rules** — auto-generate shifts on a repeating pattern
- **Schedule templates** — save and apply a week shape
- **Copy week** — duplicate an entire week forward
- **Bulk reassign** — move a block of shifts between employees
- **Coverage heatmap** — visual hour-by-hour staffing density
- **Staffing rules** — configurable minimum headcount per hour, drives the understaffed alerts
- Two employee schedule models: **standard** (fixed Mon–Fri office hours) and **shift-based** (explicit shifts)
- After-hours / on-call schedule view
- Personal "My Schedule" view for employees

### 5.5 Time off

- Types: **Vacation**, **Sick**, **Business Trip**
- Full-day or partial-day (start time + hours)
- Date ranges
- Auto-approved workflow (no approval-chain friction by design)
- **ICS calendar file generation** — employees can add time off straight to their calendar
- Managers can mark time off on anyone's behalf from the dashboard
- Admin management panel to edit or delete entries across the whole team
- Time off automatically drives dashboard status and suppresses false "late" flags

### 5.6 Team calendar & events

- Month / week / day calendar views (`react-big-calendar`)
- Shows time off, birthdays, work anniversaries, and company events
- **Team Events** dashboard widget — rolling 14-day upcoming list
- Admin-created company events, assignable to individuals or groups
- Birthday and anniversary auto-projection from profile dates, opt-in per employee

### 5.7 Reporting & payroll

- Weekly report per employee: hours worked, break/lunch breakdown, overtime
- **Payroll detail** view
- **CSV export** for payroll system import
- Missing-punch and anomaly warnings surfaced in the report
- Personal "My Time" view — own weekly totals, punch list, and warnings

### 5.8 Microsoft 365 / Teams integration

This is a significant differentiator and worth leading with for the right audience.

- **Microsoft Entra ID SSO** (OAuth 2.0) — admin-configurable tenant, client ID, secret
- **Microsoft Teams tab app** — runs embedded inside Teams with Teams-native auth flow
- **Teams notifications** — shift reminders delivered as Teams messages
- **Microsoft Graph email** — transactional email sent via M365
- **Out-of-office calendar sync** — automatically imports OOF periods from M365 calendars and turns them into time-off entries

### 5.9 Administration

- User management with role assignment
- **Bulk CSV user import**
- Email invitations + resend invite
- Admin-initiated password reset; self-service forgot-password flow
- Team creation and assignment
- Configurable reminder timing (clock-in/out nudges)
- Shift notification settings
- Email provider configuration + test-send
- **Audit log** — records actor, target, entity, action, and before/after state for administrative changes
- Per-employee settings: timezone, expected start/end times, work days, schedule type, dashboard visibility

### 5.10 Employee experience

- Personal profile with **avatar upload and in-browser cropping**
- **Dark mode** with persisted preference
- **Fully responsive mobile layout** — hamburger navigation, clock-first ordering (punch controls at the top, since clocking in/out is the primary phone use case)
- Per-employee timezone: an employee in a different timezone sees their shift times converted to local

---

## 6. Technology stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, TypeScript |
| Database | PostgreSQL (raw SQL via `pg`, transactional writes) |
| Auth | iron-session, bcrypt password hashing, Microsoft Entra OAuth |
| Email | Microsoft Graph, plus Nodemailer/SMTP support |
| Calendar | `react-big-calendar`, `ics` for file generation |
| Icons | Lucide |
| Dates | date-fns |
| Deployment | Docker Compose **or** bare-metal Ubuntu + Nginx + systemd |

**Marketing-relevant technical points:**

- **Self-hosted / data sovereignty** — your employee time data stays on your infrastructure. No third-party SaaS processor. Relevant for compliance-sensitive buyers.
- **PostgreSQL-backed** with versioned migrations
- **No per-seat SaaS metering in the code** — the architecture doesn't impose seat limits
- Timezone-correct math throughout (UTC storage, zone-aware display)
- Audit logging built in, not bolted on

---

## 7. Inferred market fit

Reasoning from what the code optimizes for — **treat as hypothesis, validate before publishing:**

**Strong fit:**
- Small-to-midsize businesses (roughly 10–200 employees) that outgrew spreadsheets but don't want enterprise WFM pricing
- **Microsoft 365 shops** — the Entra SSO + Teams tab + Graph email + OOF sync stack is unusually deep and is the clearest wedge
- Organizations with **shift coverage requirements** — support desks, MSPs, NOCs, service teams, clinics — where a coverage gap is an actual operational failure
- Teams distributed across timezones
- Buyers with data-residency or compliance concerns who specifically want self-hosted

**Weak fit:**
- Enterprises needing complex approval chains (time off is auto-approved by design)
- Companies needing geofencing, biometric clocks, or physical kiosk hardware
- Anyone wanting zero-ops managed SaaS

---

## 8. Differentiators to lead with

1. **Operational-first, not payroll-first.** The home screen is "who's working right now," not a timesheet grid. Coverage gaps surface *before* they hurt.
2. **Genuinely deep Microsoft 365 integration.** Teams tab, Entra SSO, Graph email, and automatic out-of-office calendar sync. Most competitors stop at SSO.
3. **Self-hosted.** Own your data and your uptime. No per-seat SaaS bill.
4. **Coverage intelligence.** Minimum-staffing rules with hour-by-hour gap and understaffing detection is a scheduling-tool feature, delivered inside a time clock.
5. **Timezone-native.** Built for distributed teams from the schema up, not retrofitted.
6. **Wall-display monitor mode.** A purpose-built second-screen view for ops floors.

---

## 9. Suggested messaging angles

- *"Know who's working. Right now."* — leads with the live dashboard
- *"Time and attendance that lives in Teams."* — M365 wedge
- *"Coverage gaps, caught before they cost you."* — staffing rules + alerts
- *"Your time data, your server."* — self-hosted / sovereignty
- *"Payroll-ready in one click."* — weekly CSV export
- *"Built for teams that don't all sit in one timezone."* — distributed teams

---

## 10. Gaps to fill before marketing

Flagging honestly so the marketing agent doesn't invent these:

- **[NOT VERIFIED]** Pricing / licensing model — nothing in the repo
- **[NOT VERIFIED]** Customer count, testimonials, case studies
- **[NOT VERIFIED]** Competitive positioning vs. named competitors (When I Work, Deputy, Homebase, Clockify, etc.)
- **[NOT VERIFIED]** Support/SLA offering
- **[NOT VERIFIED]** Whether this is a commercial product, an internal NBIT tool, or open source
- **No mobile native app** — responsive web only. Don't claim an app store presence.
- **No geofencing / GPS / biometric** capture. Don't imply it.
- **No approval workflow** for time off — it's auto-approved. Frame as "friction-free," not as an approval feature.
- **No integrations with payroll providers** — export is CSV, not a direct ADP/Gusto/QuickBooks connector.

---

## 11. Project maturity

- ~109 commits over roughly two months of active development (June–July 2026)
- Running in production at `pulse.nbit.com` with real users and real attendance data
- Actively maintained — steady stream of UX refinements and bug fixes

Positioning implication: **credible, in production, actively developed** — but "mature enterprise platform with a decade of hardening" would overstate it.
