---
target: src/components/TeamDashboard.tsx
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-05T22-50-15Z
slug: src-components-teamdashboard-tsx
---
Method: dual-agent (A: a2e709b56c916f519 · B: a00edcc008e532fc2)

Surface mode: **Operate**. All 10 heuristics apply.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | `refreshLive` swallows errors (`TeamDashboard.tsx:144`). A dead endpoint leaves a wall display showing stale data with no staleness signal. |
| 2 | Match System / Real World | 3 | Genuinely human language, but **Out Today** (`:473`) and **Off Today** (`:502`) are one word apart with opposite meanings. |
| 3 | User Control and Freedom | 2 | No undo. Force punch-out on a colleague is one tap, no confirm (`:913`). Modal discards a half-filled form on outside click (`:620`). |
| 4 | Consistency and Standards | 2 | Emoji ☕/🍽 on the board (`:893`) vs lucide `Coffee`/`Utensils` in the widget (`:578`). `StatusBadge` — the documented signature component — is absent from every person row. |
| 5 | Error Prevention | 2 | Punch Out silently disabled while on break (`:575`) with no explanation. Destructive manager action has no confirm step. |
| 6 | Recognition Rather Than Recall | 2 | Seven unlabeled 13px icon buttons; meaning lives only in `title`, which does not exist on touch. |
| 7 | Flexibility and Efficiency | 3 | Real accelerators (search, team filter, monitor pop-out, visibility-gated polling) — all `display: none` below 768px. |
| 8 | Aesthetic and Minimalist Design | 2 | Up to seven stacked sections, three of which answer the same question. |
| 9 | Error Recovery | 1 | Three write paths never check `res.ok` (`:299`, `:317`, `:326`). Failure is visually identical to success. |
| 10 | Help and Documentation | 2 | Six `InfoTooltip`s on non-focusable spans, `:hover`-only — unreachable by keyboard and touch. One is factually stale (`:458`). |
| **Total** | | **21/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

**Specific in architecture, generic in execution.**

**LLM assessment.** The structure is genuinely authored for this product: the board is partitioned by operational grouping rather than table column; a person's row changes its own background tint when they go on break; the mobile breakpoint performs a real reordering rather than a reflow; and three separate suppression conditions (`:222-230`) prevent a wrong "Off Today" flag from ever rendering. No generic SaaS dashboard contains that logic.

The surface has drifted, though. `StatusBadge` is documented as the system's signature component and appears in the clock widget but in no person row. The row instead invents four ad-hoc footer treatments, one drawing break/lunch as emoji fifteen lines from where the same concepts use lucide icons. The Monitor button uses the raw glyph `⧉`; modal close uses `✕`; the time-off picker is three emoji buttons with inline styles. Emoji are the least authored vocabulary available, and the file reaches for them at exactly the moments the design system already answers.

**Deterministic scan.** `detect.mjs` on the target: **exit 0, zero findings.** Widened to `src/components`: 12 findings total, all `design-system-color`, concentrated in ScheduleView.tsx (8), StatusLegend.tsx (3), AdminSettings.tsx (1). TeamDashboard.tsx does not rank.

**The gap between those two results is the most important thing in this report.** A clean detector score coexists with 21/40 and two P0s. The detector tests visual-slop tells and token conformance; it is structurally blind to unchecked network responses, missing accessible names, absent focus states, and sub-minimum touch targets. Independently verified: zero `aria-*`, zero `role=`, zero `tabIndex` in 998 lines; zero `:focus-visible` in 4,700+ lines of CSS; `.btn-punch` at 26px.

**Visual overlays.** None. No dev server is reachable for this project (`preview_start` resolves `launch.json` from an unrelated project directory), and the production instance requires authentication that must not be provided. No user-visible overlay exists. Conclusions needing a device check are marked below.

## Overall Impression

The thinking in this file is better than the execution. The grouping-as-layout idea, the row-tint signal, and the suppression logic are real design decisions that cost engineering effort — they are why this reads as an operations board rather than an employee table.

But the flagship interaction fails the product's own stated success condition. PRODUCT.md says clocking in should be "never in doubt"; the punch button greys to 38% opacity and offers no spinner, no label change, and no confirmation. And three manager write paths report failure as success.

**The single biggest opportunity:** the primary user's five-second task is a sidebar widget on the desktop home route, for all three roles. Principle 1 is applied only below 768px.

## What's Working

1. **Grouping-as-layout instead of table-as-layout** (`:399-523`). The organizing unit is an operational answer, not a data column. A manager scanning for a problem reads section headings, and the count chip beside each does most of the work.
2. **The break/lunch row tint as the system's strongest signal** (`globals.css:1622-1625`). Reserving full-row color for exactly two transient states makes them readable at wall-display distance while everything else stays quiet. The restraint is what makes it work.
3. **Suppression over explanation, implemented rather than documented** (`:218-231`). Three independent conditions stop a wrong flag from rendering. Most time-tracking software would show the flag with an asterisk.

## Priority Issues

### [P0] The primary user's primary action has no success state
**Why it matters.** PRODUCT.md's stated success condition — "clocking in takes seconds and is never in doubt" — lives entirely in this button. `actionLoading` only sets `disabled`, rendering as 38% opacity with no spinner and no label change. On a phone on a slow connection, the user cannot distinguish "sent" from "not sent."
**Fix.** Swap the label to `Punching in…` with an inline spinner while loading. On success, promote the already-computed `In since ${formatClock(...)}` (`:562`) from muted 11px `<small>` to the widget's primary confirmation line in the green state color.
**Where.** `TeamDashboard.tsx:570-588`.
**Command.** `/impeccable harden`

### [P0] Three write paths report failure as success
**Why it matters.** `handleMarkTimeOffSubmit` (`:299`), `handleDeleteTimeOff` (`:317`), and `handleSaveTimeOff` (`:326`) each `await fetch(...)` without inspecting `res.ok`, then close their modal and refresh unconditionally. A 403 or 500 is indistinguishable from success — a manager walks away believing a colleague's absence is recorded when it may not be. The file already has the correct pattern at `:265`; these three skipped it.
**Fix.** Route all three through the existing `clockAction` error path: check `res.ok`, read `json.error`, render it inside the modal above the footer, and keep the modal open so typed notes survive.
**Where.** `TeamDashboard.tsx:293-339`.
**Command.** `/impeccable harden`

### [P1] Three sections answer the same question; two labels one word apart mean opposite things
**Why it matters.** **Scheduled Now**, **Late / Not Clocked In**, and **Not In** all answer "who should be working and isn't." The distinctions are engineering distinctions, which is why all three need a tooltip to be usable. Separately, **Out Today** (absent, recorded) and **Off Today** (not scheduled, fine) are the two labels most likely to be confused under time pressure and the two that look most alike.
**Fix.** Collapse the three into one **Not Clocked In** section sorted by minutes overdue, carrying the distinction in a per-row chip (`Late 18m` / `Starts 2:00pm`). Rename **Off Today** to **Not Scheduled**.
**Where.** `TeamDashboard.tsx:402-519`.
**Command.** `/impeccable distill`

### [P1] Manager actions are 26px unlabeled glyphs, one of them destructive
**Why it matters.** `.btn-punch` is 26×26px (verified, `globals.css:1739`) — well under the 44px touch minimum. Seven such buttons render on the board, each carrying only an SVG and a `title`, which does not exist on touch. On a phone, "mark sick" sits a thumb-width from "force punch out," which fires immediately with no confirmation. The board is not hidden on mobile; only the sidebar controls are. **[Needs device check]** for exact mis-tap probability; the geometry is unambiguous.
**Fix.** Add `aria-label` to all seven matching their `title`. Raise the hit area to 44px below 768px via padding while keeping the 26px visual box. Add a confirm step to force-punch-out.
**Where.** `TeamDashboard.tsx:913, 922, 931, 942, 950`; `globals.css:1735-1752`.
**Command.** `/impeccable audit`

### [P2] On a phone, the coverage-gap alarm is the last thing on the page
**Why it matters.** In the 768px block, `.dash-body` is `order: 2`, `.dash-summary-row` `order: 3`, and the coverage banners `order: 4`. The Punch-First Rule correctly puts the clock first, but the consequence is that the loudest operational alarm in the product lands below the entire board, below Team Events, and below six stat tiles. Principle 3 is "surface problems while they are still fixable"; on the device managers carry, it is surfaced last. **[Needs device check]** for scroll depth.
**Fix.** Give the banners `order: -3` on mobile so an exception state sits above the clock. A coverage gap is rare by construction; when it exists it outranks everything.
**Where.** `globals.css:1026-1031`.
**Command.** `/impeccable adapt`

## Persona Red Flags

**Casey (distracted, one-handed, on a phone) — the primary user, and the worst-served.**
- Taps Punch In: no spinner, no label change, no confirmation. Cannot tell if it worked while walking into the building.
- At 5pm, still on lunch, taps Punch Out: disabled with no explanation. The pill says `On lunch` but never says *end your lunch to punch out*.
- All twelve explanations in the file are `title`-only or `:hover`-revealed on a non-focusable span. On touch, zero are reachable.
- `.button` is 34px tall — the flagship punch control is 10px under the iOS minimum.

**Sam (keyboard / screen reader).** Assessment B independently confirms the counts.
- Zero `aria-*`, zero `role=`, zero `tabIndex` in 998 lines.
- `outline: none` on `.field-input` and `.dash-search-input` with **no `:focus-visible` rule anywhere** in the stylesheet. Keyboard focus is invisible in the search field and every modal input.
- Seven icon-only buttons with no accessible name (`:812, :821, :913, :922, :931, :942, :950`) — a screen reader announces "button, button, button."
- Both modals lack `role="dialog"`, `aria-modal`, focus trap, Escape handler, and focus return. Close is a bare `✕` with no label.
- The per-second segment timer and 30-second refresh have no `aria-live` region.

**Riley (stress tester).**
- 200 employees: all seven sections render fully expanded, no virtualization, no collapse, no pagination.
- On a 375px phone, `.attend-card-top` (210px, no shrink) + `.attend-card-sched` (170px, no shrink) = 380px inside ~343px available, with no mobile override. **[Needs device check]**.
- Kill `/api/dashboard/live` and the board never says a word — it keeps ticking per-second timers off frozen data, looking *more* live, not less.
- Recent Activity renders first name only; two employees named Chris are indistinguishable.

## Minor Observations

- `CoverageCard` (`:787-832`) and `AttendCardCompact` (`:964-998`) are defined and never used — 79 lines of dead code, and `CoverageCard` contains a *better* footer treatment than the one shipping.
- `globals.css:1647` hides the punch-in time in list view — and list view is the only layout ever used, so clock-in time is never visible on the board.
- The **On break** summary tile counts break *and* lunch and is tinted amber, encoding neither Break Orange nor Lunch Violet. **Out** is permanently red while counting vacation (blue) and business trip (amber). Both violate the Meaning-Only Rule at the top of the board.
- **Out Today**'s tooltip says "approved vacation or sick leave" — PRODUCT.md states time off is auto-approved with no approval chain. It also omits business trip, which the group includes.
- **Scheduled Now** uses blue for dot and count, but DESIGN.md reserves Royal Blue as the interactive color: "if something is blue, it can be acted on." Nothing there is.
- `nowSafe = now ?? new Date()` (`:165`) is a fresh object every render inside a memo dependency array, defeating the memo. Matters more on a wall display running for hours.
- `confirm("Delete this time-off entry?")` (`:316`) is the only native browser dialog in a file shipping two custom modals.

## Questions to Consider

1. DESIGN.md closes the status vocabulary at eight states because readability depends on it staying memorizable. The board's actual navigational vocabulary is six group names, and **not one is one of the eight**. Which vocabulary is the product, and why must the user learn both?
2. The desktop home route is the manager's board for all three roles, and the employee's entire task is a 296px sidebar widget. What would this screen look like if Principle 1 were applied on desktop instead of only below 768px?
3. `StatusBadge` is documented as the system's core vocabulary, and the most-repeated element on the flagship surface doesn't use it. Is the badge the system, or a component that survived in three places nobody revisited?
4. The Rationed Red Rule exists so red means something. This screen renders red for the Out group, the Late group, the Out tile (even at zero), the coverage banner, the late badge, the absent dot, and the force-punch-out button. On a normal Tuesday with two people on vacation, has red stopped working?
5. If `/api/dashboard/live` returns 500 for four hours, the wall display keeps ticking per-second timers off frozen data and never says a word. What is a board that answers "who is working right now" worth if it cannot tell you when it no longer knows?
