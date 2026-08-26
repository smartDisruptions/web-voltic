/**
 * VOLTIC — parallax engine.
 *
 * One rAF loop drives everything from two inputs: smoothed scroll position and
 * smoothed pointer position. Every layer declares its motion in HTML:
 *
 *   data-speed        vertical scroll parallax (± = direction, 0.1 = subtle)
 *   data-depth        pointer parallax depth (hero layers)
 *   data-inner-speed  image drifting inside an overflow-hidden frame
 *   data-tilt         3D hover tilt (flavor cards)
 *   .clip-reveal      scroll-scrubbed clip-path unmask
 *   .spin-canvas      pinned 360° frame scrub
 *   .count            count-up stat
 *   .reveal           enter-viewport reveal
 *
 * Layout reads are cached on resize; the loop only writes transforms.
 */

// Deliberate choice (Josh, 2026-08-26): this site IS the animation showcase,
// so prefers-reduced-motion is intentionally not honored — everyone gets the
// full experience.
const motionOK = true;
const vp = { w: innerWidth, h: innerHeight };

// ── scroll + pointer state ───────────────────────────────────────────────
const state = {
  y: scrollY, smoothY: scrollY, vel: 0,
  mx: 0, my: 0, smx: 0, smy: 0,
};
addEventListener('scroll', () => { state.y = scrollY; }, { passive: true });
addEventListener('pointermove', (e) => {
  state.mx = (e.clientX / vp.w) * 2 - 1;
  state.my = (e.clientY / vp.h) * 2 - 1;
}, { passive: true });

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ── cached layout for parallax layers ────────────────────────────────────
let layers = [];      // [data-speed] and/or [data-depth]
let inners = [];      // [data-inner-speed]
let clips = [];       // .clip-reveal

function measure() {
  vp.w = innerWidth; vp.h = innerHeight;

  const offTop = (el) => {
    let t = 0;
    for (let n = el; n; n = n.offsetParent) t += n.offsetTop;
    return t;
  };

  layers = [...document.querySelectorAll('[data-speed], [data-depth]')].map((el) => ({
    el,
    speed: parseFloat(el.dataset.speed || 0),
    depth: parseFloat(el.dataset.depth || 0),
    mid: offTop(el) + el.offsetHeight / 2,
  }));

  inners = [...document.querySelectorAll('[data-inner-speed]')].map((img) => {
    const frame = img.parentElement;
    return {
      img,
      speed: parseFloat(img.dataset.innerSpeed),
      top: offTop(frame),
      h: frame.offsetHeight,
      range: Math.max(0, img.offsetHeight - frame.offsetHeight),
    };
  });

  clips = [...document.querySelectorAll('.clip-reveal')].map((el) => ({
    el, top: offTop(el), h: el.offsetHeight,
  }));

  if (marquee) {
    const band = marquee.parentElement;
    marqueeTop = offTop(band);
    marqueeBottom = marqueeTop + band.offsetHeight;
  }

  measureSpin();
}

// ── 360° spin scrub ──────────────────────────────────────────────────────
const spinSection = document.querySelector('.spin');
const canvas = document.querySelector('.spin-canvas');
const ctx = canvas?.getContext('2d');
const FRAMES = canvas ? parseInt(canvas.dataset.frames, 10) : 0;
const frames = new Array(FRAMES);
const degEl = document.querySelector('.spin-deg-num');
const fillEl = document.querySelector('.spin-track-fill');
const captions = [...document.querySelectorAll('.spin-caption')];
let spinTop = 0, spinRange = 1, spinLoaded = false, lastFrame = -1, lastStep = -1;

// Two acts: a 180° turn — one flawless Veo clip played in reverse, pinned to
// the real front photo at 0° and the real English back panel at 180° — then
// the can holds its back to the camera while the nutrition card lands.
const SPIN_END = 0.55;   // rotation completes here, resting on the back anchor
const FADE_START = 0.66; // …dwells on the readable back panel, then dissolves
const FADE_END = 0.76;   // canvas fully faded here
const CARD_IN = 0.74, CARD_FULL = 0.86;
let ARC_DEG = 180;
const cardEl = document.querySelector('.spin-card');

// ── the real-time three.js can is the default experience ─────────────────
// Full 360° with an eased dwell at 180° so the back panel gets read time.
// ?classic=1 forces the scrubbed-frames version; WebGL failures fall back
// to it automatically.
const USE_3D = !new URLSearchParams(location.search).has('classic');
let can3d = null;
function angle360(pr) {
  // slows to ~25% speed around the back, quicker through the flanks
  return 360 * (pr + 0.115 * Math.sin(2 * Math.PI * pr));
}
async function boot3D() {
  try {
    const { createCan3D } = await import('./can3d.js');
    const host = document.createElement('div');
    host.className = 'spin-3d';
    canvas.parentElement.insertBefore(host, canvas);
    canvas.style.display = 'none';
    can3d = createCan3D(host);
    ARC_DEG = 360;
    document.querySelector('.spin-ghost').textContent = '360°';
    addEventListener('resize', () => can3d.resize());
    lastFrame = -2; // force a state push
  } catch (e) {
    console.warn('3D can unavailable, keeping frames:', e);
    loadFrames();
  }
}

function measureSpin() {
  if (!spinSection) return;
  spinTop = spinSection.offsetTop;
  spinRange = spinSection.offsetHeight - vp.h;
}

function loadFrames() {
  if (spinLoaded || !FRAMES) return;
  spinLoaded = true;
  // coarse pass first (every 4th frame) so scrubbing works almost immediately;
  // the fill pass trickles in at idle so it never blocks the main thread
  const load = (i) => {
    const img = new Image();
    img.src = `/frames/f${String(i + 1).padStart(2, '0')}.webp`;
    img.onload = () => {
      if (i === 0) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        drawFrame(0, true);
      }
    };
    frames[i] = img;
  };
  for (let i = 0; i < FRAMES; i += 4) load(i);
  const fill = [];
  for (let i = 0; i < FRAMES; i++) if (i % 4) fill.push(i);
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const trickle = () => {
    fill.splice(0, 3).forEach(load);
    if (fill.length) idle(trickle, { timeout: 400 });
  };
  idle(trickle, { timeout: 800 });
}

function nearestLoaded(n) {
  for (let d = 0; d < FRAMES; d++) {
    if (frames[n - d]?.complete && frames[n - d].naturalWidth) return frames[n - d];
    if (frames[n + d]?.complete && frames[n + d].naturalWidth) return frames[n + d];
  }
  return null;
}

function drawFrame(n, force = false) {
  if (!ctx || (!force && n === lastFrame)) return;
  const img = nearestLoaded(n);
  if (!img) return;
  lastFrame = n;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

let lastDeg = '', lastFill = -1, lastCanA = -1, lastCardE = -1;

function updateSpin() {
  if (!spinSection) return;
  const p = clamp01((state.smoothY - spinTop) / spinRange);
  const pr = clamp01(p / SPIN_END);
  if (can3d) {
    can3d.setAngle(angle360(pr));
    can3d.render();
  } else {
    drawFrame(Math.round(pr * (FRAMES - 1)));
  }

  // act 1 → act 2: can (and its degree readout) dissolve while still turning
  const canA = Math.round((p <= FADE_START ? 1
    : clamp01(1 - (p - FADE_START) / (FADE_END - FADE_START))) * 100) / 100;
  if (canA !== lastCanA) {
    lastCanA = canA;
    (can3d ? canvas.previousElementSibling : canvas).style.opacity = canA;
    if (degEl) degEl.parentElement.style.opacity = canA;
  }
  if (degEl) {
    const deg = String(Math.round(can3d ? angle360(pr) : pr * ARC_DEG)).padStart(3, '0');
    if (deg !== lastDeg) { lastDeg = deg; degEl.textContent = deg; }
  }
  if (fillEl) {
    const fill = Math.round(p * 200) / 2;
    if (fill !== lastFill) { lastFill = fill; fillEl.style.width = `${fill}%`; }
  }

  if (cardEl) {
    const a = clamp01((p - CARD_IN) / (CARD_FULL - CARD_IN));
    const e = Math.round((1 - Math.pow(1 - a, 3)) * 200) / 200;
    if (e !== lastCardE) {
      lastCardE = e;
      cardEl.style.opacity = e;
      cardEl.style.transform =
        `translate(-50%, -50%) translateY(${((1 - e) * 48).toFixed(1)}px) scale(${(0.94 + e * 0.06).toFixed(3)})`;
      cardEl.style.pointerEvents = e > 0.5 ? 'auto' : 'none';
    }
  }

  const step = p < 0.31 ? 0 : p < SPIN_END ? 1 : -1;
  if (step !== lastStep) {
    lastStep = step;
    captions.forEach((c, i) => c.classList.toggle('is-live', i === step));
  }
}

// start pulling the spin's assets when the section is approaching — but
// never before the page itself has finished loading
if (spinSection) {
  const start = () => (USE_3D ? boot3D() : loadFrames());
  const arm = () => new IntersectionObserver((entries, io) => {
    if (entries.some((e) => e.isIntersecting)) { start(); io.disconnect(); }
  }, { rootMargin: USE_3D ? '160% 0%' : '80% 0%' }).observe(spinSection);
  if (document.readyState === 'complete') arm();
  else addEventListener('load', arm, { once: true });
}

// ── marquee ──────────────────────────────────────────────────────────────
const marquee = document.querySelector('.marquee-track');
let marqueeX = 0, marqueeW = 0, marqueeTop = 0, marqueeBottom = 0;

// ── hover tilt ───────────────────────────────────────────────────────────
for (const card of document.querySelectorAll('[data-tilt]')) {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty('--tiltT', `perspective(700px) rotateY(${x * 10}deg) rotateX(${y * -10}deg) translateZ(6px)`);
  });
  card.addEventListener('pointerleave', () => card.style.removeProperty('--tiltT'));
}

// ── the loop ─────────────────────────────────────────────────────────────
// When scroll and pointer have settled, no styles are written at all — the
// loop idles at a couple of comparisons per frame instead of restyling ~20
// elements forever. One extra pass runs after settling so values land exact.
let wasActive = true;

function writeParallax() {
  const center = state.smoothY + vp.h / 2;

  for (const l of layers) {
    const sy = l.speed ? (center - l.mid) * l.speed : 0;
    const px = l.depth ? state.smx * l.depth * -220 : 0;
    const py = l.depth ? state.smy * l.depth * -140 : 0;
    // written as a variable so each layer's static scale/rotate/tilt composes
    l.el.style.setProperty('--plx', `translate3d(${px.toFixed(2)}px, ${(sy + py).toFixed(2)}px, 0)`);
  }

  for (const it of inners) {
    const p = clamp01((state.smoothY + vp.h - it.top) / (vp.h + it.h));
    it.img.style.transform = `translate3d(0, ${(-it.range * p).toFixed(2)}px, 0)`;
  }

  for (const c of clips) {
    const p = clamp01(((state.smoothY + vp.h - c.top) / (vp.h * 0.7)));
    c.el.style.setProperty('--clip', ((1 - p) * 100).toFixed(2));
  }

  updateSpin();
}

function tick() {
  const prev = state.smoothY;
  state.smoothY = lerp(state.smoothY, state.y, 0.18);
  if (Math.abs(state.y - state.smoothY) < 0.05) state.smoothY = state.y;
  state.vel = state.smoothY - prev;
  state.smx = lerp(state.smx, state.mx, 0.06);
  state.smy = lerp(state.smy, state.my, 0.06);
  if (Math.abs(state.mx - state.smx) < 0.0005) state.smx = state.mx;
  if (Math.abs(state.my - state.smy) < 0.0005) state.smy = state.my;

  const active = state.smoothY !== state.y || state.vel !== 0 ||
    state.smx !== state.mx || state.smy !== state.my ||
    (can3d ? can3d.isDragging() : false);

  if (active || wasActive) writeParallax();
  wasActive = active;

  // the marquee self-animates, but only while its band is on screen
  if (marquee && state.smoothY + vp.h > marqueeTop && state.smoothY < marqueeBottom) {
    if (!marqueeW) marqueeW = marquee.scrollWidth / 2;
    marqueeX = (marqueeX - (0.8 + Math.min(14, Math.abs(state.vel) * 0.6))) % marqueeW;
    const skew = Math.max(-8, Math.min(8, state.vel * 0.35));
    marquee.style.transform = `translate3d(${marqueeX.toFixed(2)}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
  }

  requestAnimationFrame(tick);
}

// ── reveals + counters ───────────────────────────────────────────────────
const reveals = [...document.querySelectorAll('.reveal')];
reveals.forEach((el) => {
  const siblings = [...el.parentElement.querySelectorAll(':scope > .reveal')];
  el.style.setProperty('--stagger', `${siblings.indexOf(el) * 0.09}s`);
});

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('is-in');
    io.unobserve(e.target);
  }
}, { threshold: 0.15 });
reveals.forEach((el) => io.observe(el));

function runCounter(el) {
  const target = parseInt(el.dataset.count, 10);
  const t0 = performance.now();
  const dur = 1400;
  const step = (t) => {
    const p = clamp01((t - t0) / dur);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const counters = [...document.querySelectorAll('.count')];
const cio = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    runCounter(e.target);
    cio.unobserve(e.target);
  }
}, { threshold: 0.6 });

// ── boot ─────────────────────────────────────────────────────────────────
if (motionOK) {
  counters.forEach((el) => cio.observe(el));
  measure();
  addEventListener('resize', () => requestAnimationFrame(measure));
  addEventListener('load', measure);
  requestAnimationFrame(tick);
} else {
  // static experience: final values, first frame, no loop
  counters.forEach((el) => { el.textContent = el.dataset.count; });
  loadFrames();
}
