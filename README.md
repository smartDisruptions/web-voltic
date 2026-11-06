# VOLTIC — Liquid Lightning

A motion showcase for a fictional energy drink. **v2 (2026-11-06)** rebuilds the
site around one idea: there is exactly one can, it's live geometry, and it
travels the whole page.

## v2: one can, the whole page

The can renders once, into a fixed full-screen WebGL stage behind the content.
Every section declares where the can should stand, and it moves between those marks
as you scroll:

| Scene | What the can does |
|---|---|
| **Hero** | Materializes with a lightning strike, sways, follows the pointer. Ambient bolts hit the lid. |
| **Spin** | Pinned 360° with a reading dwell on the real nutrition panel; drag to spin. Then it steps aside for the facts card. |
| **Charge** | An opaque "curtain" section (generated splash photo + counters) slides over the stage. The can isn't drawn while covered. |
| **Circuit** | Docks at the edge, half off-screen, turning toward an ingredient list that powers on as current runs down a wire. |
| **Flavors** | Pinned. Scroll, tap a chip, or swipe the can: the label swaps (Original → Citrus Overload → Storm Berry), the rim lights retint, and the **whole site's accent colors** follow (animated `@property` colors). |
| **The shoot** | Curtain again: vertical scroll drives a horizontal reel of the generated photography, ending on *"the scenery is generated, the can is modeled."* |
| **Crack** | The can tilts toward you, the tab lifts on its rivet, fizz sprays out of the mouth. Tap the can for more. |

Also: a scroll "battery" in the nav, a velocity-reactive marquee that passes in
front of the can, a ghost word behind it that changes per scene, haptics on phones
that support them, and curtains with feathered edges that dissolve into the stage.

**Flavors are a text edit.** `tools/label.html?f=original|citrus|storm` is the
authored label; `node tools/make-label.mjs` renders all three label + glow textures.
That's the build's thesis: anything that must be the same object twice gets
modeled, not prompted.

### Smooth on phones

- Renders **on demand**: if nothing moved, nothing is drawn. Measured idle cost
  with the can docked is ~2 ms of script per second, with zero style work.
- Adaptive resolution: long frames drop the pixel ratio a notch (2× → 1×).
- Every moving DOM layer is transform/opacity only; the loop writes a style only when
  its value changed. Layout is measured on real resizes only (iOS toolbar resizes are
  ignored). Placements are computed against `svh`/`lvh`, so the can doesn't jump
  when the toolbar slides.
- **No GPU (software WebGL)**: the studio photo stands in, and the live can boots
  on the first scroll or tap, then renders on demand without the idle sway. Real
  phones have GPUs and get the full show. `?full` forces it; `?flat` forces the photo.
- Lighthouse mobile (local, simulated throttling): **99 / 100 / 100 / 100**,
  TBT 0 ms, CLS 0.005.

**Deliberate policy (unchanged from v1):** this site exists to showcase motion, so
`prefers-reduced-motion` is intentionally not honored, and the regression suite
asserts the show still runs under it. Everything else stays accessible: keyboard,
contrast (axe-clean), landmarks, live regions, skip link.

## v1

The first version (parallax showcase, scrubbed can, renderer bake-off) is preserved
at [`/v1/`](https://web-voltic.vercel.app/v1/), and `/v1/?classic=1` serves its
original generated-frames spin. The side-by-side renderer comparison is still at
[`/compare.html`](https://web-voltic.vercel.app/compare.html).

| Approach | Verdict (2026-08-26) |
|---|---|
| Generative video (kie.ai) | Retired. No seeding strategy kept a product consistent *and* rendered legible micro-text. 577 credits spent learning it. |
| **three.js, live** | **Ships.** Continuous rotation, drag-to-spin, label edits are text edits. v2 builds the whole site on it. |
| Blender Cycles bake | Prettier light, but 2 MB of frames and 6° stepping. Scene kept at `tools/blender-can.py` for stills/print. |

## Dev

```bash
npm install
npm run dev                       # vite dev server
npm run build                     # static build → dist/ (CSS + JS inlined)
node tools/make-label.mjs         # re-render the three flavor labels
node tools/regression.mjs <url>   # axe, errors, 404s, keyboard, viewports, scene assertions
node tools/qa.mjs <url> <outdir>  # screenshots of every scene
```

Tools find Chromium via `tools/browser.mjs` (Mac playwright cache, `/opt/pw-browsers`,
or `CHROME_PATH`).

VOLTIC is not a real product. The photography is AI-generated; the can is not.
