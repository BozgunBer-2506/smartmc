# Smart Message Center - UI_GUIDE.md

```yaml
Title: UI_GUIDE.md
Version: 1.0
Status: Approved
Owner: Product Design
Last Updated: 2026-07-18
Depends On:
  - PRODUCT.md
  - ARCHITECTURE.md
  - AUTOMATION_ENGINE.md
  - CONNECTOR_SDK.md
Related ADRs:
  - ADR-0012
```

Author role: Principal Product Designer. Scope: the complete UX philosophy of Smart Message Center - not a messenger, a communication operating system. Every decision below is evaluated against PRODUCT.md's UI Principles and the product's central trust claim: an interruption should mean something, and an automation should be inspectable, never magical.

---

## 1. What This Product Is, In UX Terms

A messenger's job is to display messages. Smart Message Center's job is to **decide what deserves your attention, prove it was right, and quietly handle everything that doesn't need you at all.** Every screen in this guide is designed against that job, not against "here is a chat interface." The single most important UX consequence of this framing: **the inbox is not the home screen.** The home screen is a triage surface (Section 6.2's Morning Briefing) that earns the right to show a raw, unfiltered inbox only when a user explicitly asks for it. A messenger opens to "everything, newest first." Smart Message Center opens to "here's what actually needs you."

---

## 2. Core UX Principles

Extending PRODUCT.md's UI Principles with the specific design consequences of each:

1. **The unread/"Needs You" count is a promise, not a number.** If it's ever wrong, trust in the entire product breaks in one moment - this outranks every other UI concern in engineering priority. Design consequence: this number is never client-computed or optimistically guessed; it always reflects the server's authoritative state, and any UI action that changes it (marking read, snoozing) shows the number update only after server confirmation, never before.
2. **Speed is the first impression, every time.** Every core action (triage, snooze, reply, tag, archive) is one keystroke or one click away, with a keyboard shortcut that never changes across app versions. Design consequence: no core action is ever buried in a menu with no keyboard equivalent - if it's common enough to be "core," it earns a shortcut on day one, not "eventually."
3. **A provider's message never looks like a provider's widget.** A Telegram message and a Slack message render in one consistent visual language - sender avatar, body, timestamp, attachments, reactions all styled identically regardless of source, with only a small, consistent provider badge (never a full provider-branded chrome) indicating origin. Design consequence: no connector ships its own UI component - every connector maps into the same canonical message-rendering component the way it maps into the same canonical data model (`CONNECTOR_SDK.md` Section 11).
4. **Automation is inspectable, never magical - at every layer of the UI, not just the debugger.** A tag that appeared on a message because a rule fired shows *which rule*, inline, on hover - not just in a separate execution log a user has to go looking for. Design consequence: every automation-caused UI change carries a small, consistent "why" affordance (an icon, a tooltip) wired directly to `AUTOMATION_ENGINE.md` Section 14.4's debugger data - the debugger isn't a separate power-user tool, its data surfaces contextually everywhere its effects are visible.
5. **Silence is visible, not just the absence of noise.** When Focus Mode or silent hours are active, the UI actively communicates "you are protected, N things are queued" - a calm, confident state, not an ambiguous one. Design consequence: a persistent, unobtrusive status indicator (never a blocking modal) is present whenever any interruption-suppressing state is active.
6. **Progressive disclosure, always.** The default view for every persona (PRODUCT.md's personas) is radically simple; power-user depth (advanced filters, nested condition trees, raw execution traces) exists one level down, reachable but never forced on a first-time user. Design consequence: every "advanced" affordance is visually secondary (smaller, grayed until hovered, or behind a single explicit expand action) - never presented with equal visual weight to the primary action next to it.
7. **AI is visually distinct and always dismissible, everywhere, without exception.** Every AI-generated or AI-suggested element (a summary, a suggested reply, a proposed rule, a semantic search result) carries one consistent visual treatment (Section 13) across the entire product - a user should never have to wonder, even for a second, whether they're looking at their own content, another person's words, or a model's guess.
8. **No dark patterns, anywhere, full stop.** No fake urgency copy, no notification-bait, no guilt-trip unsubscribe/downgrade flows, no pre-checked broad permission scopes. A single discovered dark pattern in this specific trust category does disproportionate, possibly permanent brand damage (PRODUCT.md's UI Principles already state this; repeated here because it's a design review gate, not just a written value - see Section 24).

---

## 3. User Mental Model

Users should hold five objects in their head, and only five - every screen in the product is a view onto one or more of these, never a sixth, unrelated concept introduced without deliberate cross-team review:

1. **Needs You** - the small, trustworthy set of things that actually require a human right now.
2. **The Morning Briefing** - a daily, digestible answer to "what happened while I wasn't looking."
3. **Waiting On** - things I owe a reply on, and things owed to me.
4. **People** (not "contacts," not "accounts") - the IdentityGraph-backed representation of a real human or organization, independent of which channel they used (`ARCHITECTURE.md` Section 13). This is the single biggest mental-model shift from a normal messenger: **a user should never think "let me check my Telegram" - they think "let me check what Deniz said," regardless of channel.**
5. **Rules** - the automations a user has taught the system, always inspectable, always theirs to edit.

Every navigation decision (Section 5), every screen (Sections 6-12), and every onboarding beat (Section 21) exists to reinforce these five objects, not to introduce app-specific jargon a user has to separately learn.

---

## 4. Information Architecture

```
Smart Message Center
├── Morning Briefing (home)
├── Inbox
│   ├── Needs You (default filtered view)
│   ├── All Conversations (unfiltered, explicit opt-in)
│   ├── Waiting On
│   └── Archive
├── People                          ← IdentityGraph's user-facing surface
│   ├── All People
│   ├── VIPs
│   └── [Person detail: identity view, Section 7]
├── Automations
│   ├── My Rules
│   ├── Rule Templates / Marketplace
│   └── [Rule builder canvas, Section 10]
├── Search (global, always reachable, never a separate "page" - see Section 12)
├── Notifications (Section 11)
└── Settings
    ├── Connected Accounts (Section 20)
    ├── Notification Preferences
    ├── Workspace (Business/Team tier)
    └── Account & Security
```

**Why "People" is a top-level nav item, not buried under Settings**: this is the direct, structural expression of IdentityGraph being a first-class capability (`ARCHITECTURE.md` Section 13), not an implementation detail. A product that reasons about identities, not provider accounts, has to let users navigate that way too - if "People" were buried, the mental model in Section 3 would be undermined by the very navigation meant to reinforce it.

---

## 5. Navigation Structure

- **Primary navigation**: a persistent left sidebar (desktop/web) with the six top-level items from Section 4 - icons plus labels, never icon-only (accessibility, Section 24, and simple clarity for a first-time user).
- **Secondary navigation**: contextual, appears within a section (e.g. Inbox's Needs You/All/Waiting On/Archive sub-tabs) - never duplicated in the primary sidebar, which stays exactly six items regardless of how deep the product grows, per Section 2's progressive-disclosure principle.
- **Command palette** (⌘K / Ctrl+K): the power-user front door to everything - jump to any conversation, any person, any rule, any setting, or execute an action ("snooze this until Monday," "create a rule from this message") without leaving the keyboard. This is not a "nice to have" added later; it's designed in from Phase 9, because retrofitting a command palette onto an already-shipped, mouse-first product never achieves real parity.
- **Breadcrumb-free by design**: navigation depth never exceeds two levels (top-level → detail), so a breadcrumb trail is never necessary - if a future feature would require one, that's a signal the information architecture needs rethinking, not that a breadcrumb component needs building.

---

## 6. Inbox Experience

### 6.1 Layout

A three-pane layout on desktop/web (list → thread → context panel, Section 9), collapsing to a single-pane, stack-based navigation on mobile (Section 15). The middle pane (thread) is always the widest - reading and replying is the dominant activity, and the layout should never make context-panel real estate compete with it for primary attention.

### 6.2 The Morning Briefing (Home Screen)

Not a list of unread messages - a **curated, dated summary**: "3 things need you today" (each with a one-line reason, wired to the same rule-attribution data as Section 2.4), a Waiting On summary ("2 replies you owe, 1 owed to you"), and a quiet acknowledgment of everything else ("47 other messages, nothing urgent"). This is the screen PRODUCT.md names as the artifact that proves the whole system works, in one glance - it is treated with proportionally more design care than any other single screen in the product.

### 6.3 Conversation List

Sorted by priority score first, recency second (never recency-only, which is a normal messenger's default and precisely the behavior PRODUCT.md's Problems section names as broken). Each row: avatar (resolved via IdentityGraph, Section 7 - never a raw provider avatar shown inconsistently per-channel), name, last-message preview, provider badge (small, Section 2.3), priority indicator (color+icon per Section 24's accessibility rule, never color alone), unread state.

### 6.4 "Needs You" as the Default Filter

The Inbox opens to the Needs You filter, not "All." Switching to "All Conversations" is one click away and remembered per-session, but never the default - this is the concrete navigation-level enforcement of Section 2's #1 principle.

---

## 7. Unified Identity View (IdentityGraph's Front Door)

The Person detail screen is where IdentityGraph (`ARCHITECTURE.md` Section 13) becomes tangible to a user, not just an invisible backend capability:

- **Identity summary**: name, avatar, VIP toggle, tags - and, distinctly, a list of every linked provider identity feeding this one Person (a Telegram handle, a work email, a Slack user ID), each shown with its `match_type` (`DATABASE.md` Section 6.6) - an exact match shown as a plain fact ("Telegram: @deniz"), a manually-confirmed fuzzy match shown with a small "confirmed by you on [date]" note, never presented identically to an exact match, per `ARCHITECTURE.md` Section 13.8's transparency stance.
- **Relationship history**: first-contact date, typical response lag, conversation count per channel - the data `AUTOMATION_ENGINE.md`'s condition primitives read from, made visible so a user can understand *why* a rule referencing this person behaves the way it does.
- **Communication timeline** (Section 8): embedded directly on this screen, not a separate destination - the cross-channel merged history is the payoff of the whole identity-resolution exercise, and it should be one click from "who is this" to "everything they've said to me," never a separate search.
- **Merge suggestions**: if IdentityGraph has a pending duplicate-detection suggestion (`ARCHITECTURE.md` Section 13.6) for this Person, it's surfaced here, inline, as an explicit "these might be the same person - review?" card - never auto-applied, never hidden in a separate admin queue a user has to remember to check.
- **Merge/Split actions**: both available directly from this screen, both requiring an explicit confirmation step (Section 24) that shows exactly what will combine or separate before it happens - this is the human-in-the-loop UI `ARCHITECTURE.md` Section 13.6's governance principle depends on existing at all; the principle is only real if the UI makes confirmation genuinely informed, not a reflexive "yes" click.

---

## 8. Conversation Timeline

- Messages from every channel render in one continuous, chronologically merged thread when viewing a Person's full history (Section 7), and in a single-channel thread when viewing one specific Conversation from the Inbox - both use the identical message-rendering component (Section 2.3).
- **Edits and deletions are shown, never silently vanish**: an edited message shows "edited" with the prior version available on demand; a deleted message shows a placeholder ("this message was deleted"), never disappears from the timeline entirely - consistent with `CONNECTOR_SDK.md` Section 10's policy that the provider is the source of truth for content, and with the product's broader "never lose data" trust stance.
- **Attachments render inline** where the type supports it (images, short video preview) and as a clear, clickable card otherwise (documents, voice notes with a transcript toggle if AI is enabled, Section 13).

---

## 9. Context Panel

The right-hand pane (collapsible, never removable - always one click to reopen): the active conversation's Person summary (a condensed version of Section 7), tags, Waiting On status if applicable, a "related automations" list (which rules have touched this conversation, linking to Section 14's execution trace), and - only if AI is enabled for the workspace - a dismissible, visually-distinct (Section 13) AI summary of the thread. The context panel is never the primary reading surface; it's supporting information, sized and weighted accordingly (Section 2.6).

---

## 10. Automation Builder Experience

Directly implements `AUTOMATION_ENGINE.md` Section 7's design:

- A canvas: one Trigger card at the top, a nested Condition tree (visually indented, AND/OR/NOT toggles) below it, an Action chain (with visible branch/parallel/delay nodes) at the bottom - read top-to-bottom like a sentence, never a free-floating node graph requiring users to trace arrows (that pattern is powerful for engineers and actively hostile to PRODUCT.md's non-technical personas).
- **Self-describing, live plain-language preview** always visible alongside the canvas ("When a message is received, if the sender is VIP and it's during silent hours, then notify me immediately") - updates in real time as the rule is edited, and is the *primary* way a screen-reader user confirms a rule's meaning (`AUTOMATION_ENGINE.md` Section 14.4/208's accessibility requirement).
- **Test, Simulate, and Debug are all one click from the canvas**, never a separate destination requiring the user to leave their in-progress rule - a "Test with a real message" button, a "Simulate over time" button (`AUTOMATION_ENGINE.md` Section 14.3), and, once published, a "View recent runs" link, all visible in the builder's header at all times.
- **Publishing requires an explicit action** (`AUTOMATION_ENGINE.md` Section 14.1's Draft/Published lifecycle) - a rule being edited never silently goes live; the canvas visually distinguishes "editing a draft" from "editing the live version" (a persistent banner, not a subtle color shift) so a user is never surprised that changes are already affecting real messages.

---

## 11. Notification Center

- An in-app, chronological list of every notification the system has generated (message-triggered, reminder, digest, system), each carrying the same "why" attribution as Section 2.4.
- **Silent hours and Focus Mode state are visible here specifically**, not just as a global status indicator (Section 2.5) - this is where a user checks "what did I miss while I was quiet," directly answering the question silence-as-a-feature naturally raises.
- Read/unread state syncs instantly across devices (a notification read on mobile shows read on desktop within the same real-time channel the Inbox uses, `API.md` Section 11) - a stale notification badge on one device while another shows it cleared is a direct, if small, violation of Section 2's "the count is a promise" principle.

---

## 12. Search Experience

- A single, always-reachable entry point (⌘K/Ctrl+K opens directly into search-capable mode, or a persistent search field in the top bar) - never a separate "Search" page requiring navigation away from wherever the user currently is.
- Results are grouped by type (Messages, People, Files) with the matched snippet shown in context (per `API.md` Section 4's search design), and every result is one click to its full context (open the conversation, open the Person).
- **Semantic/AI-assisted search results are visually distinguished from keyword results** (Section 13) with a small, honest label ("AI match") - a user should never mistake a model's best guess for an exact textual match, especially when the two are shown in the same results list.

---

## 13. AI Interaction Patterns

One consistent visual treatment, applied everywhere AI output appears (summaries, suggested replies, proposed rules, semantic search, transcripts): a subtle, consistent border/background treatment plus a small persistent label - never blended indistinguishably into surrounding human-authored content, per PRODUCT.md's AI Features principle and `AUTOMATION_ENGINE.md` Section 9's hard AI boundary.

- **Suggestions, never actions.** An AI suggested reply appears as an editable draft in the compose box, never a sent message. An AI-proposed rule opens directly in the builder (Section 10) as a draft, never an active rule. There is no UI surface anywhere in the product where an AI output becomes real (sent, activated, merged) without a distinct, explicit human confirmation step.
- **Confidence is never overstated visually.** No AI-generated content is styled with the same visual certainty (solid color, checkmark iconography) as a deterministic system fact - a suggested reply looks like a suggestion; a resolved IdentityGraph exact match looks like a fact (Section 7).
- **Always, trivially dismissible.** A single, consistent dismiss action (an X, a swipe) removes any AI suggestion with no confirmation required - dismissing a suggestion is instant (Section 24), because refusing an AI suggestion should never carry more friction than the suggestion itself did to appear.

---

## 14. Desktop Experience (Tauri)

- Lives in the system tray/menu bar by default - the product's core promise ("never miss what matters") depends on it being present without a dock icon demanding attention, echoing Section 2.5's "silence is visible, not absent" principle at the OS level.
- **Native OS notifications**, not in-app-only toasts, for anything crossing the priority threshold - and native notification actions (reply inline, snooze, mark done) where the OS supports them, so a user rarely needs to bring the full window forward for a quick triage.
- A global keyboard shortcut for quick-capture ("send a message without opening the full app") - directly serving the Power User persona (Section 22) and the "speed is the first impression" principle (Section 2.2).
- Background sync continues while the window is closed - the tray icon's badge state must be as trustworthy as the in-app "Needs You" count (Section 2.1); this is not a lesser-effort surface just because it's not the primary window.

---

## 15. Mobile Experience (Future, Phase 14)

- **Single-pane, stack-based navigation** (list → thread → context, each a full screen, standard mobile push/pop) - the three-pane desktop layout (Section 6.1) never gets crammed into a small screen; it's redesigned for the medium, not shrunk.
- **Push notification quality is the actual product bet on mobile** (`ROADMAP.md` Phase 14's stated rationale for building mobile only after server-side priority scoring is proven, Sections 6-11) - native push must carry the same priority/VIP/silent-hours intelligence as desktop, never a lowest-common-denominator "new message" ping.
- **Offline-first for reading**: previously-loaded conversations remain readable with no connection; composing while offline queues visibly (a clear "will send when back online" state, never a silent failure) - matching Section 18's error-state philosophy.
- Biometric unlock (`ROADMAP.md` Phase 14) gates the app itself, consistent with the elevated sensitivity of what this app aggregates (PRODUCT.md's Brand section: "messaging aggregators are a high-value target").

---

## 16. Empty States

No empty state is ever a blank screen with no next action. Every one names what's missing and offers exactly one clear, low-friction next step:

- **Inbox, no connected accounts**: "Connect your first account to get started" → directly into Section 20's connection flow.
- **Inbox, connected but nothing needs attention**: a calm, positive state ("You're all caught up") - never styled as an error or a warning; genuinely good news deserves to look like good news.
- **People, empty**: "People appear here automatically as you receive messages" - explains the mental model (Section 3) rather than presenting an empty grid with no context.
- **Automations, no rules yet**: leads directly into the template gallery (`AUTOMATION_ENGINE.md` Section 16), never a blank canvas as the very first thing a new user sees - a first rule from a template is a faster, safer path to a felt "aha" moment than a blank builder.
- **Search, no results**: distinguishes "no results" from "search is still finishing" (Section 17) and suggests a broadened query or a semantic-search fallback (Section 13) where AI is enabled.

---

## 17. Loading States

- **Skeleton screens, not spinners, for anything with a predictable shape** (conversation list rows, message bubbles) - preserves layout stability and perceived speed (Section 2.2).
- **Spinners reserved for genuinely indeterminate waits** (an AI summary generating, Section 12's long-running-operation pattern from `API.md` Section 12) - always paired with a cancel option if the wait exceeds a few seconds.
- **Optimistic UI for sends**: a sent message appears in the thread immediately, in a distinct "sending" visual state, before server confirmation - and clearly, unambiguously reverts to a retry affordance (Section 18) if it fails, never silently disappearing.

---

## 18. Error States

- **Inline for a single, localized failure** (one message failed to send: a small retry affordance directly on that message, not a global banner).
- **Toast for a transient, non-blocking system event** (a connector briefly degraded, `CONNECTOR_SDK.md` Section 2's `degraded` state) - informative, dismissible, never blocking interaction with the rest of the app.
- **Blocking, full-context dialog reserved for genuinely blocking failures only** (e.g. a required reauthorization before a critical action can proceed) - used sparingly, because overuse trains users to reflexively dismiss dialogs without reading them, undermining the one time a blocking dialog is truly warranted.
- **Every connector-related error surfaces contextually where it matters** (a LinkedAccount in `reauth_required` shows a clear banner on the specific Inbox filter/Person screens affected by it, not just buried in Settings) - matching `CONNECTOR_SDK.md` Section 6's health-visibility design intent.

---

## 19. Permission Flows

- Every OAuth/connect consent screen states, in plain language, exactly what access is being granted and why ("Smart Message Center will read and send messages on your behalf in the channels you approve") - never a bare provider-generated consent screen with no framing.
- **No pre-checked broad scopes.** Where a provider's OAuth flow allows scope selection, the narrowest scope satisfying the connector's declared capability manifest (`CONNECTOR_SDK.md` Section 5) is requested by default; broader scopes are opt-in, explained, never bundled silently.
- Revoking access (Section 20) is exactly as easy to find and execute as granting it was - a permission flow with an easy "in," and a hard, buried "out," is a dark pattern (Section 2.8) regardless of intent.

---

## 20. Account Connection Flows

- Driven entirely by `CONNECTOR_SDK.md` Section 5's Capability Manifest and Section 3's `connectMethod` discriminator - the UI renders the correct flow (OAuth redirect, bot-token entry with inline validation, IMAP/SMTP credential form) automatically per provider, never a bespoke screen hand-built per connector.
- **Connection health is visible immediately and persistently** post-connect (`active`/`degraded`/`reauth_required`, `CONNECTOR_SDK.md` Section 2) - a newly connected account shows a live sync-progress indicator (`API.md` Section 12's long-running-operation pattern) during initial backfill, not a silent wait with no feedback.
- Disconnecting is a single, clearly-labeled action with one confirmation step (Section 24) - explaining plainly what happens to already-ingested history (retained, per `SECURITY.md`/`DATABASE.md` retention policy, not deleted) so a user isn't afraid to disconnect and reconnect if something goes wrong.

---

## 21. First-Time User Onboarding

1. **Sign up** (Section 19's permission-flow discipline applies from message one).
2. **Connect your first account** (Section 20) - the flow does not proceed to a generic empty dashboard; it goes straight into account connection as the very next screen, because a Smart Message Center with zero connected accounts has nothing to demonstrate.
3. **The "you would have missed this" moment** (PRODUCT.md's Viral Features): immediately after the first successful sync, a one-time, retroactive scan surfaces 1-3 real messages from the last 7 days the user was late to or missed - the single most important onboarding beat in the product, given proportionally the most design polish of any one-time screen.
4. **First rule from a template** (Section 10/16) - not a blank builder; a curated, persona-aware suggestion ("Since you connected Telegram, want to always be notified when a VIP messages, even during silent hours?") that installs with one click and is immediately editable.
5. **Land on the Morning Briefing** (Section 6.2) as the true home screen from this point forward - onboarding's job is done the moment a new user's daily habit is "check the Briefing," not "check every app."

---

## 22. Power User Workflows

- **Full keyboard operability**: every action reachable via the command palette (Section 5) and a documented, stable keyboard shortcut for the ~15 most common actions, discoverable via a single `?` overlay.
- **Bulk actions**: multi-select in the conversation list (archive, tag, apply a rule retroactively) - a direct answer to the Power User persona's expectation that anything doable one-at-a-time is also doable in bulk.
- **Rule import/export UI** (`AUTOMATION_ENGINE.md` Section 17): accessible from the Automations section, surfacing the portable JSON format for backup, version control, or sharing - a text-editor-friendly export, matching the Power User's expectation of scriptability.
- **API key management** (`API.md` Section 7.1) lives in Settings, with scopes, last-used timestamps, and one-click revocation (`SECURITY.md` Section 6.19's design) presented exactly as legibly as the OAuth-connected-account list (Section 20) - API access is a first-class connection type, not an afterthought buried three menus deep.

---

## 23. What Users Should See vs. Never See

**Should see, always:**
- Exactly why a priority score, tag, or notification happened (Section 2.4).
- The true, current state of every connected account's health (Section 20).
- A clear distinction between their own words, another person's words, and AI-generated content (Section 13).
- Every merge/split action's full consequence before confirming it (Section 7).

**Should never see:**
- A raw provider account ID, internal database identifier, or any other implementation-level detail in a user-facing surface (`ARCHITECTURE.md` Section 13.1's "never reason about provider accounts" principle, extended to the UI - a user never sees "LinkedAccount `a1b2c3d4`," they see "Deniz's Telegram").
- A credential, token, or secret of any kind, at any point, in any UI surface, ever (`SECURITY.md` Section 5) - not even truncated/masked "for debugging," which is itself a leakage risk if screenshotted.
- An AI-generated confidence score or raw matching signal weight (`ARCHITECTURE.md` Section 13.8 - internal-only data, never exposed even to the workspace member reviewing a merge suggestion, who sees the human-legible evidence, not the underlying number).
- A blocking modal for anything reversible (Section 18/24).

---

## 24. Confirmation vs. Instant Actions

**Require explicit confirmation** (a distinct dialog or inline "are you sure," never a single accidental click away):
- Merging or splitting an identity (Section 7) - high-consequence, hard to fully undo cleanly (`ARCHITECTURE.md` Section 13.7).
- Publishing a rule for the first time, or editing an already-published rule's live behavior (Section 10).
- Disconnecting a linked account (Section 20).
- Deleting a rule, a saved reply, or a workspace variable referenced by other rules.
- Any action that would send a real message on the user's behalf that originated from an AI suggestion (Section 13) - the confirmation *is* the send action itself; there is no separate "are you sure" on top of it, since editing-then-sending already constitutes the human confirmation `AUTOMATION_ENGINE.md` Section 9 requires.
- Revoking an API key or removing a workspace member (Business tier).

**Instant, no confirmation, always undoable via a visible follow-up (a toast with "Undo") rather than a pre-action prompt:**
- Snoozing, archiving, tagging, or marking a conversation read/unread.
- Dismissing an AI suggestion (Section 13).
- Muting a conversation or adjusting silent hours.
- Creating a rule from a template (since it lands as an editable draft, not instantly live - Section 10's Draft/Published distinction is what makes this safe to be instant).

**The dividing line, stated as a rule, not a case-by-case judgment call**: an action is confirmation-gated if it is either (a) hard to fully reverse, or (b) could cause a real message to be sent or a real automation to run against live data without the user having directly authored that specific instance of content. Everything else is instant, with undo - because friction on reversible, low-stakes actions is exactly the kind of cognitive tax PRODUCT.md's entire Problems section (notification chaos, overwhelm) argues this product exists to remove, not reintroduce at the UI layer.

---

## 25. Designing for Millions of Users

- **Virtualized lists everywhere** (conversation list, message thread, People list, notification center) - rendering performance must not degrade for a workspace with 50,000 historical messages any more than for one with 50, given `DATABASE.md` Section 18's explicit anticipation of high message-volume workspaces.
- **Accessibility is default-on, not a toggle** (`AUTOMATION_ENGINE.md`'s Accessibility category, examples #196-208, already commit the product to this at the automation layer; the UI layer holds the same bar): full keyboard operability (Section 22), color-never-alone status indicators (Section 6.3), screen-reader-verified plain-language rule descriptions (Section 10), captions/transcripts available by default when accessibility mode is on.
- **i18n-ready from the component layer up**: no hardcoded English string concatenation assuming word order or pluralization rules that don't hold across languages - even though the MVP ships English-only, retrofitting i18n onto components that weren't built for it is exactly the kind of expensive-later mistake this whole documentation set has been designed to avoid paying twice.
- **Dark mode and reduced-motion are first-class, not afterthought toggles** - specified fully in `DESIGN_SYSTEM.md`, referenced here because a design system without UI-layer discipline to actually use its dark-mode tokens correctly everywhere is dark-mode support in name only.
- **Every screen in this guide degrades gracefully at scale** - a Person with 40 linked identities (Section 7), a workspace with 300 active rules (Section 10), an Inbox with a five-digit unread count before Section 6.4's default filter kicks in - none of these are edge cases dismissed as "won't happen"; PRODUCT.md's ambition is millions of users, and this guide is written assuming some of them will be genuine power users pushing every one of these numbers up, from day one of the real product existing.
