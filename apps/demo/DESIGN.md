---
name: ValiCore demo
description: Public-service clarity for fiscal-code calculation and library integration.
colors:
  ink: "#19334b"
  muted: "#526879"
  accent: "#146957"
  accent-hover: "#0d5143"
  accent-active: "#083e33"
  line: "#d4dfe7"
  tint: "#eef5fa"
  page: "#f4f7fa"
  surface: "#ffffff"
  output-surface: "#fbfcfe"
  focus: "#186cc3"
  selection: "#c5e7e0"
  field-line: "#b7c8d5"
  field-line-hover: "#839dab"
  placeholder: "#5c7181"
  runtime-ink: "#385769"
  feature-hover: "#edf4f6"
  card-surface: "#dfedf7"
  card-line: "#b6d0e3"
  card-ink: "#1b4666"
  card-muted: "#3d5e76"
  card-divider: "#afc9dd"
  card-country-line: "#8eacc2"
  pass-ink: "#105741"
  pass-surface: "#e5f3ec"
  pass-line: "#b8d6c6"
  fail-ink: "#9d3026"
  fail-surface: "#fff0ef"
  fail-line: "#e6ada8"
  unknown-ink: "#725016"
  unknown-surface: "#fbf1dc"
  unknown-line: "#e0cca4"
  code-ink: "#dce8f2"
  code-line: "#365269"
  code-control-surface: "#233f58"
  code-control-line: "#577085"
  code-control-ink: "#e8f1f9"
  code-muted: "#b9cddd"
  code-selected: "#e4eff7"
  code-hover-line: "#8ba5ba"
  syntax-string: "#a3e2d2"
  syntax-keyword: "#c5bcf0"
  syntax-comment: "#a8bdce"
  syntax-number: "#f1cf94"
  scrollbar-thumb: "#94acbd"
  scrollbar-track: "#f1f5f8"
typography:
  display:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.4
  hero-body:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  result:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  action:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  field:
    fontFamily: "'Public Sans', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  card-code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.045em"
  code-output:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: "0.025em"
  code-example:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.8
rounded:
  text: "3px"
  chip: "4px"
  field: "5px"
  button: "6px"
  brand: "7px"
  workspace: "10px"
  health-card: "13px"
spacing:
  micro: "4px"
  icon: "6px"
  small: "8px"
  compact: "12px"
  field-gap: "16px"
  form-row: "18px"
  pane-heading: "20px"
  code-result: "22px"
  gutter: "24px"
  pane: "28px"
  wide-gap: "32px"
  mobile-section: "36px"
  docs-gap: "40px"
  section: "52px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent-active}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    padding: "11px 18px"
  button-secondary-hover:
    textColor: "{colors.accent}"
  button-text:
    textColor: "{colors.accent}"
    rounded: "{rounded.text}"
    padding: "8px 4px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  workspace:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.workspace}"
  health-card:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.card-ink}"
    rounded: "{rounded.health-card}"
    padding: "22px"
  check-pass:
    backgroundColor: "{colors.pass-surface}"
    textColor: "{colors.pass-ink}"
    rounded: "{rounded.chip}"
    padding: "3px 7px"
  check-fail:
    backgroundColor: "{colors.fail-surface}"
    textColor: "{colors.fail-ink}"
    rounded: "{rounded.chip}"
    padding: "3px 7px"
  check-unknown:
    backgroundColor: "{colors.unknown-surface}"
    textColor: "{colors.unknown-ink}"
    rounded: "{rounded.chip}"
    padding: "3px 7px"
  code-workspace:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.code-ink}"
    rounded: "{rounded.workspace}"
---

# Design System: ValiCore demo

## Overview

**Creative North Star: "Public-service clarity"**

Daylit, practical and compact: ink-blue text, pale-blue and white panels, teal actions, and small consistent corners make a working citizen calculator approachable. The health-card-inspired result is an encoded-data preview with an explicit demo label, not an official credential.

The same world supports denser developer tools. Monospace data and a dark integration-code panel distinguish technical evidence without changing the surrounding light interface. This documents the built implementation in `index.html`, `src/style.css` and `src/main.ts`; the direction contract remains in `.impeccable/surfaces/index-html.md`. General finish review: three material issues resolved; scoped disposition **ship**.

**Key Characteristics:**
- Citizen-first working forms and a readable result beside them.
- Flat, bordered surfaces with restrained depth on the demo card.
- Teal interaction cues and explicit, text-bearing validation states.
- Light application chrome with a dedicated dark code surface.

## Colors

Frontmatter values are the normative extracted palette; CSS custom-property names retain their implementation names. Additional slugs describe literals already used in the stylesheet. Sidecar tonal ramps are synthesized preview swatches, not additional application tokens.

### Primary
- **Service teal** (`accent`, `accent-hover`, `accent-active`): submit buttons, active tabs, links, selector scenarios and input carets. Hover darkens; pressing a primary button darkens further.
- **Keyboard blue** (`focus`): visible focus outlines and focused field borders.

### Secondary
- **Card blue** (`card-*`): pale preview stock, blue encoded text, muted captions and visible field/header dividers.
- **Outcome colors** (`pass-*`, `fail-*`, `unknown-*`): green passed checks, red failures, amber indeterminate checks. Each carries a status word; red also marks runtime and result errors.
- **Syntax colors** (`syntax-*`): mint strings/copy action, lavender keywords, blue-grey comments and amber numbers inside integration code.

### Neutral
- **Public-service ink** (`ink`) and **slate** (`muted`): hierarchy and supporting explanations; ink also grounds the code panel.
- **Daylight surfaces** (`page`, `surface`, `tint`, `output-surface`): page, workspaces, runtime/structured data and result pane respectively.
- **Quiet boundaries** (`line`, `field-line`, `field-line-hover`): panel separation and field affordance. `placeholder` remains readable supporting text.
- **Code neutrals** (`code-*`): dedicated text, borders, controls, pressed language selection and hover outlines on the dark surface. `selection` and `scrollbar-*` support text selection and overflow areas.

**The Explicit State Rule.** Pair status color with a readable status label; indeterminate is a distinct outcome, not a failed check.

## Typography

**Display and body:** Public Sans with system-ui/sans-serif fallback. The self-hosted variable font supports weights (100–900), uses `font-display: swap` and disables synthesized faces. `public/fonts/README.md` records the Google Fonts/USWDS source; `public/fonts/OFL.txt` contains SIL Open Font License 1.1.

**Data and code:** the platform monospace stack in frontmatter; dates use tabular numerals. The hierarchy is compact and role-based, not a mathematical scale:
- **Display / headline:** balanced hero heading and section titles; both use semibold (650) with tight tracking.
- **Title:** pane/result headings (16px); integration panel headers reduce to (14px). Pane headings use tighter tracking (-0.015em).
- **Body:** hero explanation (14px), docs and empty states (13px), structured results (12px). API descriptions/details use line-height (1.7); empty states use (1.65).
- **Label / metadata:** persistent field labels (12px, 600), supporting notes (11px), check chips and technical metadata (10px).
- **Code:** preview code uses `card-code`; calculated output uses `code-output` and reduces to (18px) in the playground. Copyable integration examples use `code-example`; structured reports use (12px).

## Layout

The header is centered at max-width (1240px), with padding (22px 32px). Main/footer max-width is (1176px); main has horizontal padding (24px). The hero is a short heading and integration CTA, followed immediately by the calculator workspace. Two equal columns put personal details left and the card/output right; form fields use a two-column grid with gap (18px 16px) and full-width place rows. Pane padding is (28px).

Features follow as two columns of actionable ruled rows. Integration pairs the live playground with its code example using equal `minmax(0, 1fr)` columns and a gutter (24px). Documentation pairs a quick-reference list with native expandable topics, separated by (40px). Section spacing is (52px). There is no strict base-unit spacing grid: use the extracted recurring steps rather than rounding all values to a new scale.

Responsive implementation:
- **At ≤1000px:** pane padding becomes (24px), card code (20px), card footer stacks, and code controls become a column.
- **At ≤760px:** hero/CTA stack; calculator, integration, documentation and features become single-column. The output follows inputs with a top divider. Main/pane horizontal padding becomes (20px), section gaps (36px), headings (28px/20px), and regular form input/select text increases to (16px). Paired form fields remain paired. The integration operation select retains its specialized (11px) code-control styling.
- **Mobile navigation:** Features and the Source text label disappear; Playground, Docs and the source SVG link remain. The local-computation note hides, while runtime status stays visible. Playground tabs wrap; code stays horizontally scrollable rather than reflowing source lines.
- **At ≤370px:** compact brand/navigation spacing, card code (19px), and vertically arranged code controls.

## Elevation & Depth

Depth comes primarily from surface tone and one-pixel borders. Workspaces and code panels are flat. The demo card alone has a quiet structural shadow (`0 8px 20px rgb(38 74 101 / 7%)`); avoid treating every content group as a floating card.

Motion is limited to smooth anchor scrolling and the feature arrow's horizontal shift (3px over 180ms, ease-out). Reduced-motion preference disables smooth scrolling, transitions and animation. Most control states change immediately.

## Shapes

Use restrained corners: workspace (10px), demo card (13px), buttons/install bar (6px), fields/structured-report blocks (5px), check and scenario chips (4px), text controls/country marker (3px), and brand mark (7px). Tabs and ruled feature/docs rows remain square and flat. Borders define separation; inline stroked SVGs use a consistent line style. No raster assets ship; the preview and brand are HTML/CSS, icons are inline SVG, and the font source/license ship under `public/fonts`.

## Components

### Buttons and fields
- Primary submit actions are teal with white text, minimum height (44px), and frontmatter padding. The integration CTA is a white outlined secondary button; its hover changes border and text to teal. Text buttons underline on hover.
- Inputs/selects have persistent labels, white fills, subtle strokes and minimum height (44px). Hover strengthens the stroke; focus uses the blue border plus global `:focus-visible` outline (3px, offset 3px). Helper text explains dated province/place selection and EE foreign countries.
- Disabled buttons/inputs use opacity (0.55) and a wait cursor while runtime loads. Native required/range validation remains; application exceptions appear in a red result block, not an invented per-field error design. Runtime failure is a tinted red status with reload guidance.

### Navigation and tabs
- Header links are muted and become teal on hover. The skip link appears on keyboard focus and targets the calculator.
- Citizen and playground tabs use `aria-selected`, a teal bottom stroke (2px), and semibold selection. Only the selected tab is in the sequential tab order. Left/Right arrows wrap within its tablist; Home/End select the first/last tab. Activation focuses the target, shows its panel, and synchronizes the integration example.
- Feature buttons activate, scroll to and focus the relevant tool tab; the distribution feature opens its documentation topic. Native details/summary provide keyboard-operable disclosures. Code blocks are focusable for keyboard scrolling.

### Citizen calculator and demo card
- Calculate and Validate & decode are peers in the citizen workspace. Direct calculation uses dated place selection; inverse input includes an explicit candidate-year range and an initial code-anatomy legend.
- The card shows uppercase names, date, sex, place and a prominent monospace fiscal code. Its footer always says **DEMO · NOT AN OFFICIAL DOCUMENT**. The IT marker is a plain outlined label, not an official seal.
- Editing form input hides its previous result. Card fields update immediately, its code resets to bullets at reduced opacity, and its state reads “Calculate to update”. Successful calculation sets “Calculated” and shows copy/decode actions plus expandable calculation evidence. “Decode this code” carries the exact birth year into inverse calculation and submits it.
- Inverse results combine labeled check chips, name fragments, candidate dates and historical place records. Place lists scroll at max-height (380px); full records/reports remain expandable. Allocation, century and identity limits stay next to the relevant outputs.

### Developer code and documentation
- Features lead into the real-runtime playground: omocodia, place archive, reusable dated selectors, person matching and name/checksum utilities. Results use the same light bordered grammar.
- The install command is copyable, with beta tarball build context and a separate disclosure for future registry publication. The adjacent dark example panel has an operation selector, JavaScript/TypeScript pressed-state buttons, syntax coloring and a copy action. Copy feedback changes to “Copied” or “Select text to copy”, announces politely, and resets after (2200ms).
- Documentation stays below integration: API signatures form a ruled definition list; Quick start opens initially and deeper topics use native disclosures. Runtime/data versions and source reconciliation remain visible evidence, rather than decorative badges.
- Dynamic results announce with `aria-live="polite"`; runtime status uses `role="status"`. Language choices expose `aria-pressed`; source icons retain accessible link labels when their visible text hides on mobile.

## Do's and Don'ts

### Do:
- **Do** reuse the extracted teal, ink and daylight surfaces for working controls and evidence.
- **Do** keep persistent field labels, visible keyboard focus and text-bearing check states.
- **Do** invalidate stale results when input changes and keep the card's demo label visible.
- **Do** stack major panels on mobile, preserve usable input text and contain code overflow.
- **Do** retain the self-hosted Public Sans source and OFL license alongside the font.

### Don't:
- **Don't** present the demo card, calculation or matching result as an official credential, registry allocation check or proof of identity.
- **Don't** replace the citizen-first calculator with a dark console; reserve the dark surface for integration code.
- **Don't** hide century ambiguity, historical place versions or indeterminate validation behind a single success/failure color.
- **Don't** introduce official seals, raster decoration or unsupported language wrappers into this documented implementation.
