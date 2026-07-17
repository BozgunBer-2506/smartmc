# Smart Message Center - DESIGN_SYSTEM.md

```yaml
Title: DESIGN_SYSTEM.md
Version: 1.0
Status: Approved
Owner: Design Systems
Last Updated: 2026-07-18
Depends On:
  - PRODUCT.md
  - UI_GUIDE.md
  - ARCHITECTURE.md
Related ADRs:
  - ADR-0011
```

Author role: Senior Design Systems Engineer. Scope: the complete, implementation-ready design system for Smart Message Center, built on shadcn/ui + Tailwind CSS, and structured to serve three targets from one source of truth: the Next.js web app, the Tauri desktop app, and a future React Native mobile app (`ROADMAP.md` Phase 14).

---

## 1. How This System Is Structured (Read This First)

Three layers, strictly separated, because the alternative - values hardcoded per-component - is exactly what makes a design system stop being one:

1. **Design tokens** (Section 4-8) - raw values (colors, spacing, type scale) with no knowledge of any specific component. Platform-agnostic, stored as the actual source of truth.
2. **Primitive components** (Section 9) - shadcn/ui components, customized via Tailwind + CSS variables to consume the tokens. Web/desktop-specific (React + DOM).
3. **Composite/product components** (Section 10) - Smart Message Center-specific components (message bubbles, rule builder nodes, identity chips) built from primitives, implementing `UI_GUIDE.md`'s screens.

**Why tokens are a separate layer from day one, even though React Native doesn't exist until Phase 14**: `packages/ui` (shadcn/Tailwind, DOM-based) cannot be reused by React Native (no DOM, no Tailwind runtime) - but the *tokens* (a color is `#1B2333`, a spacing unit is `8px`) are platform-agnostic and can be. Tokens live in `packages/design-tokens` (a plain TypeScript/JSON package with no React dependency at all), consumed by `packages/ui`'s Tailwind config today and by a React Native `StyleSheet`-mapping layer in Phase 14 - avoiding a full design-system rewrite when mobile actually starts, per this whole documentation set's established discipline of not deferring architectural decisions past the point they're cheap to make.

---

## 2. Brand Identity (Design System Application)

Restates and operationalizes `PRODUCT.md`'s Brand section - this document is where "calm competence" becomes actual hex codes and pixel values, not a re-litigation of the brand decision itself.

- **Personality → visual translation**: restrained, not playful; precise, not decorative. No gradients, no illustration-heavy empty states, no bouncy micro-animations (Section 16). Confidence is expressed through clarity and whitespace, not visual flourish.
- **The accent color's job is singular and non-negotiable** (`PRODUCT.md`): it means "this needs you" - VIP, high priority, urgent. It is never used decoratively (never a marketing CTA color, never a random chart series color, never a hover-state flourish on an unrelated element). A design review that finds the accent color used for anything other than genuine priority signaling is a defect, not a style choice, and is treated as a Section 15 accessibility-adjacent violation of the same severity.
- **Typography carries the "system, not chaos" message**: a clean grotesque for everything a human reads, a monospace face specifically in automation contexts (Section 6) - reinforcing `UI_GUIDE.md` Section 2.4's principle that automation is a legible, inspectable system, not a black box.

---

## 3. Design Principles (System-Level, Distinct From UX Principles)

`UI_GUIDE.md` Section 2 covers UX principles (what the product should feel like to use). This document's principles govern how the system is *built*, so those UX principles are achievable consistently rather than accidentally, once, in one screen:

1. **Every visual value is a token. No component ever hardcodes a hex code, a pixel value, or a font size.** If a value isn't in the token set, the token set is incomplete - that's the bug to fix, not an excuse to hardcode.
2. **Semantic naming over literal naming.** A token is named `color-surface-danger`, never `color-red-500` - so changing what "danger" looks like (a rebrand, a dark-mode adjustment) never requires touching component code, only the token definition.
3. **Accessible by construction, not by audit.** Contrast ratios, focus states, and touch targets are enforced by the token values and primitive components themselves (Section 15) - an individual screen should not be able to accidentally ship inaccessible, because the building blocks don't allow it.
4. **One component, every provider.** Per `UI_GUIDE.md` Section 2.3, no connector gets its own visual component - the message, conversation, and identity components in Section 10 are provider-agnostic by construction, with a provider badge as the only per-source visual differentiation, ever.
5. **Dark mode is not a second theme to maintain - it's the same tokens resolved differently.** Every color token has both a light and dark value defined together, from the token's creation, never retrofitted (Section 14).
6. **Motion is purposeful or absent.** Animation exists to communicate state change (a message arriving, a panel opening), never as decoration - and every animation respects `prefers-reduced-motion` without exception (Section 16).

---

## 4. Color System

### 4.1 Palette Structure

A restrained, semantic palette per `PRODUCT.md` Section "Brand": deep ink/blue neutrals as the base, a single warm accent reserved exclusively for priority signaling, and standard status colors for system feedback (distinct from the priority accent, never confused with it).

| Token | Light value (reference) | Dark value (reference) | Usage |
|---|---|---|---|
| `color-background-base` | near-white, cool-neutral | near-black, cool-neutral | App background |
| `color-surface-1` | white | dark ink, one step up from base | Cards, panels, the Inbox list |
| `color-surface-2` | light neutral gray | slightly lighter than surface-1 | Nested surfaces (context panel, modals) |
| `color-border-subtle` | low-contrast neutral | low-contrast neutral, dark-adjusted | Dividers, card borders |
| `color-border-strong` | higher-contrast neutral | higher-contrast neutral, dark-adjusted | Focus rings, active input borders |
| `color-text-primary` | near-black ink | near-white | Primary reading text |
| `color-text-secondary` | mid-gray | mid-gray, dark-adjusted | Timestamps, metadata, secondary labels |
| `color-text-disabled` | low-contrast gray | low-contrast gray, dark-adjusted | Disabled states only |
| `color-accent-priority` | warm amber/coral (per `PRODUCT.md`) | same hue, luminance-adjusted for dark-mode contrast | **VIP/priority/urgent signaling only - never decorative, Section 2** |
| `color-status-success` | standard accessible green | dark-adjusted | Success toasts, healthy connector status |
| `color-status-warning` | standard accessible amber (visually distinct from `color-accent-priority` - different hue, not just different shade, so "priority" and "warning" are never confusable) | dark-adjusted | Degraded connector status, non-blocking warnings |
| `color-status-danger` | standard accessible red | dark-adjusted | Errors, destructive-action confirmations |
| `color-status-info` | neutral blue | dark-adjusted | Informational toasts, AI-content border (Section 13 cross-ref to `UI_GUIDE.md` Section 13) |

**Why `color-accent-priority` and `color-status-warning` must be visually distinct hues, stated as a rule, not left to a designer's judgment call per screen**: `UI_GUIDE.md` Section 6.3 requires priority indicators to never rely on color alone, but even with an icon paired, two visually similar ambers (one meaning "this is a VIP" and one meaning "this connector is degraded") sitting near each other in a busy UI is a real misread risk - Section 4.1's palette is deliberately designed so this confusion is structurally prevented, not just discouraged.

### 4.2 Provider Badge Colors

A small, fixed, low-saturation color per connected provider (Telegram blue, Slack's own palette-adjacent purple, Discord's blurple, a neutral gray for Email) - used **only** on the small badge element (`UI_GUIDE.md` Section 2.3), never as a background, border, or accent anywhere else in a message or conversation component. This is the one deliberate, bounded exception to Section 3.4's "no provider-specific visuals" principle - identifying *source* is useful; theming the whole experience per-provider is exactly what `UI_GUIDE.md` explicitly rules out.

### 4.3 Contrast & Accessibility Baseline

Every text/background token pairing in Section 4.1 meets WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text/UI components) in both light and dark mode - verified as part of token definition, not left to per-component testing (Section 15).

---

## 5. Typography

- **Primary typeface**: a clean, highly legible variable grotesque sans-serif (Inter or equivalent, per `PRODUCT.md`) for all UI chrome and message content - optimized for scanning a dense inbox quickly.
- **Monospace typeface**: reserved for automation/rule-builder contexts specifically (trigger/condition/action node labels, raw values in the debugger, `AUTOMATION_ENGINE.md` Section 14.4) - a deliberate visual signal that "this is precise, inspectable system logic," never used for regular body text or chrome.

| Token | Size | Weight | Usage |
|---|---|---|---|
| `type-display` | 28px | Semibold | Onboarding/empty-state headlines only (Section 16 of `UI_GUIDE.md`) |
| `type-heading-1` | 22px | Semibold | Screen titles (Inbox, People, Automations) |
| `type-heading-2` | 17px | Semibold | Section headers, card titles |
| `type-body` | 15px | Regular | Message content, primary reading text |
| `type-body-emphasis` | 15px | Medium | Sender names, key labels |
| `type-caption` | 13px | Regular | Timestamps, metadata, secondary labels |
| `type-label` | 12px | Medium, uppercase, letter-spaced | Section labels, badge text |
| `type-mono` | 13px | Regular (monospace) | Automation builder node content, debugger values |

Line-height and letter-spacing are token-paired with each size (not a separate independent token) - a type-scale entry is one indivisible unit, preventing the common drift where font-size gets reused with inconsistent, ad hoc line-heights across components.

---

## 6. Spacing

An 4px base unit, exposed as a restrained token scale rather than arbitrary pixel values anywhere in component code:

`space-1` (4px) · `space-2` (8px) · `space-3` (12px) · `space-4` (16px) · `space-5` (24px) · `space-6` (32px) · `space-8` (48px) · `space-10` (64px)

Component-internal padding, gaps between elements, and section margins all draw from this scale exclusively (Section 3.1) - a component requiring a spacing value not on this scale is a signal to reconsider the layout, not to introduce a one-off value.

---

## 7. Layout Grid

- **Web/desktop**: a three-pane layout for the Inbox (`UI_GUIDE.md` Section 6.1) - a fixed-width list pane (≈320px), a flexible-width thread pane (majority of remaining space, per UI_GUIDE's "widest pane" rule), and a fixed-width context pane (≈360px, collapsible to 0). Other screens (People, Automations, Settings) use a standard single-content-column-plus-sidebar grid, max content width capped (≈1200px) to keep line lengths readable on large monitors.
- **Container/content max-widths**: `layout-content-max` (1200px), `layout-reading-max` (720px, used for long-form content like a full conversation timeline within the thread pane) - both tokens, not magic numbers per screen.
- **Grid gutter**: `space-4` (16px) as the default column gap across all multi-column layouts.

---

## 8. Responsive Rules

- **Breakpoints**: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px) - standard Tailwind defaults, deliberately not customized, so the breakpoint system stays legible to any engineer already familiar with Tailwind without needing this document open.
- **Below `lg`**: the three-pane Inbox (Section 7) collapses to two panes (list + thread; context pane becomes an overlay/drawer, not a third column) - a direct, deliberate step toward the single-pane mobile layout (`UI_GUIDE.md` Section 15), not a separate design.
- **Below `md`**: single-pane, stack-based navigation (list → thread → context, each a full view) - this is the same layout React Native (Phase 14) will use, so the responsive web behavior below `md` is effectively a live rehearsal of the mobile experience, keeping the two from diverging.
- **Desktop app (Tauri) minimum window size** is clamped to never render below the `md` breakpoint's layout - a desktop app rendering the single-pane mobile layout would contradict `UI_GUIDE.md` Section 14's positioning of desktop as a full, primary surface.

---

## 9. Primitive Components (shadcn/ui + Tailwind)

Every primitive is a customized shadcn/ui component, restyled via Tailwind utility classes bound to Section 4-6's tokens (exposed as CSS variables per shadcn's own convention - `--background`, `--foreground`, `--accent`, etc., mapped 1:1 to this document's token names so the mapping is never ambiguous). Primitives are intentionally unopinionated about Smart Message Center-specific meaning - that meaning lives in Section 10's composites.

- **Buttons**: `primary` (accent-adjacent neutral, per Section 2 - never the priority accent color, which is reserved for signaling, not chrome), `secondary`, `ghost`, `destructive` (uses `color-status-danger`, always paired with a confirmation step per `UI_GUIDE.md` Section 24). Sizes: `sm`/`md`/`lg`. Every button has a visible, token-defined focus-ring state (Section 15).
- **Inputs**: text, select, textarea, date/time-picker (the time-picker specifically must be fully keyboard-operable per `AUTOMATION_ENGINE.md` example #205 and `UI_GUIDE.md` Section 24's accessibility commitments - no mouse-only drag-to-select time UI). All inputs share one consistent error-state treatment (`color-status-danger` border + inline message, never a color-only signal).
- **Cards**: the base surface for message rows, person rows, rule rows (Section 10 composites all extend this one primitive, never a bespoke card style per feature).
- **Modals / Dialogs**: reserved for confirmation flows (`UI_GUIDE.md` Section 24's confirmation-required action list) and the merge/split review flow (Section 10.4) - never used for primary navigation or as a substitute for a proper screen.
- **Notifications / Toasts**: transient, dismissible, auto-expiring (except destructive-undo toasts, which persist until acted on or a longer timeout) - per `UI_GUIDE.md` Section 18's error-state and Section 24's "instant action + undo toast" pattern.
- **Avatars**: base primitive with a required fallback (initials on a deterministic, token-derived neutral background - never a random color per user, which would break Section 4's "no arbitrary color meaning" principle) - extended by Section 10.4's Identity Avatar composite.

---

## 10. Composite / Product Components

### 10.1 Message Components

One canonical message-bubble/row component (`UI_GUIDE.md` Section 2.3/8) rendering: avatar (Section 10.4), sender name, body (rich-text aware, per `DATABASE.md`'s `body_rich`), timestamp, provider badge (Section 4.2), attachment card(s), edited/deleted state treatment (`UI_GUIDE.md` Section 8), and an inline "why" affordance (Section 3's automation-attribution principle) shown only when relevant, never as persistent visual clutter on every message.

### 10.2 Conversation Components

Conversation list row (avatar, name, preview, provider badge, priority indicator, unread state - `UI_GUIDE.md` Section 6.3) and thread header (Person summary strip, tags, quick actions) - both built from Section 9 primitives plus Section 10.4's Identity Avatar.

### 10.3 Automation Builder Components

Directly implements `AUTOMATION_ENGINE.md` Section 7 and `UI_GUIDE.md` Section 10:

- **Trigger card**: a distinct top-of-canvas component, monospace type (Section 5) for the trigger type label, plain-language sentence fragment in primary type alongside it.
- **Condition node**: nested, indentation-driven tree rendering (AND/OR/NOT toggle as a small segmented control, never a dropdown that hides the current state) - each leaf condition a row with field/operator/value, each in its own token-consistent input (Section 9).
- **Action node**: sequential by default, with explicit visual connectors for branch/parallel/delay (`AUTOMATION_ENGINE.md` Section 5.2) - a distinct icon+connector-line treatment per action-graph shape, defined once as a token-driven pattern, not re-invented per rule.
- **Live plain-language preview banner**: persistent, visually separated (a distinct `color-surface-2` band), updates in real time - this is a load-bearing accessibility component (`UI_GUIDE.md` Section 10/`AUTOMATION_ENGINE.md` #208), not a cosmetic aid, and is held to the same reliability bar as the "Needs You" count (Section 3 of `UI_GUIDE.md`).

### 10.4 IdentityGraph Visual Components

The most novel component set in the system, since no other messaging product needs them (`ARCHITECTURE.md` Section 13):

- **Identity Avatar**: extends the base Avatar (Section 9) with an optional small multi-source indicator (a subtle stacked-dot or count badge) when a Person has more than one linked provider identity - signaling "this is a unified identity" without needing to open the full profile to know it.
- **Identity Link Chip**: represents one `ContactIdentity` on the Person screen (`UI_GUIDE.md` Section 7) - provider badge (Section 4.2) + handle + a small `match_type` indicator (a plain "linked" state for exact matches, a distinct "confirmed [date]" state for manually-approved fuzzy matches, per `ARCHITECTURE.md` Section 13.8's transparency requirement) - deliberately never visually identical between the two match types.
- **Merge Suggestion Card**: the UI for a `pending` `identity_merge_suggestions` row ([ADR-0013](adr/0013-identity-merge-safety-over-cleverness.md)) - shows both candidate Identity summaries side by side, the human-legible matching evidence (never a raw score, per `ARCHITECTURE.md` Section 13.8), and two clearly weighted actions: "Merge" and "Not the same person" (deliberately not styled as a simple binary toggle - "Merge" uses the `primary` button and "Not the same person" uses `secondary`, not `ghost`, so declining a suggestion feels like an equally legitimate, easy action, not a buried default).
- **Merge/Split Confirmation Dialog**: a Modal (Section 9) showing exactly what will combine or separate - message counts, tags, VIP status per side - before the action is confirmed, per `UI_GUIDE.md` Section 24's requirement that this specific confirmation be genuinely informative, not reflexive.

### 10.5 Data Tables

Used for rule execution logs (`AUTOMATION_ENGINE.md` Section 14.4), audit logs (`SECURITY.md` Section 8), and API key/session lists (`UI_GUIDE.md` Section 22) - one consistent table primitive: sortable headers, row-level expand for detail (never a separate navigation for "view more" on a log row), virtualized for large row counts (`UI_GUIDE.md` Section 25).

### 10.6 Charts

Reserved for Rule Analytics (`AUTOMATION_ENGINE.md` Section 15) - sparklines for match-rate trends, simple bar charts for action success/failure breakdown. Chart color usage follows Section 4's status colors exclusively (success/warning/danger for outcome breakdowns) - **never the priority accent color**, since a chart is analytical, not an attention signal, and reusing the accent here would dilute its one meaning (Section 2).

---

## 11. Accessibility Rules

- Every interactive primitive (Section 9) ships with a visible focus state using `color-border-strong` at a 2px offset ring - never `outline: none` without a replacement, anywhere, no exceptions.
- Minimum touch target 44x44px on any touch-capable surface (web responsive breakpoints below `md`, and the future React Native app).
- Every icon-only affordance has an accessible label (`aria-label` or equivalent) - per Section 5's "never icon-only in primary nav" rule extended to every icon button in the system.
- Color is never the sole carrier of meaning (Section 4.1) - every status/priority indicator pairs color with an icon or text label, verified as a design-review checklist item, not left to individual component authors' judgment.
- The automation builder's live plain-language preview (Section 10.3) and every Identity component's textual labels (Section 10.4) are the accessible equivalent of their visual counterparts - screen-reader testing against these two component families specifically is a release gate, not a nice-to-have, given `AUTOMATION_ENGINE.md`'s explicit accessibility examples (#196-208) depend on them.

---

## 12. Keyboard Navigation

- Full tab order follows visual reading order on every screen - no component is reachable only by mouse.
- The command palette (`UI_GUIDE.md` Section 5) and the documented ~15-shortcut set (`UI_GUIDE.md` Section 22) are implemented as a single, centralized keyboard-shortcut registry (one source of truth per shortcut → action mapping), not scattered per-component `onKeyDown` handlers that could silently drift out of sync with the `?`-overlay documentation.
- Modals/dialogs trap focus while open and restore it to the triggering element on close - standard, non-negotiable behavior for every Modal primitive (Section 9), verified once at the primitive level rather than per usage.

---

## 13. Dark Mode

Implemented purely through Section 4's paired light/dark token values resolved via a single theme context (system-preference-aware by default, user-overridable in Settings) - **there is no separate "dark mode stylesheet" to maintain**, per Section 3.5's principle. A component that looks correct in light mode and wrong in dark mode is, by definition, a component that hardcoded a value instead of using a token (Section 3.1) - this is treated as a bug category, not a design nuance to patch per-instance.

---

## 14. Animation Principles

- **Purposeful only**: state transitions (a panel opening, a toast appearing, a message arriving) get a brief (150-200ms), consistent easing curve (`motion-standard` token) - no animation exists purely for visual flair.
- **`prefers-reduced-motion` is respected everywhere, automatically**, via a single global check feeding all `motion-*` tokens - not a per-component opt-out a developer has to remember to add.
- **New-message arrival** gets the most deliberate motion treatment in the product (a subtle slide/fade into the conversation list) precisely because it's the single most frequent state change a user will see - worth getting right once, centrally, rather than left to accumulate inconsistent per-screen implementations.
- **The Automation Builder's action-execution visualization** (a rule "running" in the debugger, `AUTOMATION_ENGINE.md` Section 14.4) is the one place richer, longer motion is appropriate - watching a rule's logic execute step by step is a trust-building moment (`UI_GUIDE.md` Section 2.4), and deserves enough time to actually be legible, not a flash.

---

## 15. Component Naming Conventions

- **React components**: PascalCase, matching shadcn/ui's own convention (`MessageBubble`, `IdentityLinkChip`, `RuleConditionNode`).
- **Files**: kebab-case, one component per file (`message-bubble.tsx`, `identity-link-chip.tsx`) - matching shadcn/ui's CLI-generated file convention exactly, so shadcn's own tooling (`npx shadcn add`) continues to work without friction inside `packages/ui`.
- **Tokens**: kebab-case, hierarchical (`color-surface-1`, `type-heading-1`, `space-4`) as established in Sections 4-6 - never abbreviated inconsistently (`clr-`, `c-`) across the token set.
- **Composite component props**: prefer domain language over generic UI language where it improves clarity (`isVip` not `isHighlighted`, `matchType` not `variant`, on the Identity components specifically) - a direct, deliberate extension of `ARCHITECTURE.md`'s "the platform reasons about identities, not accounts" principle into the component API layer itself.

---

## 16. Cross-Platform Support Strategy

| Layer | Web (`apps/web`) | Desktop (`apps/desktop`, Tauri) | Mobile (`apps/mobile`, future React Native) |
|---|---|---|---|
| Design tokens (`packages/design-tokens`) | Consumed directly | Consumed directly (same web bundle) | Consumed via a token-to-`StyleSheet` mapping layer, built when Phase 14 starts |
| Primitives (`packages/ui`, shadcn/Tailwind) | Native | Native (Tauri wraps the same web build, per `ARCHITECTURE.md`) | Not reused - React Native requires native-equivalent primitives, built against the same tokens |
| Composites (Section 10) | Native | Native | Rebuilt against React Native primitives, same visual spec (this document), same component names where feasible |

**Why this is an acceptable, deliberate cost, not a gap**: `packages/ui`'s shadcn/Tailwind foundation is fundamentally DOM-based and cannot run natively on React Native regardless of token-sharing - attempting to force a single component implementation across web and native (via a heavy abstraction layer) has historically produced worse results on both platforms than accepting two implementations that share a token source of truth and a visual specification (this document). Phase 14's mobile work re-implements Section 10's composites against React Native primitives, guided by this document, not by re-deriving Sections 2-8 from scratch - the expensive design thinking is shared even though the component code isn't.

---

## 17. Implementation Notes for shadcn/ui + Tailwind

- `packages/design-tokens` exports the token set as both a Tailwind config extension (`theme.extend.colors`, `theme.extend.spacing`, `theme.extend.fontSize`, mapped directly from Sections 4-6) and as CSS custom properties (`--color-surface-1`, etc.) - shadcn/ui components consume the CSS variables per their standard theming convention, so upgrading a shadcn primitive via its own CLI never requires re-patching brand values back in.
- `packages/ui` holds Section 9's primitives (thin shadcn wrappers) and Section 10's composites, structured as its own buildable package per `ARCHITECTURE.md`/ADR-0011's monorepo layout - consumed by `apps/web` and `apps/desktop` identically.
- Dark mode (Section 13) is implemented via Tailwind's `class` strategy (a `dark` class on the root element, toggled by the theme context) rather than the `media` strategy - necessary because the product supports explicit user override of system preference (`UI_GUIDE.md`), which the `media` strategy alone cannot express.
- This document, `packages/design-tokens`, and `packages/ui` are expected to stay in lockstep - a token added here without a corresponding export, or a component built in `packages/ui` using a value not defined here, is a process failure to catch in review, mirroring this whole documentation set's standing rule that implementation never quietly outpaces its design record.
