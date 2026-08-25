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

const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
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

// The scrub has two acts: the can turns 0→150° (stopping before the video's
// unusable back panel would face the camera), then fades down and the
// nutrition card takes the stage. All thresholds are section progress 0–1.
const SPIN_END = 0.55;   // rotation completes here
const FADE_START = 0.5;  // can starts dissolving while still turning
const FADE_END = 0.64;   // canvas fully faded here
const CARD_IN = 0.62, CARD_FULL = 0.78;
const ARC_DEG = 135;
const cardEl = document.querySelector('.spin-card');

function measureSpin() {
  if (!spinSection) return;
  spinTop = spinSection.offsetTop;
  spinRange = spinSection.offsetHeight - vp.h;
}

function loadFrames() {
  if (spinLoaded || !FRAMES) return;
  spinLoaded = true;
  // coarse pass first (every 4th frame) so scrubbing works almost immediately,
  // then the fill pass sharpens it
  const order = [];
  for (let i = 0; i < FRAMES; i += 4) order.push(i);
  for (let i = 0; i < FRAMES; i++) if (i % 4) order.push(i);
  for (const i of order) {
    const img = new Image();
    img.src = `/frames/f${String(i + 1).padStart(2, '0')}.jpg`;
    img.decode?.().catch(() => {});
    img.onload = () => {
      if (i === 0) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        drawFrame(0, true);
      }
    };
    frames[i] = img;
  }
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

function updateSpin() {
  if (!spinSection) return;
  const p = clamp01((state.smoothY - spinTop) / spinRange);
  const pr = clamp01(p / SPIN_END);
  drawFrame(Math.round(pr * (FRAMES - 1)));

  // act 1 → act 2: can (and its degree readout) dissolve while still turning
  const canA = p <= FADE_START ? 1 : clamp01(1 - (p - FADE_START) / (FADE_END - FADE_START));
  canvas.style.opacity = canA;
  if (degEl) {
    degEl.textContent = String(Math.round(pr * ARC_DEG)).padStart(3, '0');
    degEl.parentElement.style.opacity = canA;
  }
  if (fillEl) fillEl.style.width = `${p * 100}%`;

  if (cardEl) {
    const a = clamp01((p - CARD_IN) / (CARD_FULL - CARD_IN));
    const e = 1 - Math.pow(1 - a, 3);
    cardEl.style.opacity = e;
    cardEl.style.transform =
      `translate(-50%, -50%) translateY(${(1 - e) * 48}px) scale(${0.94 + e * 0.06})`;
    cardEl.style.pointerEvents = a > 0.5 ? 'auto' : 'none';
  }

  const step = p < 0.28 ? 0 : p < SPIN_END ? 1 : -1;
  if (step !== lastStep) {
    lastStep = step;
    captions.forEach((c, i) => c.classList.toggle('is-live', i === step));
  }
}

// start pulling frames when the spin section is two screens away
if (spinSection) {
  new IntersectionObserver((entries, io) => {
    if (entries.some((e) => e.isIntersecting)) { loadFrames(); io.disconnect(); }
  }, { rootMargin: '200% 0%' }).observe(spinSection);
}

// ── marquee ──────────────────────────────────────────────────────────────
const marquee = document.querySelector('.marquee-track');
let marqueeX = 0, marqueeW = 0;

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
function tick() {
  const prev = state.smoothY;
  state.smoothY = lerp(state.smoothY, state.y, 0.18);
  state.vel = state.smoothY - prev;
  state.smx = lerp(state.smx, state.mx, 0.06);
  state.smy = lerp(state.smy, state.my, 0.06);

  const center = state.smoothY + vp.h / 2;

  for (const l of layers) {
    const sy = l.speed ? (center - l.mid) * l.speed : 0;
    const px = l.depth ? state.smx * l.depth * -220 : 0;
    const py = l.depth ? state.smy * l.depth * -140 : 0;
    // written as a variable so each layer's static scale/rotate/tilt composes
    l.el.style.setProperty('--plx', `translate3d(${px}px, ${sy + py}px, 0)`);
  }

  for (const it of inners) {
    const p = clamp01((state.smoothY + vp.h - it.top) / (vp.h + it.h));
    it.img.style.transform = `translate3d(0, ${-it.range * p}px, 0)`;
  }

  for (const c of clips) {
    const p = clamp01(((state.smoothY + vp.h - c.top) / (vp.h * 0.7)));
    c.el.style.setProperty('--clip', String((1 - p) * 100));
  }

  if (marquee) {
    if (!marqueeW) marqueeW = marquee.scrollWidth / 2;
    marqueeX = (marqueeX - (0.8 + Math.min(14, Math.abs(state.vel) * 0.6))) % marqueeW;
    const skew = Math.max(-8, Math.min(8, state.vel * 0.35));
    marquee.style.transform = `translate3d(${marqueeX}px, 0, 0) skewX(${skew}deg)`;
  }

  updateSpin();
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
