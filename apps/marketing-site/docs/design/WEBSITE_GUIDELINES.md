# Website design guidelines

Rules that protect the identity of this site. They apply to every future
contributor, human or model. If a change conflicts with a rule here, the rule
wins unless this file is updated first, deliberately, in the same commit.

## 1. Colour means status, nothing else

- `--signal` (aqua `#6FDCC8`) marks what is shipped and running.
- `--ember` (copper `#D98A4B`) marks what is in progress or planned.
- Neither is ever decorative. Status pills, roadmap nodes and the phase counter
  all depend on this rule staying intact.

## 2. Nothing is described as available unless it is deployed

Every capability in `src/content/site.ts` carries a `Status`. When a phase
ships, flip the status there; pills, roadmap and counts update together. Copy
never claims a feature the deployed product does not have.

## 3. Three elements are permanent and drawn in code

The page must be memorable with every screenshot removed. These carry that
weight and must never be replaced by images:

1. **Event flow** (hero): one message stepping through the real pipeline,
   `message.received → identity.resolved → conversation.updated → inbox.push`.
2. **IdentityGraph** (SVG): three platform handles resolving into one person.
3. **Unified inbox thread list**: the left column of the inbox mock, five
   platforms in one queue.

Real screenshots supplement these, they never substitute for them.

## 4. Screenshots go through one component

`src/components/site/ScreenshotFrame` is the only way product images enter the
page. Fixed 16:9, one chrome (border, radius, shadow). Capture at 1600x900 on
the dark theme. Do not invent a second image treatment.

## 5. Effects budget

- No gradients. The only gradient syntax allowed is the hairline background
  grid and its mask, which read as lines, not colour.
- No glassmorphism. The single permitted `backdrop-blur` is the sticky nav
  after scroll.
- Motion is two primitives: the `Reveal` fade and the hero/graph sequences.
  Animate `transform` and `opacity` only. Everything respects
  `prefers-reduced-motion`.
- Content clarity beats every effect. If an effect and readability compete,
  the effect loses.

## 6. Typography and copy

- Instrument Sans (display), IBM Plex Sans (body), IBM Plex Mono (event names,
  IDs, timestamps only). Self-hosted via @fontsource; never load fonts from the
  Google CDN (GDPR, LG München 2022).
- Headlines in sentence case. Buttons in normal case, never uppercase.
- Em dashes are forbidden in copy. Use a period or comma.
- No third-party brand logos pre-launch; platforms appear as neutral monogram
  tiles (`PlatformMark`).

## 7. Performance floor

- Landing page stays under 200 kB first load JS. Current: ~145 kB.
- Static prerender only; nothing on this page needs a server.
- Any addition that pushes past the floor needs a reason written in the PR.
