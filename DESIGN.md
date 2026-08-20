---
name: Team Pulse
description: A warm operations board for live team attendance, built on the NBIT brand palette.
colors:
  brand-royal: "#00579D"
  brand-navy: "#133F62"
  ink-navy: "#162334"
  accent-gold: "#FFBF1D"
  sky: "#59BFEF"
  surface: "#FFFFFF"
  canvas: "#F4F7FA"
  border: "#D6E2EE"
  border-strong: "#B3C8DC"
  ink: "#162334"
  ink-2: "#2D4459"
  muted: "#5A7A96"
  muted-2: "#8DAABF"
  state-green: "#059669"
  state-amber: "#D97706"
  state-red: "#E23A39"
  break-orange: "#F97316"
  lunch-violet: "#8B5CF6"
typography:
  avatar-xl:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  headline-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  subtitle:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  body-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.06em"
  micro:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "10px"
    fontWeight: 600
  micro-xs:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "9px"
    fontWeight: 700
    letterSpacing: "0.04em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "18px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-primary:
    backgroundColor: "{colors.brand-royal}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.brand-navy}"
    textColor: "{colors.surface}"
  button-danger:
    backgroundColor: "{colors.state-red}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "34px"
  button-warning:
    backgroundColor: "{colors.state-amber}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "34px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  attend-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "14px 15px"
  status-badge:
    rounded: "{rounded.full}"
    padding: "3px 9px"
    typography: "{typography.label}"
  summary-stat:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
---

# Design System: Team Pulse

## Overview

**Creative North Star: "The Operations Board"**

Team Pulse is a status board you read at a glance, the way a shift supervisor reads a wall display from across the room. Its job is to answer one question faster than any other interface could: who is working right now. Everything in the system serves that glance. Information density is high, color is never decorative, and the largest type on the screen is a number rather than a title.

But this is a board about **colleagues, not units**. That is the tension the system deliberately holds. Time-and-attendance software drifts naturally toward surveillance: rows of identifiers, red flags, exception reports. Team Pulse refuses that reading. People appear as faces and full names before they appear as durations. States that would falsely accuse someone are suppressed rather than displayed with an asterisk. The palette's alert red is rationed hard enough that seeing it means something. The density is in service of the people using it, never pointed at the people inside it.

The component language stays restrained and precise so the data can be loud. Surfaces are flat at rest and lift only under the cursor. Borders are hairline. Radii are small and consistent. The interface is built to disappear behind eight status colors and a column of names.

**Key Characteristics:**
- Glanceable first: legible from across a room on a wall display, dense enough to fit a full team without scrolling
- Color is meaning, never decoration: every colored element encodes a state
- Warm at the human layer: avatars and full names outrank identifiers and metrics
- Flat at rest, lifted on interaction
- Dual-theme by construction: identity holds in both light and dark
- Inherits the NBIT parent brand palette rather than establishing its own

## Colors

A cool institutional palette inherited from Network Builders IT (royal blue, navy, gold) carrying a warm, rationed set of state colors on top.

### Primary
- **Royal Blue** (`#00579D`): Every primary action, active navigation state, focused input border, and link. The single interactive color; if something is blue, it can be acted on.
- **Deep Navy** (`#133F62`): The hover and pressed partner to Royal Blue. Also the emphasis tone in gradients and dark text on tinted surfaces.

### Secondary
- **Ink Navy** (`#162334`): The top navigation bar and the dark-theme surface. Doubles as the primary body-text color in light theme, which is what keeps the interface feeling grounded rather than floating.
- **Sky** (`#59BFEF`): Reserved for elements sitting on dark navy, where Royal Blue lacks contrast. The active nav underline and dark-theme primary text.

### Tertiary
- **Signal Gold** (`#FFBF1D`): The NBIT accent. Used sparingly for highlights and markers. It is the one color in the system with no state meaning attached, which is exactly why it must stay rare.

### Neutral
- **Canvas** (`#F4F7FA`): The page background. Cool enough to make white panels read as raised without a shadow.
- **Surface** (`#FFFFFF`): Every panel, card, input, and row.
- **Hairline** (`#D6E2EE`) and **Hairline Strong** (`#B3C8DC`): Structural borders and the stronger stroke on interactive controls (inputs, secondary buttons).
- **Ink** (`#162334`) → **Ink Two** (`#2D4459`) → **Muted** (`#5A7A96`) → **Muted Two** (`#8DAABF`): A four-step text ramp. Ink for content, Ink Two for secondary content, Muted for labels, Muted Two for the faintest metadata.

### State colors
These are the working vocabulary of the board and the reason the palette exists.

- **Working Green** (`#059669`): Clocked in and available.
- **Attention Amber** (`#D97706`): Derived warnings — late, missing punch, understaffed.
- **Alert Red** (`#E23A39`): Out sick, coverage gap, destructive actions.
- **Break Orange** (`#F97316`): On break. Paid time, still on the clock.
- **Lunch Violet** (`#8B5CF6`): At lunch. Unpaid time, deducted from totals.

Each state color ships as a triplet: the solid value, a `-soft` tint for row and badge backgrounds, and a `-text` value tuned for legibility on that tint. Dark theme overrides the tint to a low-alpha version of the solid and lightens the text value.

### Named Rules

**The Meaning-Only Rule.** Color never decorates. If an element is colored, it encodes a state a user can act on. A colored element with no state behind it is a bug.

**The Eight States Rule.** The status vocabulary is closed at eight: Available, On Break, At Lunch, Not Punched In, Punched Out, Out Sick, On Vacation, Business Trip. A ninth state must replace one, not append to it. The board's readability depends on the vocabulary staying memorizable.

**The Rationed Red Rule.** Alert Red appears only for genuine exceptions and destructive controls. A screen where red is common is a screen where red has stopped working. Break and lunch deliberately use orange and violet rather than shades of amber so that a room full of people on break never reads as a room full of problems.

## Typography

**Display / Body Font:** Inter, with `ui-sans-serif`, `system-ui`, `-apple-system`, `Segoe UI`, `Roboto` fallbacks
**Label / Mono Font:** None distinct; labels are Inter at small sizes with letterspacing

**Character:** A single neutral grotesque doing all the work, differentiated by size and weight rather than by family. The system leans on a heavy weight ramp (500 / 600 / 700) across a compressed size range, which is what lets an 11px label and a 24px metric feel like the same voice.

### Hierarchy
- **Display** (700, 24px, line-height 1): Metric readouts only. The summary stat counts on the dashboard. This is the largest type in the product and it is always a number.
- **Headline** (600, 19px, line-height 1.3): Page titles (`h1`).
- **Title** (700, 16px): Status group headings on the board ("Clocked In", "Out Today"), paired with a color dot and a count chip.
- **Body** (400–500, 14px, line-height 1.5): Base prose and default control text.
- **Label** (500, 11px, uppercase, 0.06em tracking): Eyebrows and stat captions. Uppercase and tracked so it reads as a caption at a glance and never competes with a name.
- **Micro** (600, 10px): Dense inline metadata — timezone abbreviations, relative timestamps, secondary counts.

### Named Rules

**The Number Is The Headline Rule.** The biggest type on any operational screen is a count, not a title. Headings identify sections; numbers carry the message. Never let a page title out-scale the metric it introduces.

**The Dense Body Rule.** Working UI text lives at 11–13px; 14px is base prose, not the default for interface chrome. This is deliberately tighter than a marketing surface and is what allows a full team on one screen. Do not "fix" the density by scaling type up globally.

## Layout

The app is a fixed top navigation bar (52px, reducing to 44px on phones) over a full-height scrolling panel. The dashboard is the system's defining layout: a two-column CSS grid of `1fr / 296px`, collapsing to a single column at 1000px.

Content sits in stacked status groups, each a titled section containing a list of person rows. Lists use a flat single-column list view rather than a card grid, because vertical scanning of names is the primary reading motion.

**Spacing rhythm** runs on a compressed scale — 4, 6, 8, 10, 12, 16, 18px — with 10px as the default gap between related elements and 24px separating major sections. Panel padding is 14–18px.

**Responsive behavior** is a genuine reordering, not a reflow. Below 768px the sidebar's clock widget moves above the main column (`order: -1`), the Clocked In group moves to the top of the board, Team Events drops to the bottom, and the horizontal nav collapses to a hamburger dropdown. Secondary affordances — search, filters, activity feed, the monitor pop-out — are hidden outright rather than stacked, because the phone use case is a five-second punch, not administration.

### Named Rules

**The Punch-First Rule.** On any viewport under 768px, the clock control is the first thing in the document flow. Nothing outranks it. If a new section claims the top of the mobile board, it is wrong.

**The Hide, Don't Stack Rule.** On phones, secondary controls are removed rather than pushed below the fold. A control that is not part of the five-second task does not earn vertical space.

## Elevation & Depth

The system is **flat at rest with state-driven lift**. Depth is carried by hairline borders and the cool canvas behind white surfaces, not by ambient shadow. Shadows appear as a response to interaction, never as a permanent property of a surface.

Two shadow steps only. Anything heavier reads as a modal.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 2px rgba(22, 35, 52, 0.06)`): The near-invisible seat on person cards. Enough to separate a row from the canvas, not enough to read as raised.
- **Lift** (`box-shadow: 0 1px 3px rgba(22, 35, 52, 0.10), 0 1px 2px rgba(22, 35, 52, 0.05)`): Hover only, paired with a border shift to Hairline Strong.

Dark theme swaps both to pure-black alphas (0.35 / 0.50) because the navy surfaces need more separation than a tinted shadow can provide.

### Named Rules

**The Flat-At-Rest Rule.** A surface at rest has a border, not a shadow. Shadow is a response to the cursor. A screen full of shadowed cards is a screen with no hierarchy.

## Shapes

A tight, three-step radius ladder plus a pill, applied by role rather than by size.

- **6px** (`sm`): Controls — buttons, inputs, selects, icon buttons.
- **8px** (`md`): Small containers — summary stat tiles, banners.
- **12px** (`lg`): Primary containers — panels and person cards.
- **Pill** (`9999px`): State carriers only — status badges, count chips, avatars.

Borders are uniformly 1px. Interactive controls use the stronger hairline; structural containers use the lighter one.

### Named Rules

**The Pill-For-State Rule.** Full radius signals state; rectangular radius signals structure. A pill is a thing that can change (a status, a count, a person). A rounded rectangle is a thing that holds. Never round a container to a pill or square off a badge.

## Components

### Buttons
- **Shape:** Small radius (6px), fixed 34px height, 13px medium text, 6px icon gap
- **Default:** White surface, Hairline Strong border, Ink Two text. Hover fills with the neutral tint.
- **Primary:** Royal Blue fill, white text, matching border. Hover deepens to Navy.
- **Danger:** Alert Red fill, white text. Hover deepens to `#B91C1C`.
- **Warning:** Attention Amber fill, white text. Hover deepens to `#B45309`.
- **Disabled:** 38% opacity, `not-allowed` cursor. No color change, so the variant stays identifiable while inert.
- **Icon-only:** 34×34 square at the same radius, keeping the control row on one rhythm.

### Cards / Containers
- **Panels:** 12px radius, white surface, hairline border, `overflow: hidden` so headers and dividers clip cleanly. No shadow.
- **Person cards:** 12px radius, 14×15px padding, 10px internal gap, Rest shadow, lifting to Lift shadow with a border shift on hover.
- **State rows:** When a person is on break or at lunch, the entire row takes the state tint as its background. The row itself is the badge — the strongest signal in the system, and the reason it is reserved for exactly two transient states.

### Inputs / Fields
- **Style:** 34px height, 6px radius, white surface, Hairline Strong border, 13px text
- **Focus:** Border shifts to Royal Blue plus a 3px soft ring
- **Textarea:** Auto height, 72px minimum, vertical resize only

### Navigation
- **Desktop:** Fixed 52px bar on Ink Navy. Links at 12.5px medium in 60%-white, going solid white when active with a 2px Sky underline. Symmetrical transparent top border keeps the label optically centered.
- **Mobile:** Bar compresses to 44px and links collapse into a hamburger dropdown showing the current page name beside the toggle. The dropdown carries icons, an active highlight, and a footer with the user, theme toggle, and sign-out.

### Status Badge (signature)
The system's most reused component and its core vocabulary. A pill (3×9px padding, 11px medium) pairing a 6px color dot with a label, tinted with the state's `-soft` background and `-text` foreground. It carries all eight attendance states and appears in the person card, the clock widget, and the monitor view identically.

### Summary Stat (signature)
The board's headline instrument. A flexing tile (8px radius, 12×14px padding, 96px minimum) stacking a 24px/700 count in the state color over an 11px uppercase caption in Muted. Six of these form the dashboard's top row. The count is the type ceiling of the entire product.

### Monitor Row (signature)
The compact wall-display variant: a dense row of status dot, full name, and duration on the dark surface, with the break and lunch rows carrying their state tint at 12% alpha. Built to stay legible on a second screen at distance.

## Do's and Don'ts

### Do:
- **Do** lead every person with an avatar and full name. The Operations Board is a board about colleagues; identifiers and durations are secondary. Where a photo exists, use it.
- **Do** reach for an existing state color before adding one. The palette ships five state colors and four neutral steps; nearly every need is already named.
- **Do** keep working UI text at 11–13px and let 14px be prose. Density is the feature.
- **Do** suppress a derived flag that would be wrong rather than showing it with an explanation. A false "Late" costs more trust than a missing one.
- **Do** define new colors as CSS custom properties in the `:root` block with a light value and a `[data-theme="dark"]` override. Both themes ship; identity must hold in both.
- **Do** put the clock control first on mobile, above every other section.

### Don't:
- **Don't** use the current input focus ring value. It is `rgba(79, 70, 229, 0.1)` — indigo `#4F46E5`, left over from a previous palette and unrelated to any token in this system. It should be a Royal Blue alpha. **This is a known defect, documented here so it gets fixed rather than copied.**
- **Don't** hardcode semantic hex values outside the token block. Break Orange and Lunch Violet are currently written as literals rather than custom properties, which is why they have no dark-theme override of their own and no `-soft` / `-text` triplet. New state colors must follow the triplet pattern.
- **Don't** add shadow to a surface at rest. Border plus canvas contrast is the resting depth model.
- **Don't** expand the thick side-accent border pattern (`border-left: 3px/4px solid`). Four instances exist; they are a legacy treatment, not a system component, and the flat-plus-hairline language is the actual rule.
- **Don't** introduce a second typeface. The system differentiates by weight and size within one grotesque, and the compressed size range depends on that consistency.
- **Don't** let Signal Gold spread. It is the only color with no state meaning; its value is scarcity.
- **Don't** scale type up to "fix" density complaints. Investigate hierarchy and spacing first — the dense scale is deliberate and load-bearing.
