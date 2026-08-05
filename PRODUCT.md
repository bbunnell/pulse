# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the employee clocking in or out.** They open the app at the start of a shift, before a break, at lunch, and at the end of the day. Each visit is a five-second task, frequently on a phone, often one-handed, sometimes in a hurry. They are not power users and will never read documentation. When their needs conflict with a manager's, the employee wins.

**Secondary: the manager or operations lead.** They watch live team status to answer "who is working right now" and "is anyone missing." They need density and scanability across the whole team, correct forgotten punches on employees' behalf, mark people out sick or travelling, and pull weekly totals for payroll. Some keep the compact monitor view open on a second screen or wall display.

**Tertiary: the admin or IT director.** They configure users, teams, roles, staffing minimums, reminders, SSO, and the Microsoft 365 integrations. Infrequent but high-stakes visits.

Roles are enforced as a three-tier hierarchy in both navigation and the API layer: `employee` → `manager` → `admin`.

## Product Purpose

Team Pulse is a self-hosted time and attendance system built around live operational visibility rather than retrospective timesheets. Employees punch in and out and record breaks and lunches; managers see the resulting team state in real time; weekly totals export to payroll as CSV.

It runs in production today for Network Builders IT's own staff at `pulse.nbit.com`. The intent is to productize it for other businesses later, so product decisions should avoid choices that only make sense for a single tenant.

Success for the primary user is that clocking in takes seconds and is never in doubt. Success for the secondary user is that a coverage problem is visible while it can still be fixed, not discovered afterward.

## Positioning

Four confirmed claims that future work must preserve:

1. **Operational-first, not payroll-first.** The home screen answers "who is working right now," not "what did last week cost." Payroll export is a downstream artifact, not the organizing idea. This is the inversion the product is built on.
2. **Coverage intelligence inside a time clock.** Minimum-staffing rules with hour-by-hour gap and understaffing detection. This is scheduling-tool capability delivered where the punch data already lives, so a gap surfaces against reality rather than against a plan.
3. **Microsoft 365 depth.** Entra ID SSO, a Teams tab app, Graph-sent mail, Teams-delivered shift notifications, and automatic import of out-of-office periods from M365 calendars into time-off entries. Competitors commonly stop at SSO.
4. **Self-hosted.** Runs on the customer's own infrastructure. No third-party SaaS processor holds employee time data.

## Operating Context

- Employees punch from a phone browser, a desktop browser, or inside Microsoft Teams as a tab app. There is no native mobile app.
- Staff are distributed across timezones. Each employee carries their own timezone; schedule times are authored in an organization reference timezone and converted for display. Storage is UTC throughout.
- Two schedule models coexist: `standard` employees work fixed weekly hours on configured work days; `shift_based` employees work explicit scheduled shifts.
- Managers monitor from the main dashboard or from a dedicated compact pop-out window intended for a second screen or wall display.
- Weekly reporting produces a CSV for import into a payroll system. There is no direct payroll-provider connector.
- The deployment target is a Microsoft 365 tenant environment: Entra for identity, Teams for delivery, Graph for mail, Exchange calendars for out-of-office.
- Deployment is self-managed, either Docker Compose or bare-metal Ubuntu with Nginx and systemd. The current production instance updates by git pull, build, and service restart.

## Capabilities and Constraints

**Confirmed capabilities.** Punch in/out with separate break and lunch segments and live timers; manager-side manual punch correction; eight-state live attendance dashboard with search and team filter; coverage gap and understaffing banners; compact monitor view; shift scheduling with recurring rules, saved templates, week copy, bulk reassignment, and a coverage heatmap; configurable per-hour staffing minimums; time off with ICS file generation; team calendar covering time off, birthdays, work anniversaries, and company events; weekly payroll reporting with CSV export; per-employee timezone handling; CSV user import, email invitations, and password reset; an audit log capturing actor, target, entity, action, and before/after state; avatar upload with in-browser cropping; dark mode; responsive mobile layout.

**Terminology.** A *punch* opens or closes a *shift*. Breaks and lunches are *segments* on that shift. A *scheduled shift* is planned work, distinct from a punched shift. *Coverage gap* means an hour with zero scheduled staff; *understaffed* means an hour below the configured minimum. *Missing punch* and *late* are derived states, not user-entered.

**Attendance states (8).** Available, On Break, At Lunch, Not Punched In, Punched Out, Out Sick, On Vacation, Business Trip.

**Time off types (3).** Vacation, Sick, Business Trip.

**Deliberate product decisions.**
- Time off is auto-approved. There is no approval chain, by design. Frame this as removed friction, not a missing feature.
- Breaks are paid and included in worked totals; lunches are unpaid and deducted.
- "Off Today" and "Late" are suppressed for people whose schedule or actual punches make the flag wrong, rather than shown and explained.

**Constraints future work must not contradict.**
- No native mobile app. Responsive web only.
- No geofencing, GPS capture, or biometric verification.
- No direct payroll-provider integration. Export is CSV.
- No approval workflow for time off.

**Explicitly undecided.** Pricing, licensing model, packaging for external customers, and support or SLA commitments. None of these exist yet and none may be assumed.

## Brand Commitments

- **Name: Team Pulse.** This is the committed product name and the name shown in the interface.
- **Naming drift to resolve, not preserve.** The repository directory is `TimeBoard`, `README.md` calls it "Time Attendance App", and `docs/deployment.md` references `/opt/timeboard` while the live service actually runs from `/opt/teampulse`. These are inconsistencies to clean up, not alternate brand names.
- **Existing logo assets** in `public/`: `team-pulse-logo-light.png`, `team-pulse-logo-dark.png`, `team-pulse-square-light.png`, `team-pulse-square-dark.png`, `mark-light-bg.png`, `mark-dark-bg.png`, `app-icon-1024.png`, plus favicons and an Apple touch icon. Light and dark variants exist for each, which is a binding constraint: the product ships both themes and identity must hold in both.
- No voice or tone guide has been established.

## Evidence on Hand

**Real and citable.**
- A production deployment at `pulse.nbit.com` carrying live attendance data for Network Builders IT staff.
- `docs/product-overview.md` — a feature and positioning inventory derived directly from the codebase.
- `docs/deployment.md`, `docs/decisions.md`, `README.md`.
- The logo asset set listed above.
- Roughly 109 commits of active development between June and July 2026.

**Absent. Future work must not fabricate any of these.** There are no customers outside NBIT, no testimonials, no case studies, no usage or performance benchmarks, no press, no pricing, no license, no competitive analysis against named products, and no support or uptime commitments.

## Product Principles

1. **The five-second task wins.** The employee punching in is the primary user. When their path and a manager's density needs conflict, shorten the employee's path.
2. **Answer "now" before "last week."** Live state is the product; historical reporting is an export. Do not let reporting affordances crowd the operational picture.
3. **Surface problems while they are still fixable.** Coverage gaps, missing punches, and lateness should appear where someone can act on them, not only in a report.
4. **Suppress the wrong flag rather than explaining it.** Derived states must account for real-world exceptions. A false "Late" costs more trust than a missing one.
5. **Meet people inside the tools they already have open.** Teams, Outlook calendars, and M365 identity are where this audience already works.
6. **The customer's data stays on the customer's infrastructure.** Self-hosting is a product commitment, not a deployment detail.

## Accessibility & Inclusion

No standard has been established and none may be claimed. Current accessibility support is ad hoc: four `aria-label` attributes and a single `role` across the entire component tree, with no `prefers-reduced-motion` handling.

This is an open decision, recorded so that future work neither claims conformance nor assumes an existing baseline. Two product facts argue for setting a real target: the primary user is often one-handed on a phone in a hurry, and a productized version sold to other businesses will likely face procurement accessibility requirements.
