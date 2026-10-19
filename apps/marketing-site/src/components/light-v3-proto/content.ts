/**
 * Local-only content for the two fields light-v3 needs that the committed
 * @/content/site doesn't have yet (inbox.conversation,
 * identityGraph.identities[].preview) - that file is shared with the live
 * homepage, which is mid-rebrand and not touched by this prototype. Values
 * mirror the working-tree site.ts exactly.
 */
export const conversation = {
  name: "Daniel K.",
  platform: "Telegram",
  messages: [
    { sender: "you", text: "Thursday at 6? I can book a table." },
    { sender: "Daniel", text: "Are we still meeting on Thursday?" },
  ],
};

export const identityPreviews = [
  "Are we still meeting on Thursday?",
  "Here’s the plan we talked about.",
  "Thursday works for me.",
];
