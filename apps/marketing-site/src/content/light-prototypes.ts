import {
  hero as siteHero,
  identityGraph as siteIdentityGraph,
  inbox as siteInbox,
} from "./site";

export { brand } from "./site";

// Preview-only fields for the legacy Light and Light V2 pages.
// Keep the live homepage's shared content and the locked Light V3 separate.
export const hero = {
  ...siteHero,
  channels: ["Telegram", "Email", "Slack", "Discord"],
};

const identityPreviews: Record<string, string> = {
  Telegram: "Are we still meeting on Thursday?",
  Email: "Here’s the plan we talked about.",
  Slack: "Thursday works for me.",
};

export const identityGraph = {
  ...siteIdentityGraph,
  identities: siteIdentityGraph.identities.map((identity) => ({
    ...identity,
    preview: identityPreviews[identity.platform] ?? identity.meta,
  })),
  note: "You decide which suggested accounts belong together. Looktra does not automatically approve these matches.",
};

export const inbox = {
  ...siteInbox,
  conversation: {
    name: "Daniel K.",
    platform: "Telegram",
    messages: [
      { sender: "you", text: "Thursday at 6? I can book a table." },
      { sender: "Daniel", text: "Are we still meeting on Thursday?" },
    ],
  },
};
