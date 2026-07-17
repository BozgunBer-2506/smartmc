# Smart Message Center - PRODUCT.md

```yaml
Title: PRODUCT.md
Version: 1.1
Status: Approved
Owner: Product
Last Updated: 2026-07-18
Depends On: []
Related ADRs:
  - ADR-0012
```

---

# Vision

**Why does this product exist?**

Communication is the one category of software that got worse as it multiplied. In 2010 you had email and maybe one messenger. Today a single knowledge worker maintains active presence in Gmail/Outlook, Slack, Microsoft Teams, WhatsApp, Telegram, Discord, LinkedIn DMs, and SMS - and treats each as a separate universe with its own notification badge, its own anxiety, its own "did I miss something important" moment. Nobody designed this. It accreted, one SaaS tool at a time, and the cost lands entirely on the human who has to hold it all in their head.

The real problem is not "too many apps." Rambox and Shift solved "too many apps" a decade ago by bolting webviews together, and that didn't fix anything - it just put the chaos in one window instead of eight. The real problem is **undifferentiated attention**: every platform treats a meme from a group chat and an email from your biggest client as the same kind of event - a badge and a buzz. The cost of this isn't inconvenience, it's compounding: missed client messages, late follow-ups that cost deals, VIP messages buried under noise, and a background hum of anxiety that never fully turns off because "important" and "everything" look identical.

**What problem does it solve?**

Smart Message Center solves the *triage and follow-through* problem, not the *client aggregation* problem. Aggregation is table stakes and will be commoditized; Beeper already does it well. What nobody does well is: knowing what to look at first, being reminded when something is dropped, and turning recurring communication patterns into rules instead of repeated manual labor. That is the product.

**Why now?**

Three things converged that didn't exist five years ago:

1. **Official APIs are finally good enough.** Telegram Bot API, Discord API, Slack Events API, and modern IMAP/OAuth make ToS-compliant aggregation genuinely viable without the account-ban risk that killed earlier "unified inbox" attempts (Beeper's original Matrix-bridge era included).
2. **LLMs make triage and classification cheap and accurate.** "Is this urgent," "does this need a reply," "who is this person to me" used to require rules nobody wanted to write by hand. Now a model can propose the rule, or do the classification directly, at a cost per message that rounds to zero.
3. **Notification fatigue is now a mainstream, named problem**, not a niche complaint. Do Not Disturb modes, digest emails, and "focus modes" on every OS are evidence that the market already agrees the current default (every message is an equal-priority interruption) is broken. Nobody has shipped the fix at the communication-hub layer - only at the OS-notification layer, which is too shallow to know that this Telegram message is from your investor and that one is a sticker pack.

---

# Mission

Smart Message Center exists to give people back control of their attention by turning every channel they communicate on into one intelligent surface that knows what matters, never lets a real commitment silently die, and automates the communication busywork that has no business consuming a human's morning - without ever asking the user to trust it blindly, without locking their conversations behind a proprietary protocol, and without pretending AI is required to deliver any of it.

---

# Target Users

Personas are ordered by MVP priority (Freelancers and Developers first - highest pain, fastest activation, most likely to tolerate a v1 with rough edges).

### 1. Freelancer / Independent Contractor - "Deniz, 29, freelance designer"
Juggles 6-10 active clients across WhatsApp, email, Instagram DM, and Slack (clients' workspaces, not their own). Loses track of who they promised what to. A missed message from a client during a busy week directly costs money - a lost project or a late invoice. Price sensitive but will pay if it demonstrably prevents a missed-client incident. Primary need: **never drop a client thread, ever.**

### 2. Software Developer - "Kaan, 34, backend engineer"
On Slack (2 workspaces), Discord (open-source communities), email, and GitHub notifications (adjacent but not core). Deeply annoyed by noise; wants aggressive filtering, keyboard-driven UX, and zero fluff. Will churn instantly if the product feels "consumer-cute." Primary need: **signal over noise, and it must be fast.**

### 3. Startup Founder - "Elif, 37, seed-stage founder"
The most channel-fragmented persona: investor emails, Slack with the team, WhatsApp with cofounders, Telegram with a manufacturing partner, LinkedIn DMs from candidates. Every channel can contain something that changes the company's trajectory. Time-poor, will pay premium prices for anything that reduces the cost of context-switching. Primary need: **triage that's trustworthy enough to act on a 30-second morning scan.**

### 4. Sales Rep / SDR - "Mert, 26, account executive"
Lives in follow-ups. A lead who doesn't hear back in 48 hours goes cold. Needs reminders, not summaries - the content is usually simple, the failure mode is forgetting to act. Communicates across email, LinkedIn, and WhatsApp depending on the region/client. Primary need: **nothing goes stale without a nudge.**

### 5. Support Agent / Support Team Lead - "Ayşe, 31, support team lead"
Manages a small team answering customers across email, Intercom-style chat, and Slack Connect channels with enterprise clients. Needs shared visibility, handoff without duplicate replies, and tagging for reporting. This persona pulls the product toward *team* features earlier than the others. Primary need: **team-safe unified inbox with no double-replies.**

### 6. Executive / Manager - "Cem, 45, VP Operations"
Doesn't want another inbox to manage - wants the system to manage them. High volume, low tolerance for setup effort. Wants a daily digest, VIP-only interruptions, and delegation (an EA can see/handle non-critical items). Primary need: **interrupt me only for the things that actually need me.**

### 7. Recruiter - "Zeynep, 28, technical recruiter"
Runs outreach at volume across LinkedIn, email, and WhatsApp. Needs pipeline-style tracking of conversations (not unlike sales), tagging by role/client, and reminders for candidates who've gone quiet. Primary need: **treat conversations like a pipeline, not a stream.**

### 8. Student / Early Career - "Baran, 21, university student"
Discord (communities, classes), Instagram DM, WhatsApp groups, university email he never checks. Low willingness to pay, high volume of low-stakes messages, occasional genuinely important one (a professor, a job offer) buried in noise. Primary need (and best free-tier acquisition persona): **surface the one message that matters in a sea of group-chat noise.**

### 9. Power User / "Inbox Zero" Obsessive - "Onur, 39, productivity enthusiast"
Not defined by role but by behavior: already uses Notion, Superhuman, keyboard shortcuts for everything, has opinions about automation tools. Will be the product's loudest advocates and harshest critics simultaneously. Wants deep customization, API/webhook access, and will write their own automation rules if the visual builder is too limited. Primary need: **give me the primitives and get out of my way.**

**Explicitly deprioritized for MVP:** enterprise IT admins and compliance officers (need SSO/DLP/legal-hold - real market, wrong phase), and casual consumers who only use one messaging app (no aggregation pain, nothing to sell them).

---

# Problems

100 specific, real problems. Grouped for readability; numbered continuously.

### Notification Chaos (1-10)
1. A Slack DM from your manager and a "Happy Birthday!" sticker from a group chat trigger the identical push notification style.
2. Turning on Do Not Disturb on one app doesn't silence the other four apps also buzzing.
3. Badge counts across five apps add up to a number so large it stops meaning anything ("47? I'll deal with it never").
4. Waking up to 200 notifications means the 3 important ones are indistinguishable from the 197 that aren't.
5. Muting a noisy group chat also mutes the one time someone in it @mentions you directly.
6. Desktop notification pop-ups interrupt deep work for messages that could have waited a day.
7. There's no way to say "only interrupt me for these 5 people" across every app at once.
8. Phone notification settings and desktop notification settings are configured separately and drift out of sync.
9. A message marked "urgent" by the sender gets the same visual weight as everything else.
10. Notification digests, where they exist, are per-app - so you get five separate "here's what you missed" emails instead of one.

### Missed & Lost Messages (11-20)
11. A client message sent to your Instagram DMs sits unread for four days because you don't check that app for business.
12. Important messages get buried under group chat activity within minutes of arriving.
13. Switching phones or reinstalling an app can silently lose message history that was never backed up anywhere else.
14. A WhatsApp message from a new number (unsaved contact) looks identical in urgency to spam.
15. Messages sent to a secondary or old email address you rarely check go unanswered indefinitely.
16. A DM sent while your phone was off/dead is easy to miss entirely once new messages push it down.
17. Direct messages inside a Slack workspace you rarely open (a client's workspace, not your own) are effectively invisible.
18. There is no "you have an unanswered message from 6 days ago" safety net across channels - only within a single app, if at all.
19. A message requiring a decision gets scrolled past while doing a quick "just checking messages" pass.
20. Out-of-office periods mean messages pile up with zero prioritization for when you return.

### Context Switching & Fragmentation (21-30)
21. Replying to a client requires remembering which of four apps that specific client uses.
22. Every app switch costs 10-20 seconds of re-orientation, multiplied by dozens of times a day.
23. The same conversation with one person is split across email (formal) and WhatsApp (quick questions), with no shared context.
24. There's no single place to search "what did this person tell me" across every channel they've ever messaged you on.
25. Copy-pasting information between a messaging app and a notes app/CRM is entirely manual.
26. Each app has a different UI paradigm (threads vs. flat, read receipts vs. none), adding cognitive load to every switch.
27. You cannot see "all conversations from this company/client" as one unit when they span email + Slack Connect + WhatsApp.
28. Keyboard shortcuts are inconsistent or absent across apps, so muscle memory doesn't transfer.
29. Multi-account situations (2 Gmail, 2 Slack workspaces) mean checking the same app type multiple times a day, separately.
30. There is no "focus mode" that spans all channels at once - only per-app focus settings.

### Follow-up & Accountability (31-40)
31. You promise "I'll get back to you tomorrow" and there's no system-level memory of that promise once the message scrolls away.
32. A sales lead goes cold because nobody set a reminder to follow up in 48 hours.
33. "Waiting on a reply from X" exists only in someone's head, not in any tool, until it's too late.
34. Group projects stall because nobody tracks who owes whom a response.
35. An invoice sent by email gets no follow-up if the client doesn't pay, because there's no trigger tied to "no response."
36. Important asks buried in long threads get silently dropped because nothing resurfaces them.
37. There's no way to snooze a message until a specific future date/time across most messaging apps.
38. Following up manually means re-reading the entire thread to remember context before sending a nudge.
39. A recruiter loses track of which candidates were sent an offer and never replied.
40. There's no cross-channel view of "everything I owe someone" vs. "everything someone owes me."

### VIP & Priority Handling (41-50)
41. Your boss's messages get the same ringtone as a delivery notification.
42. There's no concept of "these 10 people can break through Do Not Disturb, nobody else" that works across apps.
43. A investor's email during a fundraise gets buried under newsletter unsubscribe requests in the same inbox.
44. VIP status is a manual, per-app setting (if it exists at all) - you'd have to configure it five times.
45. A family emergency text competes for attention with a marketing SMS, both just "a text."
46. There's no way to say "this person is VIP only during work hours, but always-VIP during a launch week."
47. Client messages during off-hours either interrupt sleep or get missed entirely - no smart in-between.
48. New, unknown senders who turn out to be important (a journalist, a big client's new hire) get no elevated visibility on first contact.
49. Team leads can't see which of their reports' messages actually need escalation vs. routine.
50. There's no shared, portable definition of "VIP" that travels with you across email, Slack, and messaging apps.

### Search & Retrieval (51-60)
51. Finding "that link someone sent me last month" means checking four apps' search functions one at a time.
52. In-app search is often weak (fuzzy matching, no filters) even within a single platform.
53. A file attachment sent in a chat six months ago is nearly unfindable without remembering the exact conversation.
54. There's no way to search by "things tagged Finance" across Slack, email, and Telegram simultaneously.
55. Voice messages and images are essentially unsearchable content black holes in most chat apps.
56. You remember who sent something but not which app, so you search all of them manually.
57. Old conversations with a now-inactive contact are hard to resurface for context before re-engaging them.
58. There's no semantic search ("find the message where someone complained about pricing") - only exact keyword match, if that.
59. Searching across a team's shared inbox for a specific customer's history requires access to every underlying tool.
60. Export/archival of old conversations for legal or reference purposes is manual and inconsistent per platform.

### Attachments & Files (61-70)
61. An invoice PDF sent over WhatsApp has no automatic path into your accounting workflow - it just sits in the chat.
62. Files sent across different apps end up scattered with no unified "all files anyone sent me" view.
63. There's no automatic tagging of attachments by type (invoice, contract, resume) for later retrieval.
64. Large files sent via messaging apps get compressed/degraded (images especially) with no original preserved elsewhere.
65. Screenshots of important information (a contract clause, a schedule) get lost in camera rolls with no link back to the conversation.
66. Receiving a resume via LinkedIn DM vs. email means two completely different filing habits, so nothing's centralized.
67. There's no way to say "auto-forward any PDF from this client to my accountant's email."
68. Contract redlines sent back and forth over email have no version tracking at the messaging layer.
69. Voice notes with important verbal instructions have no transcript, so re-listening is the only way to retrieve the ask.
70. A "send me that file again" request happens constantly because the original is buried and unsearchable.

### Team & Handoff (71-80)
71. Two support agents unknowingly reply to the same customer message, creating a confusing double-response.
72. Handing off a customer conversation to a teammate means manually copy-pasting context into Slack.
73. There's no shared "who's handling this" status visible across a team for an inbound message.
74. A team can't tag/route messages by department (Sales vs. Support vs. Finance) automatically.
75. Coverage gaps (someone's on vacation) mean their DMs go unanswered with no automatic reassignment.
76. There's no audit trail of who responded to what, when, across channels, for accountability or QA.
77. Onboarding a new team member to "how we handle client messages" is entirely tribal knowledge, not system-enforced.
78. Shared inboxes (a shared support email) don't extend to shared visibility into WhatsApp Business or Telegram.
79. Escalation ("this needs a manager") is a manual @mention, not a rule-driven workflow.
80. Metrics like average response time are unavailable when conversations span multiple disconnected tools.

### Time, Timezone & Language (81-88)
81. A message sent by an international client at 3am your time either wakes you up or waits until you happen to check.
82. There's no automatic "this is outside their working hours, delay the notification for them too" courtesy.
83. Messages in a language you don't fully read (a supplier in German, per your CLAUDE.md context) require manual translation, every time.
84. Scheduling a message to send at the right time for the recipient's timezone is not supported by most chat apps.
85. Silent hours are set once and don't adapt to travel/timezone changes automatically.
86. There's no "quiet hours except if it's actually urgent" nuance - it's binary, all or nothing.
87. Async communication across timezones means threads go stale waiting for a reply that could come 12 hours later, with no visibility into "is this normal lag or did they miss it."
88. Recurring international calls/messages have no timezone-aware reminder that accounts for both parties.

### Spam, Noise & Trust (89-95)
89. Cold outreach and spam DMs are mixed in with real messages, requiring manual judgment every time.
90. Group chats you were added to years ago and never left generate constant low-value noise.
91. There's no reputation/trust signal for a first-time sender (is this a known scam pattern, a bot, a real person).
92. Promotional emails and newsletters bury the one transactional email you actually need (a shipping update, a password reset).
93. Phishing attempts mimicking real contacts (spoofed sender names) are hard to catch across every different app's UI.
94. Marking something as spam in one app doesn't teach the system anything about that sender elsewhere.
95. There's no per-channel noise budget ("I'll tolerate 10 notifications/day from this Discord server, no more").

### Miscellaneous High-Value Problems (96-100)
96. Switching jobs or phones means painstakingly re-adding every messaging account from scratch, with no portable settings.
97. There is no single place to see "everyone I talk to and how important they are to me" - relationship context lives only in memory.
98. Repetitive replies ("thanks, will review and get back to you") are typed out fresh every single time instead of automated.
99. A message that requires a real decision (approve/deny, yes/no) has no lightweight in-line way to act without opening five apps.
100. There is no single trustworthy morning briefing that says "here is everything from every channel that actually needs you today" - each app's "unread" count is not that.

---

# Solutions

One solution per problem, matched by number.

1. Unified priority scoring: every message gets a single cross-app importance signal (VIP match, keyword match, sender history) that drives notification style, not the source app's default.
2. Global Focus Mode in Smart Message Center silences all connected channels at once via each provider's own mute/DND API where available, and via local notification suppression otherwise.
3. Replace raw badge counts with a single "Needs You" count, computed from priority rules, not raw unread totals.
4. Morning Briefing surfaces only the messages that matched a rule or crossed the importance threshold - everything else stays in the full inbox, unbadged.
5. Rule engine supports per-contact exceptions ("mute this chat except direct @mentions of me").
6. Desktop notifications respect Focus Mode and importance score together - low-priority messages queue silently until Focus Mode ends.
7. A single "Always Notify" contact list (VIPs) applies across every connected channel simultaneously.
8. One notification-preference surface in Smart Message Center, synced to every device via the account, not per-device per-app settings.
9. Sender-flagged urgency (subject line "URGENT", explicit markers) is parsed and boosts priority score automatically.
10. One daily/weekly digest aggregates across all channels instead of five separate per-app digests.
11. Unified Inbox surfaces DMs from every connected channel, including ones you rarely open natively, in one feed.
12. Pinned/priority messages float above general group chat noise in the unified view regardless of arrival time.
13. Message history is retained in Smart Message Center's own store (subject to retention settings), independent of any single device.
14. New/unknown sender detection with contact-matching (name, shared groups) flags a "possible important new contact" state instead of silent ambiguity.
15. Secondary email accounts are connected as first-class linked accounts, feeding the same unified inbox and rule engine.
16. "Missed while offline" recap on next open, prioritized by the same importance scoring as live messages.
17. All linked workspaces (including client Slack workspaces) surface in one inbox, not requiring separate app-switching.
18. Cross-app "unanswered after N days" tracker flags stale threads regardless of which channel they're on.
19. Messages requiring a decision can be explicitly flagged (manually or by AI classification) and pinned to a "needs decision" queue.
20. Return-from-away triage: on reopening after inactivity, messages are pre-sorted by importance instead of dumped in arrival order.
21. Contact profiles store "preferred channel," so composing to that person defaults to the right app automatically.
22. Single unified inbox eliminates most app-switching for the read/triage step entirely.
23. Contact timeline merges messages from every channel with that person into one continuous history.
24. Cross-channel search covers every connected account from one search bar.
25. One-click "send to CRM/notes" action attaches a message or thread to an external tool via integration.
26. Smart Message Center enforces one consistent UI paradigm (threads, priorities, actions) across all underlying channels.
27. Company/client grouping lets you tag multiple contacts and channels under one account entity for a combined view.
28. A single, consistent keyboard-shortcut layer works across all channels inside Smart Message Center.
29. Multiple accounts of the same provider type are merged into one inbox view with account-of-origin tagging.
30. Global Focus Mode (see #2) is the one cross-channel focus control, replacing per-app focus settings.
31. "Commitments" - user or AI-flagged promises in a message - get a tracked follow-up reminder automatically.
32. Automation rule: no reply detected within N hours on a flagged lead conversation triggers a reminder.
33. "Waiting On" list: mark any outbound message as awaiting reply; it surfaces automatically if unanswered past a threshold.
34. Shared "Waiting On" visibility for team/group contexts shows who owes a response across the group.
35. Automation trigger "no reply after N days" + tag "Invoice" chains into a payment-reminder nudge.
36. Long threads get an AI-optional "unresolved ask" flag that resurfaces the original request until marked done.
37. Native snooze action available on any message in Smart Message Center regardless of source app, backed by the platform's own store.
38. One-click "summarize this thread" (AI-optional) or a manual quote-reply gives instant context without a full re-read.
39. Recruiter-specific pipeline view tracks candidate conversations by stage, with automatic staleness flags.
40. "Owed by me" / "Owed to me" cross-channel dashboard, built directly from the Waiting On + Commitments data.
41. Per-contact custom notification profiles (VIP = distinct sound/visual treatment) applied uniformly.
42. Global VIP list overrides Focus Mode / Do Not Disturb across every connected channel.
43. Rule: sender matches "Investor" tag → always top of inbox + notification, regardless of subject line noise nearby.
44. VIP tagging configured once, in Contacts, applies automatically to every channel that contact is reachable on.
45. SMS/phone-adjacent channels get the same VIP override logic as chat/email once contacts are unified.
46. Time-boxed VIP rules ("VIP during launch week Mar 1-7") layer on top of default VIP status.
47. Adaptive silent hours: VIP messages ring through, everything else queues for the Morning Briefing.
48. First-contact heuristics (shared domain match, LinkedIn lookup via optional integration) flag "possibly important new sender."
49. Team-lead dashboard view (business tier) shows escalation-flagged messages across reports' shared/handled inboxes.
50. VIP definitions live once on the user's Contact record and apply to every linked channel that contact uses.
51. Federated search across every linked account from a single search bar with per-channel filters.
52. Smart Message Center's own indexed search (Postgres full-text at MVP, semantic search as a paid AI feature) outperforms native per-app search.
53. Attachments auto-tagged and indexed into a unified Files view, searchable by sender, date, type, and content (OCR optional).
54. Tag-based search spans every channel simultaneously since tags are a Smart Message Center-level concept, not per-app.
55. Optional AI transcription for voice notes makes them full-text searchable (explicitly optional, never required).
56. Cross-channel search means you search once, not per app, cutting retrieval time regardless of which channel it lives on.
57. Contact timeline (see #23) resurfaces full history with a re-engaged contact instantly.
58. Semantic/AI-assisted search is offered as a premium add-on; keyword search remains the reliable non-AI baseline.
59. Team search permissions extend to shared inboxes so teammates can search customer history without raw tool access.
60. One-click export (per conversation, per contact, or bulk) to PDF/CSV/JSON for legal or archival needs.
61. Automation action "auto-tag + forward attachment" routes invoice-type files to a designated email/integration automatically.
62. Unified Files view aggregates every attachment across every channel into one searchable, filterable list.
63. Automatic file-type classification (best-effort MIME/heuristic at MVP, AI-assisted later) tags invoices, contracts, resumes on arrival.
64. Original file preserved in Smart Message Center's storage layer (S3) independent of the sending app's compression.
65. "Save to Files" one-click action on any image/screenshot links it permanently back to its source conversation.
66. Files view is channel-agnostic by design, so resumes from LinkedIn and email land in the same place automatically.
67. Automation rule: "attachment type = PDF AND sender = [client] → forward to [email]" configured once in the visual builder.
68. File versioning within a conversation thread groups same-named/related attachments so the latest is always identifiable.
69. Optional AI transcription for voice notes producing a searchable text companion to the original audio.
70. Because files are centrally indexed (#53/#62), "send me that again" requests become a 5-second search instead of a re-ask.
71. Shared inbox "claim" state prevents two agents from replying to the same inbound message simultaneously.
72. One-click "assign to teammate" carries full thread context along, no copy-paste required.
73. Visible assignment/status field ("Open / Claimed by X / Resolved") on every team-shared conversation.
74. Rule-based routing ("messages from domain @bigclient.com → Sales queue") auto-tags/routes on arrival.
75. Automation rule: "assignee = out of office → reassign to backup" keeps coverage without manual handoff.
76. Full audit log (who replied, when, from where) available per conversation for team/business tier accounts.
77. Rule templates and shared playbooks let teams encode "how we handle X" as an actual system rule, not tribal knowledge.
78. Shared team inbox extends to every linked channel type (WhatsApp Business, Telegram, email) uniformly, not just email.
79. Automation trigger "no reply from assignee within N hours + VIP sender → escalate to manager" is rule-configurable.
80. Cross-channel analytics dashboard (business tier) computes response times and volume across all connected channels together.
81. Recipient-timezone-aware delivery scheduling delays non-urgent sends until their working hours.
82. Automation option: outbound notifications respect the recipient's known working hours if their timezone/hours are set.
83. Optional AI translation renders incoming/outgoing messages in the user's preferred language, always shown alongside the original.
84. Scheduled send picks the recipient's local time zone automatically from their contact profile.
85. Silent hours follow the user's device timezone automatically and update on travel without manual reconfiguration.
86. Rule layering: "silent hours ON, but VIP always breaks through" is the actual default behavior, not an edge case.
87. Thread-level "awaiting reply, last activity Xh ago, this contact's normal lag is Yh" indicator sets expectations instead of ambiguity.
88. Recurring-event reminders account for both parties' timezones when scheduling via optional calendar integration.
89. Sender reputation scoring (first contact, shared network, domain reputation) flags likely spam/cold outreach for lower-priority sorting.
90. "Bulk archive inactive group chats" action with a one-time cleanup wizard on onboarding.
91. First-contact trust indicator ("new sender, no shared history") shown inline instead of treated identically to known contacts.
92. Transactional vs. promotional email classification (existing Gmail-style categorization, extended across all linked channels) declutters automatically.
93. Sender-identity verification warnings (name/number mismatch patterns) flag likely spoofing across every channel, not just email.
94. Spam/block action on a sender applies platform-wide in Smart Message Center where the underlying provider API supports it, and locally otherwise.
95. Per-channel/per-group noise budget setting caps how many notifications a source can generate before auto-muting.
96. Account/device migration is a one-time re-authentication per provider, with all rules, tags, and VIPs preserved server-side.
97. Contact Relationship view scores and displays "how important is this person to me" based on VIP status, tags, and interaction frequency.
98. Saved Replies / Snippets library lets users create and trigger canned responses in one action or via an automation rule.
99. Inline Quick Actions (approve/deny/yes/no buttons) on structured messages, resolvable without opening the source app.
100. Morning Briefing (see #4) is the single trustworthy daily view: everything that matched importance rules, across every channel, nothing else.

---

# Competitor Analysis

| Product | Strengths | Weaknesses | Pricing | Missing Features | UX |
|---|---|---|---|---|---|
| **Beeper** | Broadest channel coverage, genuinely unified thread view, strong brand among power users, Matrix-based portability story | History of ToS-risk bridges (iMessage/WhatsApp reverse-engineering), reliability issues on bridged accounts, weak automation/rules layer, weak team features | ~$10/mo | No visual automation builder, no team/shared inbox, limited VIP/priority logic beyond pin/mute | Clean, chat-app-like, but feels like "one app for all chats," not a productivity system |
| **Rambox** | Cheap, huge app catalog (100+ services as webviews), simple mental model | Just tabs webviews - no unification, no canonical data model, no automation, no cross-app search, high RAM usage | Free / $7-15/mo (Indie/Pro) | No real inbox, no rules engine, no notification intelligence at all | Dated, feels like a browser with bookmarks, not a product |
| **Franz** (and its forks: Ferdi, Ferdium) | Similar to Rambox, free/open-source forks available, low cost | Same fundamental flaw as Rambox - webview aggregation, not true integration; stalled development | Free (forks) / ~$6/mo (Franz Pro) | No automation, no unified search, no priority logic | Basic, utilitarian, no differentiation |
| **Shift** | Polished multi-app browser-in-a-box, good for managing multiple Google/Office accounts, workflow "Flows" for light automation | Automation is shallow (macro-style, not rule-based), core value is still "many tabs, one window," not true unification | Free / $99-249/yr (Advanced/Teams) | No cross-app rules engine, no VIP concept, no unified search across services | Polished but conceptually the same as Rambox - a window manager, not an inbox |
| **Missive** | Real shared team inbox (the closest competitor to our team persona), good email+chat unification for small teams, solid collaboration (internal comments, assignments) | Channel coverage is narrower (email, SMS via Twilio, some chat) - not Telegram/Discord/consumer WhatsApp-first, less consumer-friendly | $18-30/user/mo (Team tiers) | No visual no-code automation builder comparable to Zapier, no AI-native prioritization, limited personal/freelancer positioning | Clean, email-client-like, strong for teams, less suited to a solo power user juggling consumer apps |
| **Slack AI** | Deep native integration into Slack itself, strong summarization/search inside Slack, huge distribution (rides on existing Slack seats) | Not cross-platform at all - solves nothing about Telegram/Discord/Email/WhatsApp fragmentation, it's a feature not a hub | Add-on to Slack plans, ~$10/user/mo extra | No aggregation whatsoever - single-channel by design | Excellent within Slack, irrelevant outside it |
| **Superhuman** | Best-in-class email UX, keyboard-first speed, strong "important vs. not" triage for email specifically, premium brand cachet | Email only - explicitly does not solve multi-channel fragmentation, expensive for a single-channel tool | $30/mo (Starter), $40/mo (Business) | No chat/messenger integration at all, no automation beyond email-specific snippets/reminders | The UX bar to beat for speed and polish - genuinely excellent, worth studying closely |
| **Microsoft Teams** | Enterprise-default, deep Office 365 integration, huge installed base | Single-vendor lock-in by design, no external channel aggregation, heavy/slow client, notification fatigue is a well-known internal complaint | Bundled in M365 (~$6-22/user/mo tiers) | No cross-platform aggregation, no consumer-channel support, automation is workflow-y (Power Automate) not messaging-native | Enterprise-functional, not delightful, not built for the "never miss a message" problem |
| **Gmail** | Best-in-class categorization/spam filtering for its own channel, huge scale, free, Priority Inbox is a legitimate proof-of-concept for "importance scoring" | Email only, categorization logic is a black box and not user-programmable in a visual rule-builder sense, zero chat/messenger awareness | Free / Workspace $6-18/user/mo | No cross-channel anything, filters are powerful but not visual/no-code in the Zapier sense | Mature, fast, familiar - the bar for "this should just work" that our unified inbox will be judged against |

**Critical synthesis - where the real opportunity is:**
- The **aggregator** category (Beeper, Rambox, Franz, Shift) has been fighting the wrong battle for a decade: getting every chat into one window. That's necessary, not sufficient, and none of them have a real automation or priority engine.
- The **productivity** category (Superhuman, Missive) proves the UX bar and the automation appetite exist, but neither spans consumer messaging channels (Telegram, Discord, WhatsApp).
- **Nobody** combines: (a) true multi-channel aggregation via official APIs, (b) a Zapier-grade no-code automation engine scoped to messaging, and (c) importance-based notification intelligence as the primary UX, not a bolt-on feature. That gap is the entire bet of Smart Message Center.
- **Honest risk to flag**: Beeper is the most dangerous competitor, not because their product is better today, but because they have brand trust and distribution in exactly this category, and adding an automation engine is a plausible move for them. Our defensibility can't be "we thought of unification first" - it has to be the automation/rules data model and the trust built from never over-promising on AI.
- **The actual technical moat, named**: as of 2026-07-18 ([ADR-0012](adr/0012-identitygraph-canonical-identity-layer.md)), this defensibility argument has a name - **IdentityGraph**, the canonical, cross-provider identity resolution layer every automation rule, search query, and notification decision runs through (`ARCHITECTURE.md` Section 13). A competitor can copy a visual rule builder or a unified-inbox UI in a sprint. They cannot copy a working, ToS-compliant, multi-provider identity resolution layer without first doing the multi-year work of building the unified messaging platform underneath it - which is exactly the "automation/rules data model" defensibility this section already argued for, now made concrete and buildable rather than aspirational.

---

# MVP

Every MVP feature exists because it directly serves one of two jobs: **(1) never miss what matters, (2) stop manually repeating communication work.** Anything that doesn't serve one of those two jobs is deferred, no matter how appealing, because a v1 that tries to be everything will be excellent at nothing and ship six months late.

1. **Unified Inbox (Telegram, Discord, Slack, Email via IMAP/SMTP)** - Why: this is the entry ticket to the category; without it there's no product, but per the competitor analysis it's necessary, not the differentiator, so scope is deliberately capped at 4 channels, not 20.
2. **Contact unification & VIP tagging** - Why: every priority feature downstream depends on knowing "who is this person" once, across channels. Without this, VIP logic would need to be configured per-channel, defeating the point.
3. **Priority/importance scoring (rule-based, not AI-dependent at MVP)** - Why: this is problem #1-10's direct fix and the core differentiator vs. Rambox/Shift/Franz, which have none of this.
4. **Global Focus Mode / Silent Hours with VIP override** - Why: directly answers the single most universal complaint (notification chaos) and is a killer live-demo feature for word of mouth.
5. **Visual automation rule builder (no code)** - Why: this is the Zapier-for-messaging bet; without it Smart Message Center is just another aggregator, indistinguishable from Beeper.
6. **Waiting On / Commitments tracking with reminders** - Why: directly solves the follow-up/accountability cluster (problems 31-40), which freelancers, sales, and recruiters all named as costing them money or opportunities.
7. **Cross-channel search** - Why: table stakes once aggregation exists; without it, aggregation actively makes retrieval worse, not better (more places to search, not fewer).
8. **Unified Files view with basic auto-tagging** - Why: attachments are a top complaint (61-70) and a natural, low-effort win once messages are centrally stored.
9. **Basic tagging system (manual + rule-driven, e.g. "Finance")** - Why: the prerequisite primitive for automation actions like "tag Finance," and useful standalone for organization.
10. **Snooze on any message, any channel** - Why: one of the most-requested, lowest-effort-to-build features that directly fixes problem #37 and has no real equivalent in native apps.
11. **Morning Briefing (daily digest, rule-driven)** - Why: the single artifact that proves the whole system works, in one screen, and is the natural daily-return hook for retention.
12. **Basic team shared inbox (claim/assign, no double-reply) - business tier only** - Why: the Support/Sales personas require this to adopt at all, and it's a meaningfully smaller build than full team analytics/escalation, so it's included in scope but gated to a paid tier.

**Explicitly excluded from MVP and why:** AI features of any kind (ship the rules engine first and prove the non-AI core works - AI is additive, never load-bearing, see AI Features section); WhatsApp (Business API access/approval friction and cost make it a v1.1 addition, not a launch blocker); mobile native apps (web + Tauri desktop first, React Native is a v2 investment); marketplace/plugin ecosystem (needs a stable connector SDK first, premature at MVP).

---

# V2

Ordered roughly by expected value, not necessarily build order.

- **WhatsApp Business API integration** (highest-demand missing channel, gated by Meta's approval process).
- **LinkedIn DM integration** (huge value for recruiters/sales/founders, technically harder - no public API, requires a compliant approach or explicit deprioritization if none exists).
- **SMS/iMessage bridging** (via carrier-level or Apple-compliant methods only - explicitly will not pursue reverse-engineered iMessage bridging, see Never Build).
- **Mobile native apps (React Native)** - push notifications done right is a mobile-native problem, not solvable well from a web wrapper alone.
- **Team analytics dashboard** (response times, volume, SLA tracking) for the Support/Sales personas.
- **Escalation workflows** (auto-reassign, manager notification on SLA breach).
- **Calendar-aware automation** (e.g., "don't notify me during meetings," "propose times based on both parties' calendars").
- **Contact relationship intelligence** (interaction frequency, response-time patterns, relationship "health" score).
- **Public API + webhooks** for power users and third-party integration (the "power user" persona's top ask).
- **Connector SDK + community connector marketplace** (the moat-widening move once the platform is proven - lets the community build long-tail channel connectors like Signal, Matrix, WeChat).
- **Semantic/vector search** across all messages (natural AI upsell once keyword search has proven the retrieval UX matters).
- **Multi-language UI** (the product itself, not just message translation).
- **Voice note transcription pipeline** as a default, not opt-in, feature once cost curves justify it.
- **Scheduled/recurring automations** (e.g., "every Monday, summarize last week's unresolved threads").

---

# AI Features

**Hard rule: AI is an enhancement layer, never a dependency.** Every AI feature below must have the product fully functional without it - if an AI feature going down, being disabled by the user, or being priced out of reach breaks a core workflow, it was scoped wrong and doesn't ship. This is a deliberate contrast with competitors who are quietly becoming "an AI wrapper" - we are a rules and data platform first, with AI as an optional accelerant.

- **AI-suggested automation rules** - user describes intent in natural language ("remind me if my boss doesn't reply in a day"), AI proposes a rule in the visual builder for the user to review and confirm before it's ever active. Never auto-activates a rule without explicit confirmation.
- **Conversation summaries** - long thread → 2-3 sentence summary, shown as an optional expandable element, original always one click away.
- **Suggested replies** - draft suggestions the user can edit or ignore; never auto-sends.
- **Message classification / auto-tagging** - AI-assisted tag suggestions (e.g., "this looks like an invoice") that the user approves; the rule-based classifier (MIME type, keyword match) remains the default, free, non-AI path.
- **Smart priority scoring assist** - AI can refine the rule-based importance score with sentiment/urgency-language detection, but the rule-based score alone must remain a fully usable signal on its own.
- **Semantic search** - natural-language search across message history, layered on top of keyword search, never replacing it.
- **Voice note transcription** - optional per-message or account-wide, always leaves the original audio accessible.
- **Translation** - inline optional translation of inbound/outbound messages, always showing the original alongside.
- **Task/commitment detection** - AI scans messages for implied commitments ("I'll send that by Friday") and offers to create a tracked Commitment; user confirms, nothing is auto-created silently.
- **Natural-language automation search/editing** - "show me my rules about invoices" as a conversational layer over the existing rule list, not a replacement for it.

**Explicit anti-pattern we will not build**: an AI "autopilot" mode that auto-replies to real people on the user's behalf without per-message confirmation. Auto-reply automation exists (see Automation Engine), but it is template/rule-driven and user-authored, not a model improvising as the user's voice - the reputational and trust risk of an AI sending something wrong as "you" is not worth the convenience, and it undermines the entire trust premise of the product.

---

# Automation Engine

**Design.** Every automation is a **Trigger → Condition(s) → Action(s)** triple, expressed as data (JSON), never code, edited through a visual builder (think a simplified, messaging-scoped Zapier canvas: trigger card, optional condition cards chained with AND/OR, one or more action cards). Rules run against the canonical `Message`/`Conversation`/`Contact` domain model described in the architecture doc, so a rule written once applies identically whether the message came from Telegram, Slack, Discord, or Email - **channel-agnostic by construction**, which is the actual technical moat, not the visual builder UI itself (that's copyable; the canonical cross-channel event model is what's hard to replicate without doing the unification work honestly).

**Trigger types**: message received, message sent, no reply after duration, scheduled/time-based, attachment received, sender first contact, keyword match, sentiment/urgency detected (AI-optional), reaction received, contact status change (e.g., marked VIP).

**Condition types**: sender is / sender in group / sender is VIP, channel is, contains keyword/phrase, contains attachment of type, time of day / day of week, silent hours active, message length, contains a question, thread has N unresolved messages, previous rule already matched (chaining).

**Action types**: set priority, notify (with channel: push/email/sound), override silent mode, tag, assign to teammate, snooze until, create reminder, forward attachment, send auto-reply (template), archive/mute, add to Waiting On, escalate, translate, summarize, log to external tool (webhook).

### 100 Automation Examples

**Priority & VIP (1-10)**
1. IF sender is Boss THEN override silent mode.
2. IF sender is VIP AND silent hours active THEN notify anyway with distinct sound.
3. IF sender is investor THEN set priority = highest.
4. IF sender is unknown AND shares a group with 3+ existing contacts THEN flag as "possibly known."
5. IF sender is client AND channel is WhatsApp THEN always notify regardless of Focus Mode.
6. IF message from spouse/family tag THEN always override silent mode.
7. IF sender changed to VIP THEN re-score their last 10 unread messages as high priority.
8. IF sender is new AND matches a company domain in CRM tag THEN set priority = high.
9. IF sender is on "Do Not Disturb Exempt" list THEN bypass all mute rules.
10. IF message is from a group chat AND does not @mention me THEN set priority = low.

**Time-based & Reminders (11-20)**
11. IF no reply from me in 2 days THEN remind me.
12. IF no reply from contact in 3 days AND tagged "Lead" THEN send follow-up reminder.
13. IF invoice sent AND no payment confirmation in 7 days THEN remind me to follow up.
14. IF message received outside recipient's working hours THEN delay notification until 9am their time.
15. IF scheduled send time reached THEN dispatch message.
16. IF Monday 9am THEN send weekly digest of unresolved Waiting On items.
17. IF meeting starts in 10 minutes THEN mute all non-VIP notifications.
18. IF candidate marked "offer sent" AND no reply in 5 days THEN remind recruiter.
19. IF message flagged "needs decision" AND unresolved after 24h THEN escalate priority.
20. IF silent hours end THEN deliver queued digest of everything missed.

**Tagging & Classification (21-30)**
21. IF message contains "invoice" OR attachment is PDF from known vendor THEN tag Finance.
22. IF message contains "urgent" THEN set priority = highest AND play alarm sound.
23. IF message contains "contract" THEN tag Legal.
24. IF attachment is a resume (PDF/DOC + keyword match) THEN tag Recruiting.
25. IF message contains a question mark AND no reply sent THEN tag "Needs Response."
26. IF sender's domain matches a known client list THEN tag with that client's name automatically.
27. IF message contains "refund" OR "cancel" THEN tag Support-Escalation.
28. IF message contains a phone number pattern THEN tag "Contains PII" for compliance visibility.
29. IF message is in a group chat AND contains "meeting" THEN tag Scheduling.
30. IF attachment type is image AND sender is client THEN tag "Design Feedback."

**Auto-Reply & Templates (31-40)**
31. IF message received outside business hours THEN send auto-reply "I'll respond during business hours."
32. IF message is a first-time DM from an unknown sender THEN send a polite intro auto-reply.
33. IF message matches FAQ pattern ("what are your rates") THEN suggest saved reply template.
34. IF message received while on vacation-mode THEN send out-of-office auto-reply once per sender per week.
35. IF candidate sends "still interested?" AND role is closed THEN send templated closure reply.
36. IF message contains "are you available" AND calendar shows busy THEN auto-suggest next open slot.
37. IF customer sends order number pattern THEN auto-reply with tracking status (via integration).
38. IF message is a duplicate of a recently answered FAQ THEN suggest the same saved reply.
39. IF support ticket resolved AND customer replies "thanks" THEN auto-close with no further action needed.
40. IF sender asks for meeting link THEN auto-reply with the user's booking page link.

**Escalation & Team Routing (41-50)**
41. IF no reply from assignee within 4 hours AND sender is VIP THEN escalate to team lead.
42. IF message from domain @bigclient.com THEN route to dedicated Sales queue.
43. IF message contains "cancel my subscription" THEN route to Retention queue with high priority.
44. IF assigned teammate is marked out-of-office THEN reassign to backup teammate.
45. IF conversation unresolved for 48h AND tagged Support THEN notify team lead.
46. IF message sentiment detected as angry/frustrated (AI-optional) THEN escalate to senior agent.
47. IF two teammates open the same conversation simultaneously THEN show "X is viewing this" indicator to prevent double-reply.
48. IF ticket tagged "Finance" THEN auto-assign to Finance team member.
49. IF message is from a press/journalist domain THEN route to Founder/PR-designated contact.
50. IF conversation reassigned 3+ times THEN flag for manager review.

**Silent Hours & Focus (51-58)**
51. IF silent hours active AND message is not from VIP THEN queue for Morning Briefing.
52. IF traveling (timezone changed) THEN auto-adjust silent hours to new local time.
53. IF Focus Mode manually enabled THEN suppress all notifications except emergency contacts.
54. IF weekend AND sender is not tagged "Always Notify" THEN delay notification to Monday 9am.
55. IF silent hours active AND keyword "emergency" detected THEN override and notify immediately.
56. IF calendar shows "Do Not Disturb" event THEN sync Smart Message Center's Focus Mode automatically.
57. IF child/family emergency contact messages THEN always break through, no exceptions, no configuration needed.
58. IF notification budget for a group chat exceeded (e.g. 10/day) THEN auto-mute until next day.

**Cross-Channel & Files (59-68)**
59. IF attachment is PDF AND tagged Finance THEN forward to accountant's email automatically.
60. IF message received on Telegram from a contact who also emails me THEN merge into one contact timeline.
61. IF file sent is a contract THEN save a copy to designated cloud folder (integration).
62. IF image received AND tagged "Design Feedback" THEN add to shared project board (integration).
63. IF voice note received THEN generate transcript and attach as searchable text (AI-optional).
64. IF message contains a link THEN save to a "Links to review later" collection.
65. IF attachment size exceeds 20MB THEN notify sender that a smaller version would help (auto-reply).
66. IF same file sent twice by the same sender THEN flag as duplicate, skip re-processing.
67. IF calendar invite (.ics) received THEN offer one-click "add to calendar."
68. IF message contains a shipping/tracking number pattern THEN auto-tag "Shipping."

**Sales & Recruiting Specific (69-78)**
69. IF lead tagged "Hot" AND no reply in 24h THEN remind me with high priority.
70. IF candidate moves to "Interview Scheduled" stage THEN auto-send confirmation template.
71. IF deal tagged "Closing this month" AND no activity in 3 days THEN escalate reminder.
72. IF candidate ghosts after offer (no reply 5 days) THEN move to "Cold" and notify recruiter.
73. IF new lead's first message contains budget/timeline info THEN auto-tag "Qualified."
74. IF prospect replies "not interested" THEN auto-tag "Disqualified" and stop follow-up reminders.
75. IF a LinkedIn DM comes from a decision-maker title (VP, Director, C-level) THEN set priority = high.
76. IF proposal sent AND no reply in 5 business days THEN remind me to follow up.
77. IF candidate references a competitor offer THEN flag "Urgent - competing offer" for recruiter.
78. IF client mentions renewal date approaching THEN create reminder 30 days before that date.

**Personal & Life (79-88)**
79. IF message from a parent/family tag contains "call me" THEN override silent mode.
80. IF group chat about an event I RSVP'd to has new activity THEN notify normally, otherwise mute.
81. IF landlord/property manager messages THEN set priority = high.
82. IF message contains "delivery" AND sender is a known courier THEN tag "Package."
83. IF doctor's office sends appointment reminder THEN auto-add to calendar.
84. IF school/university sends an announcement THEN tag "School" and set priority = medium.
85. IF a bill-pay reminder is received (email/SMS) THEN create a Commitment with due date.
86. IF birthday reminder triggers (external calendar) THEN suggest sending a message via saved template.
87. IF message from an unknown number contains a suspicious link pattern THEN flag as "possible spam/phishing."
88. IF roommate/shared-living group chat mentions "rent" THEN tag "Household-Finance."

**Security & Compliance (89-95)**
89. IF sender name matches a known contact but the underlying account ID doesn't THEN flag "possible impersonation."
90. IF message requests payment info/credentials THEN flag "possible phishing" regardless of sender.
91. IF a new device logs into a linked account THEN notify the user immediately (security, not messaging automation, but same rules engine).
92. IF a rule would auto-forward messages containing PII THEN require explicit user confirmation before activation.
93. IF an automation hasn't run successfully in 24h (provider API issue) THEN alert the user that a rule may be silently failing.
94. IF message volume from one sender spikes abnormally (100+ in an hour) THEN flag as possible bot/compromised account.
95. IF a linked account's OAuth token is revoked externally THEN notify the user and pause dependent automations gracefully.

**Meta-Automation (96-100)**
96. IF a manually created rule matches nothing for 30 days THEN suggest archiving it.
97. IF two active rules conflict (contradictory actions on the same trigger) THEN warn the user at creation time.
98. IF user manually overrides a rule's action 3+ times THEN suggest editing the rule to match actual behavior.
99. IF a new contact is added AND matches the pattern of an existing VIP's rules (e.g. same company) THEN suggest applying similar rules.
100. IF user asks in natural language "remind me when my boss messages and I don't reply in an hour" THEN AI proposes the equivalent structured rule for one-click confirmation.

---

# Premium Features

**Free tier philosophy**: free must be genuinely useful daily-driver software for a single individual with modest channel count, or it won't spread by word of mouth. Free is not a crippled demo - it's the acquisition engine.

**Free:**
- Unified inbox for up to 3 connected accounts (any mix of the 4 MVP channels).
- Contact unification and manual VIP tagging.
- Rule-based priority scoring (non-AI).
- Global Focus Mode / Silent Hours with VIP override.
- Up to 5 active automation rules.
- Waiting On / Commitments tracking (unlimited).
- Cross-channel search (keyword only).
- Basic Files view.
- Morning Briefing (daily digest).
- Snooze on any message.

**Premium (paid, individual):**
- Unlimited connected accounts.
- Unlimited automation rules.
- AI features (summaries, suggested replies, semantic search, translation, transcription) via AI credits (see Pricing).
- Advanced rule conditions (sentiment, chaining, scheduled/recurring triggers).
- Priority support.
- Extended message retention/history.
- Custom notification sounds/profiles per VIP.

**Business/Team (paid, per seat):**
- Shared team inbox with claim/assign/no-double-reply.
- Escalation workflows and SLA rules.
- Team analytics dashboard.
- Role-based access control.
- Audit log.
- Admin-managed rule templates/playbooks.

**Enterprise (custom):**
- SSO (SAML/OIDC).
- Data residency options.
- Dedicated infrastructure / higher SLA.
- Custom connector development.
- Compliance support (SOC 2 reporting, DPA).

**Critical note**: AI is deliberately not what separates free from paid at the individual tier - the automation engine and unlimited connections are. Gating the *core value proposition* (never miss a message, automate the busywork) behind AI credits would contradict the "AI is optional, never load-bearing" principle and would mean free users don't get the actual differentiator, only the commodity aggregation. That's backwards and would kill word-of-mouth growth among price-sensitive personas (students, freelancers) who are also the loudest referrers.

---

# Pricing

| Tier | Monthly | Yearly (≈2 months free) | Notes |
|---|---|---|---|
| **Free** | $0 | $0 | 3 accounts, 5 rules, full core feature set, no AI credits |
| **Pro (individual)** | $12/mo | $120/yr | Unlimited accounts/rules, includes a base AI credit allowance (e.g. 200 AI actions/mo) |
| **Pro+AI Unlimited** | $22/mo | $220/yr | Same as Pro, unlimited/high-cap AI usage for power users who lean on summaries/search heavily |
| **Business** | $18/user/mo (min 3 seats) | $180/user/yr | Shared inbox, escalation, analytics, RBAC |
| **Enterprise** | Custom (starts ~$40/user/mo) | Custom | SSO, compliance, dedicated infra, custom connectors, contract-based |

**Add-on**: AI credit top-ups purchasable a la carte ($5 per 500 actions) for Pro users who exceed their monthly allowance without needing to upgrade tiers - avoids punishing a good month of heavy use with a forced tier jump.

**Pricing philosophy / critical self-check**: $12/mo individual pricing sits deliberately below Superhuman ($30-40/mo) because our differentiator (automation + cross-channel) is unproven at their price point on day one - we earn the right to charge Superhuman-tier prices once retention data proves the "never miss a message" claim holds up, not before. Business tier at $18/seat undercuts Missive's $18-30 range on the low end while matching it on the high end, appropriate given Missive has years of team-feature maturity we won't match at launch. **Risk to flag honestly**: a $12/mo price point for a product whose core promise is largely deliverable by disciplined manual habits (checking your apps, setting phone reminders) means the willingness-to-pay is not guaranteed - pricing may need to drop toward a $6-8/mo entry point post-launch if conversion data says so. Don't get attached to the initial number.

---

# Viral Features

Word-of-mouth in this category has to come from **visible moments of "how did it know that,"** not referral gimmicks bolted on top - a communication tool spreads through demonstrated trust, the same way Superhuman spread by people literally showing coworkers their inbox speed.

- **"Powered by Smart Message Center" auto-reply signature** (opt-in, off by default) on auto-replies sent to new/unknown contacts - every auto-reply is a tiny ad to someone who just experienced the product working.
- **Shareable rule templates**: a user builds a great automation ("VIP escalation for support teams") and can share it as a link; anyone who opens it can one-click import it into their own account - this turns power users into unpaid rule-marketplace contributors and gives new users an instant "wow" starter pack instead of a blank canvas.
- **"You would have missed this" onboarding moment**: during setup, retroactively scan the last 7 days of connected accounts and show the user 1-3 messages they actually missed or were late to - a visceral, personal, screenshot-worthy proof point people share unprompted ("this app just showed me I missed my landlord's message for 4 days").
- **Team invite loop baked into the shared inbox feature itself**: a freelancer/support agent can't use claim/assign without inviting a teammate, so the team feature is structurally viral, not artificially so.
- **Public "Automation Recipe" gallery** (like Zapier's public zap templates or IFTTT's applets) - SEO-friendly, shareable, and each recipe page is a soft product demo.
- **Referral credit in AI usage, not cash** - refer a friend, both get a month of AI-unlimited free; ties the incentive to the product's actual premium lever instead of a generic cash referral that attracts low-intent signups.
- **"Missed message insurance" framing in marketing** - not a feature per se, but a positioning hook (see Brand) that gives people a one-sentence, tweetable way to explain the product to someone else without needing a demo.

**Explicitly rejected viral tactics and why**: growth via aggressive contact-list scraping/invite-spam (the WhatsApp/early-social-app playbook) is off the table - it burns exactly the trust this product depends on, and in a messaging product, spammy invites are a category-level credibility killer, not just a bad look.

---

# Growth Strategy

**First 100** - Hand-picked, high-context users: the personas the founder can reach directly (freelancer/developer communities, personal network, indie hacker forums). Goal is not volume, it's depth of feedback - every one of these 100 gets a direct line to the founder (Discord/email), and the "you would have missed this" onboarding moment is validated ruthlessly here before wider release. No paid acquisition at this stage; it would waste budget on a product still finding its shape.

**First 1,000** - Public launch on channels where the target personas already congregate and self-select (Hacker News "Show HN," Product Hunt, relevant subreddits for freelancers/developers, indie hacker Twitter/X). Leverage the shareable rule templates and the "missed message" onboarding hook as the core of every launch post - show, don't tell. Track activation (connected ≥2 accounts + created ≥1 rule) as the real success metric, not signups.

**First 10,000** - Content and SEO investment around the Automation Recipe gallery (each recipe = an indexable page targeting long-tail searches like "auto reply telegram when busy"), plus the first paid acquisition experiments (narrow, persona-targeted - e.g. freelancer-community newsletter sponsorships, developer podcast ads) once organic channels show which persona converts and retains best. This is also the point to formalize the referral-via-AI-credits loop, since there's now a large enough base for it to compound.

**First 100,000** - Team/business tier becomes a real growth engine via the structural team-invite loop (shared inbox requires invites). Category-defining content marketing (own the "notification chaos" / "unified inbox automation" search terms). Consider platform partnerships (e.g. being a featured/recommended tool from Telegram or Slack's app directories) now that reliability and scale are proven. This is also the natural point to evaluate paid channels at real budget (not experiments) since LTV/CAC data from the first 10K-100K is now trustworthy enough to spend against.

**Critical self-check**: resist the temptation to chase growth-hacky viral loops before activation and retention are proven at the 1,000-user stage. A product in this trust-sensitive category that grows fast before it's reliable will generate exactly the kind of "it lost my messages" word-of-mouth that kills a communication tool permanently - growth must be gated by reliability metrics, not just funnel metrics.

---

# Monetization

- **Subscriptions** (primary, see Pricing) - the core, predictable revenue line; individual Pro, Business per-seat, Enterprise custom.
- **AI credits** - metered add-on for AI-feature-heavy usage beyond the plan allowance, priced to roughly cover underlying model cost plus margin; deliberately not the primary revenue driver so the product's value never feels AI-gated.
- **Teams** - per-seat Business tier revenue, with the shared-inbox feature acting as both a monetization line and a growth loop (see Viral Features) simultaneously.
- **Enterprise** - custom contracts for SSO/compliance/dedicated infra; lower volume, high ACV, sold rather than self-served.
- **Marketplace (v2+, not MVP)** - once the Connector SDK and Automation Recipe gallery mature, a revenue-share marketplace for community-built connectors and premium rule templates is plausible, similar to Zapier's app ecosystem, but this is explicitly deferred until the core platform and its data model are proven stable enough to build a third-party ecosystem on top of without breaking changes constantly.

**What we will not monetize on**: user data. No ad-based revenue, no selling message content or metadata to third parties, no "free in exchange for training data" model. In a product whose entire value proposition is "trust us with every message you receive," any data-monetization model is an existential contradiction, not just a bad look - flagged explicitly here so it never becomes a "growth hack" someone proposes later under revenue pressure.

---

# Brand

**Brand personality**: calm competence. Not playful/quirky (this isn't a consumer toy), not cold/enterprise (this isn't Microsoft Teams). Think "the assistant who never drops a ball" - reliable, precise, quietly confident. The emotional register we're selling is *relief*, not excitement.

**Tone**: direct, warm, never cutesy. No exclamation-point marketing copy, no "supercharge your inbox!!" energy - that tone actively undermines trust in a product whose pitch is "calm down, we've got this." Copy should read like a competent colleague explaining something clearly, not a startup trying to sound fun.

**Colors**: a restrained palette anchored in deep blue/ink tones (trust, calm, "signal" - evokes focus rather than alarm) with a single, deliberate accent color reserved *only* for true priority/VIP indicators (e.g. a warm amber or coral) - the accent color's entire brand job is to be the visual language of "this matters," so it must never be used decoratively elsewhere in the UI or it loses meaning. Neutral grays for everything else; no gradient-heavy, saturated "AI startup" purple-to-pink aesthetic - that visual language is already overused by 2026 and signals "hype product," which is the opposite of the trust we're selling.

**Typography**: a clean, highly legible variable sans-serif (e.g. Inter or a similar grotesque) for UI and body text - optimized for scanning a dense inbox quickly, not for personality. A monospace accent face reserved for rule-builder/automation contexts (trigger/condition/action cards) to subtly signal "this is a system, precise and inspectable," reinforcing that automations are transparent logic, not a black box.

**Logo direction**: avoid literal messaging-app tropes (speech bubbles, envelopes - every competitor already uses these, it's visual noise). Direction to explore: an abstract mark suggesting *convergence/routing* - multiple lines resolving into one point - which is literally what the product does (many channels, one signal) and differentiates from the bubble-icon crowd at a glance in an app dock full of Slack/Discord/Telegram bubble icons.

---

# UI Principles

- **The unread count must always be trustworthy.** If "Needs You: 3" is ever wrong (shows 3 when there are 8 real items, or vice versa), the entire product's core promise is broken - this is the single most important UI invariant in the product, worth more engineering care than any visual polish.
- **Speed is a feature, not a nice-to-have.** Every core action (triage, snooze, reply, tag) must be reachable via keyboard shortcut, inspired directly by Superhuman's bar - power users (developers, founders) will judge the entire product on how fast the first 60 seconds feels.
- **Never mimic the source app's chrome.** A Telegram message inside Smart Message Center should look like it belongs to Smart Message Center, not like an embedded Telegram widget - visual consistency across channels is what makes it feel like one system instead of Rambox's tab-of-webviews approach.
- **Automations must be inspectable, not magical.** Every rule that fires should be traceable - the user can always see "this happened because Rule X matched." An automation system that feels like a black box will not be trusted with something as consequential as message delivery.
- **Silence is a first-class visual state, not just "nothing happened."** When Focus Mode is active, the UI should clearly communicate "you are protected right now, N things are queued," so calm is visible and reassuring, not ambiguous.
- **Progressive disclosure over feature-cramming.** The default view is radically simple (Morning Briefing, Needs You, Waiting On); power-user depth (rule builder, advanced search filters) exists one level down, never cluttering the default surface.
- **AI, when present, is visually distinct and always dismissible.** AI-suggested content (summaries, suggested replies, proposed rules) uses a consistent visual treatment (e.g. a subtle border/label) so users always know what's model-generated versus their own/their contact's actual words - never blur that line, ever.
- **No dark patterns, anywhere.** No fake urgency, no notification-bait ("someone is typing..." abuse), no guilt-trip copy on unsubscribe/downgrade flows. This is a trust-category product; a single dark pattern discovered by a power user (who will find it and post about it) does disproportionate brand damage here versus a typical SaaS.

---

# Roadmap (36 Months)

**Months 1-3: Foundation**
Ship MVP as scoped (Section "MVP"). Telegram, Discord, Slack, Email. Priority scoring, Focus Mode, rule builder v1, Waiting On, Files, search, Morning Briefing. Target: first 100 hand-picked users, validate the "you would have missed this" onboarding hook.

**Months 4-6: Public Launch & Retention Proof**
Public launch (HN/Product Hunt/communities). Harden reliability (this phase is retention-or-die - see Growth Strategy critical self-check). Ship team shared inbox (business tier) to unlock the Support/Sales personas. Target: 1,000 users, activation and week-4 retention become the north star metrics, not signups.

**Months 7-9: WhatsApp & AI Layer v1**
WhatsApp Business API integration (highest-demand missing channel). First AI features ship (summaries, suggested replies, AI rule suggestions) as explicitly optional add-ons. AI credits monetization begins.

**Months 10-12: Team Depth**
Escalation workflows, team analytics dashboard, RBAC. Automation Recipe gallery launches (SEO + viral loop). Target: 10,000 users, first paid acquisition experiments begin.

**Months 13-15: Mobile Native**
React Native app development, focused specifically on doing push notifications and Focus Mode correctly at the OS level (the thing a web wrapper structurally can't do well). Desktop (Tauri) reaches feature parity and polish milestone.

**Months 16-18: Platform Opening**
Public API + webhooks ship for power users. Connector SDK stabilizes internally (used for WhatsApp/LinkedIn builds) as prep for external opening.

**Months 19-21: LinkedIn & Relationship Intelligence**
LinkedIn DM integration (or documented decision not to pursue, if no compliant path exists by then). Contact relationship intelligence (interaction patterns, response-time health) ships as a Pro feature.

**Months 22-24: Marketplace Beta**
Connector SDK opens externally in limited beta. Rule template marketplace (monetized, revenue-share) launches. Target: 100,000 users.

**Months 25-30: Enterprise Readiness**
SSO (SAML/OIDC), audit log maturity, data residency options, SOC 2 process begins. Enterprise sales motion stood up (this is a deliberate, late investment - selling enterprise before the product and trust are proven wastes sales cycles on a "not yet" answer).

**Months 31-36: Category Ownership**
Semantic search and AI layer v2 (proactive assistant behaviors, always opt-in). International expansion (multi-language UI, region-specific channel support - e.g. KakaoTalk, LINE, WeChat where compliant). SOC 2 Type II achieved. Target: category-defining brand position on "unified inbox automation," evaluated honestly against Beeper's and Missive's positions at that point, not assumed.

---

# Success Metrics

Ranked by what actually proves the mission, not vanity metrics:

1. **"Missed message" incidence rate** (self-reported + inferable from Waiting On staleness) trending down for active users - this is the single metric that validates the entire mission statement; if it doesn't move, nothing else matters.
2. **Week-4 and Month-3 retention**, segmented by persona - retention, not signups or DAU, is the real signal in a trust-category product; a user who churns after week 1 never trusted the product enough to connect their real accounts.
3. **Activation rate**: % of signups who connect ≥2 accounts AND create ≥1 automation rule within the first session - this is the leading indicator that predicts retention, and the number the growth strategy should actually optimize.
4. **Rule engagement**: average active (non-deleted, actually firing) rules per paying user - proves the automation engine is the retained value, not just the aggregation.
5. **Time-to-first-"aha"**: time from signup to the onboarding "you would have missed this" moment - shorter is directly correlated with conversion, this should be measured and optimized relentlessly.
6. **Net Promoter Score, specifically among the Power User and Founder personas** - these are the personas whose word of mouth compounds fastest; their advocacy matters disproportionately more than raw NPS average.
7. **Support ticket volume related to "lost/missed message"** trending toward zero - a direct, unambiguous measure of whether the core reliability promise (see UI Principles: trustworthy unread count) is being kept.
8. **Revenue metrics** (MRR, LTV:CAC, expansion revenue from Free→Pro→Business) - real business metrics, but deliberately ranked after trust/retention metrics because chasing revenue before reliability is proven is exactly the failure mode flagged in Growth Strategy.

---

# Things We Will NEVER Build

- **A proprietary messaging protocol or our own chat network.** The entire value proposition is meeting people where their contacts already are - building "yet another chat app" would be a category betrayal, not a feature.
- **Any integration that violates a provider's Terms of Service**, including reverse-engineered/unofficial API access (e.g. scraping WhatsApp or iMessage outside sanctioned methods) purely to unlock a channel faster. Account-ban risk to our users is not a cost we will impose on them for our roadmap convenience - this was true in the CTO architecture doc and remains true here.
- **AI auto-reply/autopilot that sends messages as the user without per-message confirmation.** Covered in AI Features - worth repeating here because the pressure to build this ("just let AI handle it") will be real and recurring, and the answer is always no.
- **Ad-supported or data-monetization business model.** Covered in Monetization - a communication trust product cannot also be an ads/data business without contradicting its own pitch.
- **Growth via contact-scraping, invite-spam, or any dark-pattern viral loop.** Covered in Viral Features - the category punishes this uniquely harshly and permanently.
- **A "everything in one app, replace your other apps" positioning.** We are not trying to convince someone to leave Slack or Telegram - we augment, we don't replace. Positioning ourselves as a replacement invites platform hostility (providers actively working against us) and is also just not true to the product.
- **Building every possible integration to maximize channel count for marketing purposes.** Rambox has 100+ services and is a worse product than a focused 4-channel MVP done well - channel count is not a proxy for value, and chasing it dilutes engineering focus away from the automation/priority core that's the actual differentiator.
- **Enterprise-first go-to-market.** We will not chase large enterprise contracts before the individual/team product is proven - it's a different sales motion, different product requirements (SSO/DLP/legal-hold), and pursuing it early starves the core product of the resources that make it good enough to eventually sell to enterprise anyway.
- **A general-purpose "AI agent that manages your life."** Scope creep into calendar-management-as-a-primary-feature, task-management-as-a-primary-feature, or a general assistant is explicitly out of scope forever, not just for MVP - Smart Message Center is a communication operating system, not an everything-app, and every "everything app" in this industry's history has diluted itself into mediocrity chasing that breadth.
- **A cross-tenant or platform-wide IdentityGraph.** Added 2026-07-18 ([ADR-0012](adr/0012-identitygraph-canonical-identity-layer.md)) as IdentityGraph was formalized as a first-class capability. IdentityGraph is strictly workspace-scoped - there will never be a global identity graph correlating the same real person across different customers' workspaces, no matter how valuable that data might look for cross-customer analytics, ad-style targeting, or a future "network effects" pitch. A person who messages two different Smart Message Center customers is two entirely separate, unlinked records. This is a hard privacy/trust boundary, not a technical limitation we'd lift given the chance.
