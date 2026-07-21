/**
 * Single source of truth for brand naming and page copy.
 * Renaming the product = editing `brand` below. Nothing else hardcodes the name.
 */
export const brand = {
  name: "Smart Message Center",
  short: "SMC",
  domain: "smartmessagecenter.com",
  tagline: "The operating system for digital communication.",
  vision:
    "One inbox. Every platform. One identity. Automate everything.",
} as const;

export type Status = "live" | "building" | "planned";

export const nav = [
  { label: "Product", href: "#unified-inbox" },
  { label: "IdentityGraph", href: "#identity-graph" },
  { label: "Architecture", href: "#architecture" },
  { label: "Roadmap", href: "#roadmap" },
  { label: "FAQ", href: "#faq" },
] as const;

export const hero = {
  eyebrow: "Early access",
  headline: "One inbox for every platform your customers talk on.",
  lede: `${brand.name} pulls conversations from separate messaging platforms into a single workspace, works out which messages belong to the same person, and keeps every thread in sync in real time.`,
  primaryCta: { label: "Request early access", href: "#cta" },
  secondaryCta: { label: "See the architecture", href: "#architecture" },
  statusNote:
    "Live today: workspaces, unified inbox, identity resolution and realtime delivery, running against a mock connector. Platform connectors are in development.",
  stream: [
    { t: "14:02:11.204", source: "connector.mock", event: "message.received", detail: "channel=mock" },
    { t: "14:02:11.208", source: "identity-graph", event: "identity.resolved", detail: "person_8f2a1c" },
    { t: "14:02:11.213", source: "messaging", event: "conversation.updated", detail: "thread_4471" },
    { t: "14:02:11.219", source: "gateway", event: "inbox.push", detail: "ws://workspace/42" },
  ],
};

export const problem = {
  eyebrow: "The problem",
  title: "Your customers are one person. Your tools disagree.",
  lede: "A growing team ends up watching five or six places at once. Nothing is wrong with any single tool. The damage comes from the gaps between them.",
  points: [
    {
      title: "Context is split across tabs",
      body: "The same customer asks a question on one platform, follows up on another, and nobody sees the full story. Answers get repeated, or contradicted.",
    },
    {
      title: "Nobody knows who is handling it",
      body: "Without one queue there is no reliable sense of what is open, what is answered and what has been sitting untouched since yesterday.",
    },
    {
      title: "Identity resets on every platform",
      body: "One person can be a phone number, a username and an email address. Treating them as three people means three histories and three chances to get it wrong.",
    },
    {
      title: "Automation stops at the tool boundary",
      body: "Rules built inside a single platform cannot see anything that happened outside it, so the useful automation is exactly the automation you cannot build.",
    },
  ],
};

export const solution = {
  eyebrow: "The approach",
  title: "One workspace, built on an event pipeline instead of a mailbox.",
  lede: "Every incoming message enters the same pipeline no matter where it came from. What changes per platform is only the connector at the edge.",
  pillars: [
    {
      title: "Normalise at the edge",
      body: "Connectors translate each platform into one internal message shape. The rest of the system never learns platform-specific rules.",
      status: "live" as Status,
      note: "Running with the mock connector",
    },
    {
      title: "Resolve who is talking",
      body: "IdentityGraph links platform handles to one person record, so history follows the human rather than the channel.",
      status: "live" as Status,
    },
    {
      title: "Deliver without refresh",
      body: "Messages persist, then push over WebSocket to open clients. The inbox updates as events land, not on a polling interval.",
      status: "live" as Status,
    },
  ],
};

export const identityGraph = {
  eyebrow: "IdentityGraph",
  title: "Three handles. One person. One history.",
  lede: "Identity resolution is the part most tools skip, and it is the reason unified inboxes usually feel like a folder rather than a workspace. IdentityGraph keeps a person record and attaches every platform handle to it as evidence arrives.",
  identities: [
    { platform: "Telegram", handle: "@arda.k", meta: "user id 5514829" },
    { platform: "Email", handle: "arda@northwind.io", meta: "verified sender" },
    { platform: "Slack", handle: "U04BQ7TXR", meta: "shared channel" },
  ],
  person: { name: "Arda K.", id: "person_8f2a1c", org: "Northwind" },
  benefits: [
    "One conversation history instead of one per platform.",
    "Merges are recorded, so a wrong link can be traced and undone.",
    "New platforms attach to the person that already exists.",
  ],
};

export const inbox = {
  eyebrow: "Unified inbox",
  title: "Every platform lands in the same queue.",
  lede: "Threads carry their origin so context is never lost, but triage happens in one place with one set of habits.",
  threads: [
    { platform: "Telegram", name: "Arda K.", preview: "Any update on the invoice from Tuesday?", time: "2m", unread: true },
    { platform: "Email", name: "Northwind Ops", preview: "Re: onboarding checklist for the new workspace", time: "18m", unread: true },
    { platform: "Slack", name: "Mira Devlin", preview: "Shared channel is live on our side, go ahead.", time: "1h", unread: false },
    { platform: "Discord", name: "community", preview: "Rate limit question from a self hosted setup", time: "3h", unread: false },
    { platform: "Telegram", name: "Ege Y.", preview: "Thanks, that fixed it.", time: "Yesterday", unread: false },
  ],
  note: "Screenshot placeholder. Replace with a real capture before launch.",
};

export const automation = {
  eyebrow: "Automation",
  title: "Rules that can see every platform at once.",
  lede: "The automation engine exists in the architecture and runs on the same event stream as the inbox. The visual builder is next, so the flow below is a design preview rather than a shipped screen.",
  status: "building" as Status,
  flow: [
    { label: "Message received", kind: "trigger", detail: "any connector" },
    { label: "Identity resolved", kind: "condition", detail: "known person" },
    { label: "Assign to Support", kind: "action", detail: "round robin" },
    { label: "Notify workspace", kind: "action", detail: "realtime" },
  ],
};

export const architecture = {
  eyebrow: "Architecture",
  title: "Event-driven, queue-backed, one path for every message.",
  lede: "The same four stages run for every message regardless of origin. Adding a platform means writing a connector, not touching the core.",
  stack: [
    { name: "Next.js", role: "Web client" },
    { name: "NestJS", role: "API and gateway" },
    { name: "PostgreSQL", role: "Persistence" },
    { name: "Prisma", role: "Data access" },
    { name: "Redis", role: "Cache and queue backend" },
    { name: "BullMQ", role: "Job processing" },
    { name: "WebSocket", role: "Realtime delivery" },
    { name: "Connector SDK", role: "Platform integration" },
  ],
};

export const security = {
  eyebrow: "Security",
  title: "Isolation first, because an inbox holds everything.",
  lede: "Communication data is among the most sensitive a company holds. The model is boring on purpose.",
  items: [
    {
      title: "Workspace isolation",
      body: "Every record is scoped to a workspace and access is checked at the query boundary, not only in the interface.",
      status: "live" as Status,
    },
    {
      title: "Secure authentication",
      body: "Session and token handling with hashed credentials, short-lived access tokens and explicit refresh.",
      status: "live" as Status,
    },
    {
      title: "Audit logs",
      body: "Security relevant actions are recorded so a workspace owner can answer who did what and when.",
      status: "building" as Status,
    },
    {
      title: "Passkeys",
      body: "Passwordless sign in with WebAuthn, planned once the connector work settles.",
      status: "planned" as Status,
    },
  ],
};

export const roadmap = {
  eyebrow: "Roadmap",
  title: "What is done, what is being built, what comes after.",
  lede: "Published as it stands. Nothing on this page is marked complete unless you can use it today.",
  phases: [
    { n: 1, title: "Infrastructure", body: "Monorepo, database, queue, deployment pipeline and local development setup.", status: "live" as Status },
    { n: 2, title: "Authentication", body: "Registration, sign in, sessions, workspace creation and membership.", status: "live" as Status },
    { n: 3, title: "Identity and messaging foundation", body: "Mock connector ingestion, message persistence, IdentityGraph resolution, conversation building, realtime inbox and notifications.", status: "live" as Status },
    { n: 4, title: "Connector SDK", body: "A documented contract for building platform connectors, with the mock connector as the reference implementation.", status: "building" as Status },
    { n: 5, title: "Platform connectors", body: "Telegram first, then Slack, Email and Discord.", status: "planned" as Status },
    { n: 6, title: "Automation builder", body: "Visual rules on top of the existing automation engine.", status: "planned" as Status },
    { n: 7, title: "AI assistance", body: "Summaries, drafts and routing suggestions, scoped per workspace.", status: "planned" as Status },
    { n: 8, title: "Marketplace", body: "Third party connectors published against the SDK.", status: "planned" as Status },
  ],
};

export const faq = {
  eyebrow: "FAQ",
  title: "Technical questions, answered plainly.",
  items: [
    {
      q: "Which platforms can I connect right now?",
      a: "None publicly. Ingestion runs today through a mock connector that exercises the full pipeline: receive, persist, resolve identity, build the conversation and push to the inbox. Telegram is the first real connector and follows the Connector SDK in phase 4.",
    },
    {
      q: "How does IdentityGraph decide two handles are the same person?",
      a: "It links on verified signals such as a matching verified email, a platform account already attached to a workspace contact, or an explicit merge by a workspace member. Every link is stored with its source, so a wrong merge can be traced and reversed rather than silently baked into history.",
    },
    {
      q: "Is this a chat app or a replacement for Slack?",
      a: "Neither. Your team keeps its internal chat. This is the layer where external conversations from many platforms arrive, get attached to a person and get worked as one queue.",
    },
    {
      q: "What does the event-driven part actually buy me?",
      a: "Each stage reacts to events rather than calling the next one directly. Ingestion does not block on identity resolution, retries are handled by the queue, and adding a consumer such as automation or search does not require changing the code that produced the event.",
    },
    {
      q: "How do I write a connector?",
      a: "The Connector SDK is being extracted from the mock connector now. The contract is small on purpose: authenticate, subscribe to platform events, translate them into the internal message shape and hand them to the ingestion queue. Normalisation rules stay in the connector so the core never learns platform quirks.",
    },
    {
      q: "Where is my data stored, and can I self host?",
      a: "Messages are persisted in PostgreSQL scoped by workspace, with Redis used for queues and ephemeral state. Self hosting is not supported yet. The stack is containerised, so it is a documentation and licensing question rather than an architectural one.",
    },
    {
      q: "Does AI read my messages?",
      a: "Not today. No AI features are shipped. When they arrive they will be opt in per workspace, and the setting will say exactly what leaves your infrastructure.",
    },
  ],
};

export const cta = {
  eyebrow: "Early access",
  title: "Get a workspace while the connectors are being built.",
  lede: "Early access is limited on purpose. The people who join now shape which platform lands after Telegram and what the Connector SDK has to support.",
  primary: { label: "Request early access", href: "mailto:hello@" + brand.domain + "?subject=Early%20access" },
  secondary: { label: "Read the roadmap", href: "#roadmap" },
  fineprint: "No card. No launch date promised. You will hear from a person, not a sequence.",
};

export const partners = {
  eyebrow: "Design partners",
  title: "Building alongside teams that live in five inboxes.",
  note: "Placeholder marks. Replace with design partner logos before launch.",
  slots: ["Northwind", "Aperture", "Kestrel", "Halden", "Vireo"],
};

export const statusLabel: Record<Status, string> = {
  live: "Live",
  building: "In progress",
  planned: "Coming soon",
};
