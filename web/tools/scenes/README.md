# Offline motion scene library

These scenes are rendered by `scripts/render-motion-clip.ts`; they are not imported by the Next.js application.
Parameterized scenes become a single self-contained HTML document with the required Noto Sans KR unicode chunks embedded as WOFF2 data URIs.

## `typography-hero`

- Canvas: 1920×1080, 6 seconds, 30 fps
- Required input: `businessName`, `tagline`, `font`, `palette`
- `font`: currently the pinned value `noto-sans-kr`
- `palette`: five `#RRGGBB` values — `background`, `surface`, `primary`, `accent`, `text`

## `open-clip`

- Canvas: 1080×1920, 12 seconds, 30 fps
- Required input: `businessName`, `industry`, `address`, `phone`, `font`, `palette`
- Business fields are escaped and rendered verbatim. Missing, padded, inferred, or unknown fields fail validation.

## Render

```sh
npm run motion:render -- \
  --scene typography-hero \
  --variables-file /absolute/path/to/variables.json \
  --output /private/tmp/typography-hero.mp4
```

Remote URLs and browser network APIs are rejected before rendering. Output is normalized and verified as muted H.264, yuv420p, GOP 1.
