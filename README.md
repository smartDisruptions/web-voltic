# VOLTIC — Liquid Lightning

A parallax showcase site for a fictional energy drink brand. Every image —
including the 360° can rotation — was generated with AI via [kie.ai](https://kie.ai),
then the site was built around the assets.

## The parallax inventory

- **Layered hero** — glow fields, ghost wordmark, can, and three droplet planes
  moving at different scroll speeds *and* tracking the pointer at different depths.
- **Real-time 3D turn + flip** — the can is live three.js geometry wearing an
  authored label texture (site fonts, exact nutrition values), so every angle
  is correct by construction. Scroll drives a full 360° with an eased reading
  dwell on the back panel; you can also grab the can and spin it. The can
  dissolves and a nutrition-facts card lands as the finale. `?classic=1`
  serves the earlier scrubbed-frames version (generated turntable footage
  pinned to real photos), which is also the automatic no-WebGL fallback.
- **Full-bleed image parallax** — the splash and trio photos drift slower than
  the page inside overflow-hidden frames.
- **Scroll-scrubbed clip reveal** — the macro shot unmasks as it enters.
- **Velocity-reactive marquee** — the ticker speeds up and skews with scroll velocity.
- **Depth-staggered cards** — flavor cards drift apart on scroll and tilt in 3D on hover.
- **Droplet fields** — the generated droplets-on-black plate, screen-blended and
  tiled at three scales, masked away from the subject.

All motion is transform-only, driven by one rAF loop writing a `--plx` CSS
variable, with cached layout reads. **Deliberate policy:** this site exists to
showcase motion, so `prefers-reduced-motion` is intentionally not honored —
the regression suite asserts the animations still run under it.

## Asset pipeline

`tools/gen.mjs` generates everything through kie.ai with a hard credit ceiling:
one hero can (nano-banana-2), a 5s turntable video from that exact image
(kling-2.6 image-to-video) sliced to 60 JPEG frames with ffmpeg, three
photoreal stills referencing the same can, and the droplet plate.
Total spend: **229 credits** (200 budget + a Josh-approved 50 extension spent
learning that no seeding strategy gets a video model to render both a faithful
front and legible back micro-text — which is why the spin section flips to a
typographic facts card instead of ever showing the generated back).

## Dev

```bash
npm install
npm run dev        # vite dev server
npm run build      # static build → dist/
node tools/qa.mjs  # headless screenshots across all sections
```

VOLTIC is not a real product. Imagery is AI-generated.
