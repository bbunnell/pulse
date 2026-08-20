---
target: src/components/TeamDashboard.tsx
total_score: 12
max_score: 20
p0_count: 0
p1_count: 4
p2_count: 3
p3_count: 3
timestamp: 2026-08-20T18-40-00Z
---

# Audit — src/components/TeamDashboard.tsx

Surface mode: **Operate**. 1,283 lines.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Modals declare `role="dialog"` + `aria-modal` but never trap or return focus. Zero `aria-live` on a board that repaints every second. |
| 2 | Performance | 2 | A 1-second `setInterval` re-renders the entire tree; zero `memo()` on `AttendCard`. |
| 3 | Responsive Design | 2 | Person-row footer collapses to 0px on a 375px phone inside an `overflow: hidden` parent — manager actions and break chips are unreachable. |
| 4 | Theming | 3 | `globals.css` fully tokenised (detector: 0 findings). 41 inline style objects and 2 hard-coded `#fff` remain in the target. |
| 5 | Implementation Integrity | 3 | Detector exit 0 on target. Structure is product-specific, not interchangeable. |
| **Total** | | **12/20** | **Acceptable — significant work needed** |

## Implementation Integrity Verdict

**Pass.** `detect.mjs` on the target exits 0 with zero findings; widened to `src/components`
it reports 9, all `design-system-color`, none in this file. The structure is authored for
this product rather than assembled from dashboard defaults: grouping-as-layout instead of
table-as-layout, a row tint reserved for exactly two transient states, three independent
suppression conditions that stop a wrong "Off Today" flag from rendering, and polling gated
on `document.hidden`. None of that is generic.

The caveat from the critique still applies and this audit is the proof of it: the detector
has reported zero findings on this file at 21/40, at 31/40, and again now at 12/20 on
technical dimensions. It tests visual-slop tells and token conformance. It is structurally
blind to focus management, live regions, contrast ratios, and render cost — which is where
every finding below lives.

## Executive Summary

- **Audit Health Score: 12/20** (Acceptable — significant work needed)
- **Issues: 0 P0 · 4 P1 · 3 P2 · 3 P3**
- Top issues:
  1. Person-row footer is clipped to zero width on phones — takes the break/lunch chips
     and every manager action with it
  2. Modals have the ARIA contract but not the focus contract
  3. No `aria-live` anywhere on a live-updating operations board
  4. `--muted-2` fails AA at 2.43:1 and is used as body text in 10 places

## Detailed Findings

### [P1] Person-row footer collapses to zero width on a phone
**Location.** `globals.css:1684–1720` (`.attend-grid.list-view .attend-card`), consumed by
`TeamDashboard.tsx:552, 615, 635`.
**Category.** Responsive.
**Impact.** The list row is `flex-direction: row` with `.attend-card-top` at `210px;
flex-shrink: 0` and `.attend-card-sched` at `170px; flex-shrink: 0`, plus `14px` padding
each side — a hard floor of **408px**. On a 375px viewport `.dash-body` padding leaves
about **343px**. `.attend-card-footer` is `flex: 1`, so it absorbs the entire shortfall and
resolves to 0px, and the parent `.attend-grid.list-view` sets `overflow: hidden`, so nothing
scrolls into view.

That footer holds the clocked-in duration, the `.btn-punch` manager actions, and the
break/lunch chips. The mobile rule raising `.btn-punch` to 44×44 (`globals.css:1830`) is
correct and unreachable — it lives inside the collapsed element. The break-visibility
feature shipped this session is invisible on phones for the same reason.

**Standard.** WCAG 1.4.10 Reflow (AA) — content must not require two-dimensional scrolling
at 320 CSS px; here it is clipped outright rather than scrollable.
**Recommendation.** Below 768px, drop the row to `flex-wrap: wrap` (or
`flex-direction: column`) and release the two fixed widths to `width: auto`. The footer then
takes its own line at full width.
**Verification note.** Computed from the CSS values above, not measured on a device — the
preview server for this project resolves an unrelated `launch.json` (`msp-web` on 5173), and
the production dashboard requires authentication that must not be supplied. The arithmetic
is unambiguous; exact clipped pixels are **[needs device check]**.
**Suggested command.** `/impeccable adapt`

### [P1] Modals declare the ARIA contract but never implement the focus contract
**Location.** `TeamDashboard.tsx:830, 912, 965`.
**Category.** Accessibility.
**Impact.** All three dialogs correctly carry `role="dialog"`, `aria-modal="true"` and
`aria-labelledby`, and Escape closes them (`:176–181`). But the file contains **zero
`tabIndex`, zero `.focus()` calls, and no `autoFocus`**. Focus is never moved into the
dialog on open, never trapped inside it, and never returned to the trigger on close. A
keyboard user opening "mark time off" keeps focus on the board behind the overlay and tabs
through elements they cannot see; `aria-modal="true"` tells a screen reader the background
is inert while the keyboard says otherwise.
**Standard.** WCAG 2.4.3 Focus Order (**Level A**) and 2.1.2 No Keyboard Trap.
**Recommendation.** On open, store `document.activeElement`, focus the dialog's first
control; cycle Tab/Shift+Tab within the dialog; restore focus on close.
**Suggested command.** `/impeccable harden`

### [P1] No `aria-live` region on a board that updates every second
**Location.** `TeamDashboard.tsx` — 0 occurrences of `aria-live`; tick at `:161`, poll at
`:168`.
**Category.** Accessibility.
**Impact.** A 1-second clock tick and a 30-second data poll continuously change who is on
break, who is late, and how long people have been clocked in. None of it is announced. For
a screen reader user the operations board is a static snapshot that silently disagrees with
reality — the one thing this product exists to prevent.
**Standard.** WCAG 4.1.3 Status Messages (AA).
**Recommendation.** Wrap the coverage banners and the "Not Clocked In" count in
`aria-live="polite"`. Do **not** make per-second timers live — that would produce constant
chatter. Announce state transitions, not the clock.
**Suggested command.** `/impeccable harden`

### [P1] `--muted-2` fails AA contrast and is used as body text
**Location.** `globals.css:1511, 1642, 1798, 2103, 2208` and 5 more.
**Category.** Accessibility.
**Impact.** Measured ratios against the surfaces they actually sit on:

| Pair | Ratio | Verdict |
|---|---|---|
| `--muted-2` on `--surface` | **2.43:1** | Fails AA and AA-large |
| `--muted-2` on `--canvas` | **2.26:1** | Fails AA and AA-large |
| `--muted` on `--canvas` | **4.19:1** | Fails AA for normal text (passes AA-large) |
| dark `--muted-2` on dark `--surface` | **2.97:1** | Fails AA |

`.activity-time` renders at 11px in `--muted-2` — the worst case, small text at 2.43:1.
**Standard.** WCAG 1.4.3 Contrast Minimum (AA) — 4.5:1 for normal text.
**Recommendation.** Darken `--muted-2` from `#8DAABF` to roughly `#5F7F94` for 4.5:1 on
white, and lighten the dark-theme value. Both are single token edits.
**Suggested command.** `/impeccable colorize`

### [P2] The 1-second tick re-renders the whole board
**Location.** `TeamDashboard.tsx:159–163`; `AttendCard` at `:1047+`.
**Category.** Performance.
**Impact.** `setNow` fires every second on the root component. There are **zero `memo()`
wrappers** in the file and 13 `.map()` render lists, so every `AttendCard` and every chip
re-renders 60×/minute — roughly 1,700 component renders per minute at today's 28 people.
Invisible at this size; it scales linearly, and this view is intended to sit open all day on
a wall display.
**Recommendation.** Wrap `AttendCard` in `React.memo`, and pass a coarse tick (or a
per-card computed duration string) rather than a new `Date` object that changes identity
every second.
**Suggested command.** `/impeccable optimize`

### [P2] `refreshLive` swallows every failure; the board never admits it is stale
**Location.** `TeamDashboard.tsx:141–156`.
**Category.** Implementation Integrity.
**Impact.** `if (!res.ok) return;` and `catch { /* keep last good data */ }`. No error state,
no timestamp, no staleness flag. Kill `/api/dashboard/live` and the board keeps animating
per-second timers over frozen data — it looks *more* live, not less. On a wall display nobody
would notice for hours. This is the last surviving finding from the 2026-08-05 critique's
Heuristic 1.
**Recommendation.** Track `lastSuccessAt`. If it exceeds ~3 poll intervals, show a
"Last updated 4m ago" chip in the header and desaturate the live timers.
**Suggested command.** `/impeccable harden`

### [P2] No `prefers-reduced-motion` handling anywhere
**Location.** `globals.css` — 0 occurrences, against 1 `@keyframes` and 4 `transition: all`.
**Category.** Accessibility.
**Impact.** The punch spinner and every hover transition run regardless of the OS setting.
PRODUCT.md already records this as a known gap.
**Recommendation.** Add a `@media (prefers-reduced-motion: reduce)` block that shortens
transitions and swaps the spinner for a static state change. Keep the state change itself —
do not blanket-kill motion to `0.01ms`, which destroys useful feedback.
**Suggested command.** `/impeccable animate`

### [P3] 41 inline style objects
**Location.** `TeamDashboard.tsx`, throughout; hard-coded `#fff` at `:848, :864`.
**Category.** Theming.
**Impact.** Values that bypass the token system and cannot be themed or audited. Two are
literal colours; the rest are layout one-offs. Low user impact, steady drift pressure.
**Suggested command.** `/impeccable polish`

### [P3] `.button` is 34px tall and never raised on mobile
**Location.** `globals.css:947`.
**Category.** Responsive.
**Impact.** The flagship punch control is 34px. This **passes** WCAG 2.5.8 Target Size
(Minimum, 24px AA) — the earlier critique's framing of it as a violation was too strong — but
sits under the 44px iOS HIG guidance for a one-handed, in-a-hurry primary action.
`.btn-punch` already gets a 44px mobile override; `.button` does not.
**Suggested command.** `/impeccable adapt`

### [P3] No `<h1>` on the dashboard route
**Location.** `TeamDashboard.tsx` (7 × `<h2>`, 3 × `<h3>`, 0 × `<h1>`); none in
`page.tsx`, `layout.tsx`, or `TopNav.tsx` either.
**Category.** Accessibility.
**Impact.** Heading hierarchy starts at level 2. Screen reader users navigating by heading
get no page-level anchor.
**Suggested command.** `/impeccable harden`

## Patterns & Systemic Issues

1. **ARIA was added; behaviour was not.** 24 `aria-*` attributes, 7 `role=`, three properly
   labelled dialogs — and zero focus management, zero live regions. The declarative half of
   accessibility landed and the imperative half did not. Both P1 a11y findings are this one
   pattern.
2. **Mobile rules exist but are defeated by desktop geometry.** The 768px block does real
   work — reordering, hiding sidebar controls, raising `.btn-punch` to 44px. Two
   `flex-shrink: 0` widths inherited from the desktop list view cancel it for the row that
   matters most.
3. **Failure is consistently silent.** `refreshLive` swallows errors here; the reminders
   endpoint returned HTTP 200 while sending nothing; `email_logs` had no writers. Same shape
   three times in one codebase.

## Positive Findings

- **Status badge contrast is excellent in both themes.** Measured 7.29–9.51:1 in light and
  5.73–11.0:1 in dark — all AAA or solid AA. The `--*-soft` / `--*-text` token pairing is
  doing exactly what it should; keep this pattern.
- **Polling is gated on `document.hidden`** (`:168`) with a `visibilitychange` listener that
  refreshes on return. A background tab costs nothing. This is better than most dashboards.
- **`globals.css` is fully tokenised** — the detector reports zero colour, radius, and
  font-size findings on a 4,700-line stylesheet.
- **Escape closes all three modals** (`:176–181`), with a comment recording that they were
  previously dismissable only by clicking out.
- **10 `useMemo` calls** cover the genuinely expensive derived data (grouping, sorting,
  segment maps). The memoization gap is components, not computation.

## Recommended Actions

1. **[P1] `/impeccable adapt`** — release the two `flex-shrink: 0` widths below 768px so the
   person-row footer, its manager actions, and the break chips are reachable on a phone.
2. **[P1] `/impeccable harden`** — focus trap and focus return for all three modals;
   `aria-live` on the coverage banners and not-clocked-in count; an `<h1>` for the route.
3. **[P1] `/impeccable colorize`** — raise `--muted-2` (and its dark-theme twin) to 4.5:1.
4. **[P2] `/impeccable optimize`** — `React.memo` on `AttendCard`; stop passing a new `Date`
   identity every second.
5. **[P2] `/impeccable harden`** — staleness signal for `refreshLive`.
6. **[P2] `/impeccable animate`** — a `prefers-reduced-motion` block that preserves state
   change.
7. **[P3] `/impeccable polish`** — final pass: inline styles, `.button` touch height.
