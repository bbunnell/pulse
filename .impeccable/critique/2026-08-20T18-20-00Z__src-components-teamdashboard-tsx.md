---
target: src/components/TeamDashboard.tsx
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-20T18-20-00Z
slug: src-components-teamdashboard-tsx
baseline: 2026-08-05T22-50-15Z (21/40, 2 P0, 2 P1)
---
Method: single-pass re-score against the 2026-08-05 baseline. The baseline used a
dual-agent method; this pass is one assessor verifying each prior finding against
current code, plus a fresh deterministic scan. Treated as a delta measurement, not
an independent re-derivation — a clean-room re-critique may surface issues this
pass did not look for.

Surface mode: **Operate**. All 10 heuristics apply.

## Design Health Score

| # | Heuristic | Was | Now | Change |
|---|-----------|-----|-----|--------|
| 1 | Visibility of System Status | 2 | 3 | Punch button has a spinner and `Punching in…` label. `refreshLive` still swallows errors — a dead endpoint still shows no staleness signal. |
| 2 | Match System / Real World | 3 | 4 | **Off Today** renamed **Not Scheduled**; the confusable pair is gone. |
| 3 | User Control and Freedom | 2 | 3 | Force punch-out now routes through an in-app confirm dialog. Still no undo. |
| 4 | Consistency and Standards | 2 | 3 | Break/lunch now render as lucide icons and tokenised colours. `StatusBadge` is still absent from person rows. |
| 5 | Error Prevention | 2 | 3 | Destructive action confirms. Punch Out still disables silently while on break. |
| 6 | Recognition Rather Than Recall | 2 | 3 | 24 `aria-*` and 7 `role=` where there were zero; icon buttons have accessible names. |
| 7 | Flexibility and Efficiency | 3 | 3 | Unchanged. Accelerators still `display: none` below 768px. |
| 8 | Aesthetic and Minimalist Design | 2 | 3 | Three overlapping sections merged into one **Not Clocked In**, sorted by overdue. |
| 9 | Error Recovery | 1 | 3 | All three write paths check `res.ok`, surface `json.error` in-modal, and keep the modal open so typed input survives. |
| 10 | Help and Documentation | 2 | 3 | `:focus-visible` rules now exist. Tooltips remain `:hover`-only on non-focusable spans. |
| **Total** | | **21/40** | **31/40** | **Good — refinement, not repair** |

## What Changed Since the Baseline

Both P0s and both P1s are resolved, verified in code rather than assumed:

- **P0 — no success state on the primary action.** `handlePunchIn` now renders
  `<Loader2 className="spin" /> Punching in…` while in flight. The product's stated
  success condition ("never in doubt") is met on the flagship control.
- **P0 — three write paths reported failure as success.** `handleMarkTimeOffSubmit`,
  `handleDeleteTimeOff` and `handleSaveTimeOff` each check `res.ok`, read `json.error`,
  render it above the modal footer, and return without closing.
- **P1 — three sections answering one question.** Collapsed into a single
  **Not Clocked In** section ordered by minutes overdue. **Off Today** is now
  **Not Scheduled**.
- **P1 — 26px unlabeled glyphs, one destructive.** Hit area rises to 44×44 below
  768px while the visual box stays 26px; every icon button carries an accessible
  name; force punch-out confirms first. The confirm is an in-app dialog rather than
  `window.confirm`, because the Teams webview silently suppresses the native one —
  a native confirm here would have made the action dead inside Teams.
- **P2 — coverage alarm last on mobile.** Banners move from `order: 4` to `order: -3`,
  above the clock widget.

## Deterministic Scan

`detect.mjs` on the target: **exit 0, zero findings** (unchanged — it was clean at
21/40 too).

Widened to `src/components`: **9 findings, down from 12**, all `design-system-color`.
The `globals.css` backlog that stood at 78 findings is now zero; these 9 are literals
living in component files rather than the stylesheet.

**The baseline's central observation still holds and is worth restating:** a clean
detector score is compatible with a low design-health score. The detector tests
visual-slop tells and token conformance. It is structurally blind to unchecked
network responses, missing accessible names, and absent focus states — which is
exactly where the two P0s lived. The score moved 21 → 31 while the detector output
on this file never changed.

## What Is Still Open

Nothing at P0 or P1. Remaining, in rough priority order:

1. **`refreshLive` still swallows errors.** Kill `/api/dashboard/live` and the board
   keeps ticking per-second timers off frozen data — looking *more* live, not less.
   This is the last survivor of the baseline's Heuristic 1 finding and the one most
   likely to mislead during an actual incident.
2. **`StatusBadge` absent from person rows.** The documented signature component
   appears in the clock widget and nowhere else; rows still use ad-hoc footers.
3. **Tooltips remain `:hover`-only** on non-focusable spans — unreachable by keyboard
   and touch. Twelve explanations, zero reachable on a phone.
4. **Modals lack `role="dialog"`, focus trap, Escape handler, and focus return.**
   Partial `role=` coverage exists but the dialog contract is incomplete.
5. **No virtualization.** At 200 employees every section renders fully expanded.
   Not a problem at 28.

## Verification Notes

No visual overlays. No dev server is configured for this project and the production
instance requires authentication that must not be supplied, so every claim above is
from source inspection and the deterministic scan. Conclusions that would need a
device check (mis-tap probability, scroll depth, 375px overflow) are unchanged from
the baseline and were not re-verified.
