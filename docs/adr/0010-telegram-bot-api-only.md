# 0010 - Telegram Integration via Bot API Only, Never MTProto User Sessions

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [ARCHITECTURE.md](../ARCHITECTURE.md) Section 12, [ROADMAP.md](../ROADMAP.md) Phase 5

## Context

Telegram can be integrated two ways: the official Bot API (a bot the user explicitly adds to chats/channels) or the MTProto user API (logging in as the user's actual account, giving full inbox visibility without requiring a bot to be added anywhere). MTProto gives a materially better user experience (silent, full-inbox mirroring, matching what some competitors like early Beeper attempted) but operates outside Telegram's sanctioned integration path and carries real account-ban risk for users.

## Decision

Smart Message Center integrates with Telegram exclusively via the official Bot API. MTProto-based user-session mirroring will not be built, regardless of the UX gap this leaves.

## Consequences

- Users must explicitly add the Smart Message Center bot to the chats/channels they want unified - a real, documented UX limitation compared to full-inbox mirroring.
- Zero ToS-violation risk and zero exposure to the account-ban incidents that have historically damaged trust in "unified inbox" competitors using unofficial bridging methods (PRODUCT.md's competitor analysis flags this as Beeper's specific historical weakness).
- Directly upholds PRODUCT.md's Never Build principle: "any integration that violates a provider's Terms of Service... Account-ban risk to our users is not a cost we will impose on them for our roadmap convenience."
- This decision is revisited only if Telegram's official Bot API materially expands in capability (e.g. broader native inbox access) - never by adopting an unofficial workaround to close the gap.
