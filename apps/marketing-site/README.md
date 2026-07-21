# Smart Message Center, marketing site

Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui primitives, Framer Motion, Lucide.
Fonts self-hosted via @fontsource.

## Run

```bash
npm install
npm run dev
```

## Renaming the product

The brand name appears in exactly one place: `brand` in `src/content/site.ts`.
Change `name`, `short`, `domain`, `tagline` and every heading, meta tag and footer follows.

## Where things live

```
src/content/site.ts           every string on the page, including status flags
src/app/globals.css           design tokens (colour, fonts, spine, grid)
tailwind.config.ts            Tailwind surface for the same tokens
src/components/ui/            shadcn style primitives (button, accordion, card, status pill)
src/components/site/          nav, footer, section shell, reveal, screenshot frame, platform mark
src/components/sections/      one file per page section
docs/design/WEBSITE_GUIDELINES.md   design rules, read before changing anything visual
```

## Design rules

All binding design decisions (colour semantics, permanent code-drawn elements,
screenshot handling, effects budget, typography, performance floor) live in
[`docs/design/WEBSITE_GUIDELINES.md`](docs/design/WEBSITE_GUIDELINES.md).
Read it before touching anything visual.

## Placeholders to replace before launch

- `src/components/sections/partners.tsx`, design partner logos.
- Inbox `ScreenshotFrame` in `src/components/sections/unified-inbox.tsx`, pass `src` when the real capture exists.
- `/privacy` and `/terms` routes, linked from the footer but not yet created.
- `hello@` address in `brand.domain`.

## Accessibility and motion

Motion is one primitive (`Reveal`) plus the hero pipeline sequence. Both check
`prefers-reduced-motion` and fall back to static output. Focus rings are visible
site wide, the SVG diagrams carry text alternatives, and a skip link is the first
focusable element.
