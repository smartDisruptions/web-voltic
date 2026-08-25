# VOLTIC — Liquid Lightning

A parallax showcase site for a fictional energy drink brand. Every image —
including the 360° can rotation — was generated with AI via [kie.ai](https://kie.ai),
then the site was built around the assets.

## The parallax inventory

- **Layered hero** — glow fields, ghost wordmark, can, and three droplet planes
  moving at different scroll speeds *and* tracking the pointer at different depths.
- **Scroll-scrubbed 360°** — a pinned section that maps scroll progress onto 60
  frames extracted from a generated turntable video (Apple-product-page style),
  with a live degree readout and step captions.
- **Full-bleed image parallax** — the splash and trio photos drift slower than
  the page inside overflow-hidden frames.
- **Scroll-scrubbed clip reveal** — the macro shot unmasks as it enters.
- **Velocity-reactive marquee** — the ticker speeds up and skews with scroll velocity.
- **Depth-staggered cards** — flavor cards drift apart on scroll and tilt in 3D on hover.
- **Droplet fields** — the generated droplets-on-black plate, screen-blended and
  tiled at three scales, masked away from the subject.

All motion is transform-only, driven by one rAF loop writing a `--plx` CSS
variable, with cached layout reads. `prefers-reduced-motion` gets a fully
static page.

## Asset pipeline

`tools/gen.mjs` generates everything through kie.ai with a hard credit ceiling:
one hero can (nano-banana-2), a 5s turntable video from that exact image
(kling-2.6 image-to-video) sliced to 60 JPEG frames with ffmpeg, three
photoreal stills referencing the same can, and the droplet plate.
Total spend: **229 credits** (200 budget + a Josh-approved 50 extension for the
English back panel: video models can't render legible micro-text, so the back's
nutrition facts come from a nano-banana still that the 360° scrub dips to across
the readable arc).

## Dev

```bash
npm install
npm run dev        # vite dev server
npm run build      # static build → dist/
node tools/qa.mjs  # headless screenshots across all sections
```

VOLTIC is not a real product. Imagery is AI-generated.
