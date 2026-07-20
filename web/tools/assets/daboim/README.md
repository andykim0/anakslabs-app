# Daboim HyperFrames dogfood assets

Offline-rendered source assets only. Nothing in this directory is imported or served by the Next.js application.

- Brand and tagline: the Daboim marketing home metadata.
- Industry: the marketing home `Service` JSON-LD service type.
- Contact: `hello@anakslabs.com`, from the marketing contact source of truth.
- Address and telephone: explicitly marked unpublished because neither value exists in the repository or an official public source. No placeholder number or inferred address is used.

Each `.input.json` is the exact render input. Each `.report.json` is produced by `scripts/render-motion-clip.ts` and contains elapsed time, byte size, frame digest, resolution, codec, frame/keyframe counts, and audio-stream count.
