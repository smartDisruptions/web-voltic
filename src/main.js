/**
 * VOLTIC v2 — choreography.
 *
 * One rAF loop reads two inputs (scroll, pointer) and decides where the one
 * live can should be: every section declares a placement, and the can travels
 * between them. Opaque "curtain" sections slide over the stage; while one
 * covers the screen the can isn't drawn at all and quietly moves to its next
 * mark. Layout is measured on resize only; the loop writes transforms.
 *
 * Deliberate choice (Josh, 2026-08-26): this site IS the motion showcase, so
 * prefers-reduced-motion is intentionally not honored. Everything else stays
 * accessible: keyboard, contrast, landmarks, live regions, skip link.
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const isTouch = matchMedia('(pointer: coarse)').matches;

const FLAVOR_ORDER = ['original', 'citrus', 'storm'];
const FLAVOR_UI = {
  original: { a1: '#2fd8f5', name: 'VOLT<br> <em>ORIGINAL</em>', ghost: 'VOLT',
    desc: 'The matte black standard. Citrus edge, metallic finish, no apologies.', hue: 0 },
  citrus: { a1: '#e9ff52', name: 'CITRUS<br> <em>OVERLOAD</em>', ghost: 'CITRUS',
    desc: 'Lime pushed past the legal limit. Bright enough to read by.', hue: -120 },
  storm: { a1: '#c46bff', name: 'STORM<br> <em>BERRY</em>', ghost: 'STORM',
    desc: 'Dark fruit under a live current. For the last set and the long night.', hue: 95 },
};

// ── where the can stands in each scene ───────────────────────────────────
// x: -1..1 across the screen · cy: center as a fraction of the visible
// window's height · hv: can height as a fraction of it · rz/rx: tilt (deg)
const MARKS = {
  wide: {
    hero:   { x: 0.2,   cy: 0.5,  hv: 0.72, rz: -4 },
    spin:   { x: 0,     cy: 0.5,  hv: 0.8 },
    aside:  { x: -0.36, cy: 0.5,  hv: 0.7 },
    dock:   { x: 0.46,  cy: 0.53, hv: 0.9,  rz: -9 },
    flavor: { x: 0.06,  cy: 0.48, hv: 0.68 },
    cta:    { x: 0,     cy: 0.5,  hv: 0.62 },
  },
  tall: {
    hero:   { x: 0,     cy: 0.335, hv: 0.44, rz: -3 },
    spin:   { x: 0,     cy: 0.4,  hv: 0.56 },
    aside:  { x: 0,     cy: 0.265, hv: 0.3 },
    dock:   { x: 0.74,  cy: 0.52, hv: 0.84, rz: -10 },
    flavor: { x: 0,     cy: 0.565, hv: 0.5 },
    cta:    { x: 0,     cy: 0.53, hv: 0.44 },
  },
};

// ── dom ──────────────────────────────────────────────────────────────────
const stageEl = $('.stage');
const ghostEl = $('.bd-ghost');
const ghostSpan = $('.bd-ghost span');
const dropsEl = $('.bd-drops i');
const glowA = $('.bd-glow--a');
const glowB = $('.bd-glow--b');
const flashEl = $('.flash');
const fallbackImg = $('.stage-fallback');
const nav = $('.nav');
const battery = $('.battery');
const batteryFill = $('.battery-cell i');
const batteryPct = $('.battery-pct');
const spinStage = $('.spin-stage');
const degEl = $('.spin-deg-num');
const hudEl = $('.spin-hud');
const trackFill = $('.spin-track-fill');
const captions = $$('.spin-caption');
const cardEl = $('.spin-card');
const chargeImg = $('.charge-media img');
const wireFill = $('.wire i');
const nodes = $$('.node');
const flavorsStage = $('.flavors-stage');
const flavorName = $('.flavor-name');
const flavorDesc = $('.flavor-desc');
const flavorCount = $('.flavor-count');
const chips = $$('.chip');
const shootTrack = $('.shoot-track');
const shootIdx = $('.shoot-idx');
const shootBar = $('.shoot-bar i');
const shots = $$('.shot');
const shotImgs = shots.map((s) => $('img', s));
const ctaEl = $('.cta');
const marquee = $('.marquee-track');

// ── input ────────────────────────────────────────────────────────────────
const st = { y: scrollY, sy: scrollY, vel: 0, mx: 0, my: 0, smx: 0, smy: 0 };
addEventListener('scroll', () => { st.y = scrollY; }, { passive: true });
if (!isTouch) {
  addEventListener('pointermove', (e) => {
    st.mx = (e.clientX / innerWidth) * 2 - 1;
    st.my = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
}

// ── layout cache ─────────────────────────────────────────────────────────
const L = { w: innerWidth, h: innerHeight, svh: innerHeight, lvh: innerHeight, max: 1, wide: true };
const sec = {};
const offTop = (el) => { let t = 0; for (let n = el; n; n = n.offsetParent) t += n.offsetTop; return t; };

function measure() {
  L.w = innerWidth; L.h = innerHeight;
  L.svh = spinStage.offsetHeight || innerHeight;   // a 100svh box
  L.lvh = stageEl.offsetHeight || innerHeight;     // the stage is 100lvh
  L.max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  L.wide = L.w >= 900;
  const box = (id, sticky) => {
    const el = document.getElementById(id);
    const top = offTop(el), height = el.offsetHeight;
    const range = Math.max(1, height - (sticky ? L.svh : 0));
    return { el, top, height, bottom: top + height, range, end: top + range };
  };
  sec.hero = box('hero');
  sec.spin = box('spin', true);
  sec.charge = box('charge');
  sec.circuit = box('circuit');
  sec.flavors = box('flavors', true);
  sec.shoot = box('shoot', true);
  sec.cta = box('cta', true);
  // curtains have feathered edges (CSS padding + mask); the pinned reel
  // lives inside the padding, so its scroll range excludes it
  L.fadeTop = Math.round(L.svh * 0.14);
  L.fadeBot = Math.round(L.svh * 0.2);
  const sh = sec.shoot;
  sh.top += L.fadeTop;
  sh.range = Math.max(1, sh.height - L.fadeTop - L.fadeBot - L.svh);
  sh.end = sh.top + sh.range;

  const body = $('.circuit-body');
  L.circuitTop = offTop(body); L.circuitH = body.offsetHeight;
  L.nodeTops = nodes.map((n) => L.circuitTop + n.offsetTop + 18);

  L.trackTravel = Math.max(0, shootTrack.scrollWidth - L.w);
  L.shotCenters = shots.map((s) => s.offsetLeft + s.offsetWidth / 2);
  L.chargeRange = Math.max(0, chargeImg.offsetHeight - $('.charge-media').offsetHeight);
  L.marqueeTop = offTop(marquee.parentElement);
  L.marqueeBottom = L.marqueeTop + marquee.parentElement.offsetHeight;
  marqueeW = 0;

  // park the "charging" silhouette exactly where the can will appear
  const m = mark('hero');
  stageEl.style.setProperty('--can-h', `${(m.hv * L.svh).toFixed(1)}px`);
  stageEl.style.setProperty('--can-y', `${(m.cy * L.svh - L.lvh / 2).toFixed(1)}px`);
  stageEl.style.setProperty('--can-x', `${((m.x * L.w) / 2).toFixed(1)}px`);
  force = true;
}

const mark = (k) => (L.wide ? MARKS.wide : MARKS.tall)[k];
// convert a mark (in visible-window terms) to the stage's normalized space
function place(m, extra = {}) {
  return {
    x: m.x,
    y: ((m.cy * L.svh) / L.lvh) * 2 - 1,
    h: (m.hv * L.svh) / L.lvh,
    rz: m.rz || 0, rx: m.rx || 0, ry: 0,
    ...extra,
  };
}
const mix = (a, b, t) => {
  const o = {};
  for (const k of ['x', 'y', 'h', 'rz', 'rx', 'ry']) o[k] = lerp(a[k] || 0, b[k] || 0, t);
  return o;
};

// ── the scenes ───────────────────────────────────────────────────────────
// Returns the can's placement for the smoothed scroll y; rawY is used where
// the can must ride along with content that is scrolling past.
let region = 'hero';
let kick = { t: 1, dir: 1 };
let ctaOpen = 0, ctaForce = false, ctaBurst = false;
const angle360 = (pr) => 360 * (pr + 0.115 * Math.sin(2 * Math.PI * pr)); // dwells on the back panel

let dtS = 0.016;
function scene(y, rawY, now) {
  const calm = !!stage?.lowPower;       // no GPU: hold still between scrolls
  const t = calm ? 0 : now / 1000;
  const S = sec;
  const shift = (from) => ((rawY - from) / L.lvh) * 2; // ride up with the page

  // hero → spin: travel to center stage while the hero scrolls away
  if (y < S.spin.top) {
    region = 'hero';
    const k = smooth(clamp01(y / Math.max(1, S.spin.top)));
    const idle = 1 - k;
    const hm = mark('hero');
    const hero = place(hm, {
      ry: (L.wide ? 22 : 18) * Math.sin(t * 0.6) + st.smx * 28,
      rx: st.smy * -6,
      rz: hm.rz + 2.5 * Math.sin(t * 0.45),
    });
    hero.y += 0.012 * Math.sin(t * 1.1);
    return { ...mix(hero, place(mark('spin')), k), live: !calm && idle > 0.001 };
  }

  // spin: the pinned 360°, then the can steps aside for the facts card
  // (and rides up with the page until the curtain's feathered edge has passed)
  if (y < S.charge.top + L.fadeTop) {
    region = 'spin';
    const p = clamp01((y - S.spin.top) / S.spin.range);
    const pr = clamp01(p / 0.62);
    const a = smooth(clamp01((p - 0.66) / 0.16));
    const o = mix(place(mark('spin')), place(mark('aside')), a);
    o.ry = angle360(pr) + a * 24;
    if (rawY > S.spin.end) o.y -= shift(S.spin.end);
    o.spinP = p; o.asideA = a; o.pr = pr;
    return o;
  }

  // charge curtain covers the screen: nothing drawn, move to the dock
  const circuitIn = S.charge.bottom - L.h - L.fadeBot;
  if (y < circuitIn) {
    region = 'charge';
    return { ...place(mark('dock')), ry: 35 };
  }

  // circuit: docked beside the ingredient list, turning to face it
  if (y < S.flavors.top - L.h) {
    region = 'circuit';
    const p = clamp01((y - circuitIn) / Math.max(1, S.flavors.top - L.h - circuitIn));
    return { ...place(mark('dock')), ry: lerp(35, 2, p) };
  }

  // flavors: glide to center, then hold for the flavor show
  if (y < S.shoot.top) {
    region = 'flavors';
    const k = smooth(clamp01((y - (S.flavors.top - L.h)) / L.h));
    const o = mix({ ...place(mark('dock')), ry: 2 }, place(mark('flavor')), k);
    kick.t = Math.min(1, kick.t + dtS / 0.9);
    o.ry += kick.dir * 360 * (1 - easeOutCubic(kick.t));
    if (k >= 1) o.ry += 10 * Math.sin(t * 0.7);
    if (rawY > S.flavors.end) o.y -= shift(S.flavors.end);
    o.live = !calm && k >= 1 && rawY <= S.flavors.end + 2;
    return o;
  }

  // the shoot curtain covers: move to the CTA mark
  const ctaIn = S.shoot.bottom - L.h - L.fadeBot;
  if (y < ctaIn) {
    region = 'shoot';
    return place(mark('cta'));
  }

  // cta: tilt toward you, crack the tab, fizz
  region = 'cta';
  const p = clamp01((y - S.cta.top) / S.cta.range);
  const tilt = smooth(clamp01(p / 0.4));
  const target = ctaForce ? 1 : clamp01((p - 0.3) / 0.24);
  ctaOpen = lerp(ctaOpen, target, 1 - Math.pow(0.86, dtS * 60));
  if (Math.abs(ctaOpen - target) < 0.002) ctaOpen = target;
  if (ctaOpen > 0.97 && !ctaBurst) { ctaBurst = true; crack(); }
  if (ctaOpen < 0.3 && ctaBurst) { ctaBurst = false; ctaEl.classList.remove('is-open'); }
  const o = place(mark('cta'), { rx: tilt * 22, ry: -12 * tilt + 8 * Math.sin(t * 0.6) });
  if (rawY > S.cta.end) o.y -= shift(S.cta.end);
  o.open = ctaOpen;
  o.live = !calm;
  return o;
}

// ── lightning ────────────────────────────────────────────────────────────
const boltCv = $('.bolts');
const bctx = boltCv.getContext('2d');
const bolts = [];
let boltDpr = 1, boltsDrawn = false, nextAmbient = performance.now() + 3200;

function sizeBolts() {
  boltDpr = Math.min(devicePixelRatio || 1, 2);
  boltCv.width = Math.round(stageEl.clientWidth * boltDpr);
  boltCv.height = Math.round(stageEl.clientHeight * boltDpr);
}
function boltPath(x1, y1, x2, y2, rough) {
  let pts = [[x1, y1], [x2, y2]];
  let off = Math.hypot(x2 - x1, y2 - y1) * rough;
  for (let level = 0; level < 6; level++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const o = (Math.random() - 0.5) * off;
      next.push([(ax + bx) / 2 - (dy / len) * o, (ay + by) / 2 + (dx / len) * o], pts[i + 1]);
    }
    pts = next;
    off *= 0.52;
  }
  return pts;
}
function strike(x2, y2, { power = 1 } = {}) {
  const x1 = x2 + (Math.random() - 0.5) * Math.min(L.w, 900) * 0.7;
  const main = boltPath(x1, -30, x2, y2, 0.2);
  const segs = [main];
  const nb = 1 + Math.round(Math.random() * 2 * power);
  for (let i = 0; i < nb; i++) {
    const s = main[8 + Math.floor(Math.random() * (main.length - 20))];
    const ang = Math.atan2(y2 - s[1], x2 - s[0]) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
    const len = 40 + Math.random() * 120;
    segs.push(boltPath(s[0], s[1], s[0] + Math.cos(ang) * len, s[1] + Math.sin(ang) * len, 0.3));
  }
  bolts.push({ segs, born: performance.now(), life: 380 + 160 * power, color: FLAVOR_UI[flavor].a1 });
  stageEl.classList.add('is-struck');
  setTimeout(() => stageEl.classList.remove('is-struck'), 220);
}
function drawBolts(now) {
  if (!bolts.length) {
    if (boltsDrawn) { bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, boltCv.width, boltCv.height); boltsDrawn = false; }
    return;
  }
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.clearRect(0, 0, boltCv.width, boltCv.height);
  bctx.setTransform(boltDpr, 0, 0, boltDpr, 0, 0);
  bctx.globalCompositeOperation = 'lighter';
  bctx.lineJoin = 'round'; bctx.lineCap = 'round';
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    const age = (now - b.born) / b.life;
    if (age >= 1) { bolts.splice(i, 1); continue; }
    // a real strike stutters: bright, dim, bright, then fades
    const flick = age < 0.12 ? 1 : age < 0.22 ? 0.35 : age < 0.34 ? 0.9 : 1 - (age - 0.34) / 0.66;
    for (let s = 0; s < b.segs.length; s++) {
      const pts = b.segs[s];
      const wt = s === 0 ? 1 : 0.55;
      bctx.beginPath();
      bctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) bctx.lineTo(pts[j][0], pts[j][1]);
      bctx.strokeStyle = b.color;
      bctx.globalAlpha = 0.14 * flick; bctx.lineWidth = 10 * wt; bctx.stroke();
      bctx.globalAlpha = 0.5 * flick; bctx.lineWidth = 3.2 * wt; bctx.stroke();
      bctx.strokeStyle = '#ffffff';
      bctx.globalAlpha = 0.95 * flick; bctx.lineWidth = 1.3 * wt; bctx.stroke();
    }
  }
  bctx.globalAlpha = 1;
  boltsDrawn = true;
}
function flash(x, y) {
  flashEl.style.setProperty('--fx', `${((x / L.w) * 100).toFixed(1)}%`);
  flashEl.style.setProperty('--fy', `${((y / L.lvh) * 100).toFixed(1)}%`);
  flashEl.animate([{ opacity: 0 }, { opacity: 0.38, offset: 0.1 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
}
function bigStrike() {
  const p = stage ? stage.lidPoint() : { x: L.w / 2, y: L.lvh * 0.3 };
  strike(p.x, p.y, { power: 1.4 });
  flash(p.x, p.y);
  stage?.strike(1);
}
const buzz = (ms) => { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(ms); };

// ── ghost word ───────────────────────────────────────────────────────────
let ghostWord = 'VOLTIC', ghostTimer = 0;
function setGhost(word) {
  if (!word || word === ghostWord) return;
  ghostWord = word;
  ghostEl.classList.add('is-swapping');
  clearTimeout(ghostTimer);
  ghostTimer = setTimeout(() => { ghostSpan.textContent = ghostWord; ghostEl.classList.remove('is-swapping'); }, 260);
}

// ── flavors ──────────────────────────────────────────────────────────────
let flavor = 'original', swapTimer = 0;
function setFlavor(name, dir = 1) {
  if (name === flavor) return;
  flavor = name;
  const ui = FLAVOR_UI[name];
  document.body.dataset.flavor = name;
  chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.flavor === name)));
  flavorsStage.classList.add('is-swapping');
  clearTimeout(swapTimer);
  swapTimer = setTimeout(() => {
    flavorName.innerHTML = ui.name;
    flavorDesc.textContent = ui.desc;
    flavorCount.textContent = `0${FLAVOR_ORDER.indexOf(name) + 1} / 03`;
    flavorsStage.classList.remove('is-swapping');
  }, 200);
  if (region === 'flavors') setGhost(ui.ghost);
  kick = { t: 0, dir };
  if (stage) {
    stage.setFlavor(name);
    setTimeout(bigStrike, 120);
  } else if (fallbackOn) {
    fallbackImg.style.filter = ui.hue ? `hue-rotate(${ui.hue}deg) saturate(1.2)` : '';
  }
  buzz(14);
}
function scrollToFlavor(i) {
  const at = [0.14, 0.52, 0.88][i];
  // deferred: a smooth scroll started inside a touch gesture gets cancelled
  // by that gesture's own end
  setTimeout(() => scrollTo({ top: sec.flavors.top + sec.flavors.range * at, behavior: 'smooth' }), 40);
}
chips.forEach((c) => c.addEventListener('click', () => scrollToFlavor(FLAVOR_ORDER.indexOf(c.dataset.flavor))));

// swipe the can (or tap it) to change flavor
{
  const pad = $('.flavor-pad');
  let x0 = 0, y0 = 0, t0 = 0, id = null;
  pad.addEventListener('pointerdown', (e) => { id = e.pointerId; x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); });
  pad.addEventListener('pointerup', (e) => {
    if (e.pointerId !== id) return;
    id = null;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    const i = FLAVOR_ORDER.indexOf(flavor);
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && performance.now() - t0 < 1200) {
      scrollToFlavor((i + (dx < 0 ? 1 : 2)) % 3);
    } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      scrollToFlavor((i + 1) % 3);
    }
  });
  pad.addEventListener('pointercancel', () => { id = null; });
}

// ── crack ────────────────────────────────────────────────────────────────
function crack() {
  ctaEl.classList.add('is-open');
  stage?.burst();
  bigStrike();
  buzz([18, 40, 26]);
}
$('.cta-pad').addEventListener('click', () => {
  if (ctaOpen > 0.97) { stage?.burst(); bigStrike(); buzz(16); }
  else ctaForce = true;
});
$('[data-recharge]').addEventListener('click', () => { ctaForce = false; bigStrike(); });

// ── reveals + counters ───────────────────────────────────────────────────
$$('.reveal').forEach((el) => {
  const sib = $$(':scope > .reveal', el.parentElement);
  el.style.setProperty('--stagger', `${sib.indexOf(el) * 0.08}s`);
});
const rio = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-in'); rio.unobserve(e.target); }
}, { threshold: 0.12 });
$$('.reveal').forEach((el) => rio.observe(el));

function countUp(el, to, dur = 1200) {
  const t0 = performance.now();
  const step = (now) => {
    const p = clamp01((now - t0) / dur);
    el.textContent = String(Math.round(to * easeOutCubic(p)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const cio = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { countUp(e.target, +e.target.dataset.count, 1400); cio.unobserve(e.target); }
}, { threshold: 0.6 });
$$('.count').forEach((el) => cio.observe(el));

// ── the loop ─────────────────────────────────────────────────────────────
let stage = null, fallbackOn = false, force = true, last = performance.now();
let marqueeX = 0, marqueeW = 0;
let lastRegion = '', lastBatt = -1, lastSolid = null, lastStep = -2, lastDeg = '', lastShot = -1;
const written = {}; // last-written values, so idle frames write nothing
const put = (key, el, prop, val) => { if (written[key] !== val) { written[key] = val; el.style[prop] = val; } };
let slowFrames = 0;

function tick(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = Math.max(last, now);
  L.h = innerHeight;

  // smoothing: wheel steps get eased; touch momentum is already smooth
  const k = 1 - Math.pow(1 - (isTouch ? 0.55 : 0.17), dt * 60);
  const prevY = st.sy;
  st.sy = lerp(st.sy, st.y, k);
  if (Math.abs(st.y - st.sy) < 0.1) st.sy = st.y;
  st.vel = st.sy - prevY;
  st.smx = lerp(st.smx, st.mx, 0.06);
  st.smy = lerp(st.smy, st.my, 0.06);
  if (Math.abs(st.mx - st.smx) < 0.0005) st.smx = st.mx;
  if (Math.abs(st.my - st.smy) < 0.0005) st.smy = st.my;

  const scrolling = st.vel !== 0 || force;
  const y = st.sy;
  dtS = dt;
  const c = scene(y, st.y, now);
  // fully behind a curtain (its feathered edges excluded): skip drawing
  const covered = (region === 'charge' && y + L.h <= sec.charge.bottom - L.fadeBot)
    || (region === 'shoot' && y >= sec.shoot.top && y + L.h <= sec.shoot.bottom - L.fadeBot);

  // ── the can ──
  if (stage) {
    stage.set({ x: c.x, y: c.y, h: c.h, ry: c.ry, rx: c.rx, rz: c.rz, open: c.open || 0 });
    const drew = covered ? false : stage.frame(now);
    // frames running long while drawing → drop resolution a notch
    if (drew && dt > 0.026 && dt < 0.09) { if (++slowFrames > 45) { stage.degrade(); slowFrames = 0; } }
    else if (drew) slowFrames = Math.max(0, slowFrames - 1);
  } else if (fallbackOn) {
    const s = ((c.h * L.lvh) / (0.6 * L.lvh)) * 1.22;
    put('fb', fallbackImg, 'transform',
      `translate(-50%, -50%) translate(${((c.x * L.w) / 2).toFixed(1)}px, ${((c.y * L.lvh) / 2).toFixed(1)}px) scale(${s.toFixed(3)}) rotate(${(c.rz || 0).toFixed(2)}deg)`);
  }

  // ── region changes ──
  if (region !== lastRegion) {
    lastRegion = region;
    setGhost({ hero: 'VOLTIC', spin: '360°', circuit: '200MG', flavors: FLAVOR_UI[flavor].ghost, cta: 'OPEN' }[region]);
  }

  // ── ambient lightning while the can is on stage and resting ──
  if (stage && c.live && !covered && now > nextAmbient && stage.introDone()) {
    nextAmbient = now + 2600 + Math.random() * 3400;
    const p = stage.lidPoint();
    strike(p.x, p.y, { power: 0.6 });
    stage.strike(0.5);
  }
  drawBolts(now);

  if ((scrolling || c.live) && !covered) {
    // backdrop drift: pointer depth + a little scroll
    put('ghost', ghostEl, 'transform', `translate3d(${(st.smx * -18).toFixed(1)}px, ${(st.smy * -12 - Math.max(-40, Math.min(40, st.vel * 1.4))).toFixed(1)}px, 0)`);
    put('drops', dropsEl, 'transform', `translate3d(${(st.smx * -30).toFixed(1)}px, ${(-((y * 0.05) % 313) + st.smy * -20).toFixed(1)}px, 0)`);
    put('glowA', glowA, 'transform', `translate3d(${(st.smx * 30).toFixed(1)}px, ${(st.smy * 20).toFixed(1)}px, 0)`);
    put('glowB', glowB, 'transform', `translate3d(${(st.smx * -24).toFixed(1)}px, ${(st.smy * -16).toFixed(1)}px, 0)`);
  }

  if (scrolling) {
    // nav + battery
    const solid = y > 40;
    if (solid !== lastSolid) { lastSolid = solid; nav.classList.toggle('is-solid', solid); }
    const pct = Math.round(clamp01(st.y / L.max) * 100);
    if (pct !== lastBatt) {
      lastBatt = pct;
      batteryFill.style.transform = `scaleX(${pct / 100})`;
      batteryPct.textContent = `${pct}%`;
      battery.setAttribute('aria-valuenow', String(pct));
    }

    // spin HUD, captions, facts card
    if (region === 'spin' || region === 'hero' || region === 'charge') {
      const inSpin = c.spinP !== undefined;
      const p = inSpin ? c.spinP : region === 'charge' ? 1 : 0;
      const a = inSpin ? c.asideA : region === 'charge' ? 1 : 0;
      const deg = String(inSpin ? Math.round(((angle360(c.pr) % 360) + 360) % 360) : 0).padStart(3, '0');
      if (deg !== lastDeg) { lastDeg = deg; degEl.textContent = deg; }
      put('trk', trackFill, 'transform', `scaleX(${clamp01(p / 0.62).toFixed(3)})`);
      put('hud', hudEl, 'opacity', (1 - a).toFixed(2));
      const step = !inSpin ? -1 : p < 0.3 ? 0 : p < 0.62 ? 1 : -1;
      if (step !== lastStep) { lastStep = step; captions.forEach((el, i) => el.classList.toggle('is-live', i === step)); }
      const e = easeOutCubic(clamp01((a - 0.25) / 0.75));
      put('card-o', cardEl, 'opacity', e.toFixed(3));
      put('card-t', cardEl, 'transform', `translateY(${((1 - e) * 40).toFixed(1)}px) scale(${(0.95 + e * 0.05).toFixed(3)})`);
      put('card-p', cardEl, 'pointerEvents', e > 0.5 ? 'auto' : 'none');
    }

    // charge: the photo drifts inside its frame
    if (y + L.h > sec.charge.top && y < sec.charge.bottom) {
      const p = clamp01((y + L.h - sec.charge.top) / (L.h + sec.charge.height));
      put('chg', chargeImg, 'transform', `translate3d(0, ${(-L.chargeRange * p).toFixed(1)}px, 0)`);
    }

    // circuit: current flows down the wire, nodes power on as it arrives
    if (region === 'circuit' || region === 'charge' || region === 'flavors') {
      const probe = y + L.h * 0.58;
      put('wire', wireFill, 'transform', `scaleY(${clamp01((probe - L.circuitTop) / L.circuitH).toFixed(3)})`);
      nodes.forEach((n, i) => {
        if (!n.classList.contains('is-on') && probe > L.nodeTops[i]) {
          n.classList.add('is-on');
          const b = $('b', n);
          countUp(b, +b.dataset.to, 900);
        }
      });
    }

    // flavors: which third of the pinned scroll are we in?
    if (region === 'flavors' && y >= sec.flavors.top - 2) {
      const p = clamp01((y - sec.flavors.top) / sec.flavors.range);
      const want = FLAVOR_ORDER[p < 0.36 ? 0 : p < 0.7 ? 1 : 2];
      if (want !== flavor) setFlavor(want, FLAVOR_ORDER.indexOf(want) > FLAVOR_ORDER.indexOf(flavor) ? 1 : -1);
    }

    // shoot: vertical scroll drives the horizontal reel
    if (y + L.h > sec.shoot.top && y < sec.shoot.bottom) {
      const p = clamp01((y - sec.shoot.top) / sec.shoot.range);
      const tx = -L.trackTravel * p;
      put('reel', shootTrack, 'transform', `translate3d(${tx.toFixed(1)}px, 0, 0)`);
      put('reelbar', shootBar, 'transform', `scaleX(${p.toFixed(3)})`);
      const idx = Math.min(shots.length - 1, Math.round(p * (shots.length - 1)));
      if (idx !== lastShot) { lastShot = idx; shootIdx.textContent = `0${idx + 1}`; }
      shotImgs.forEach((img, i) => {
        if (!img) return;
        const d = (L.shotCenters[i] + tx - L.w / 2) / L.w;
        put('shot' + i, img, 'transform', `translate3d(${(-d * 50).toFixed(1)}px, 0, 0) scale(1.14)`);
      });
    }
  }

  // marquee self-animates while on screen; velocity speeds and skews it
  if (st.sy + L.h > L.marqueeTop && st.sy < L.marqueeBottom) {
    if (!marqueeW) marqueeW = marquee.scrollWidth / 2;
    marqueeX = (marqueeX - (0.7 + Math.min(14, Math.abs(st.vel) * 0.6)) * dt * 60) % marqueeW;
    const skew = Math.max(-8, Math.min(8, st.vel * 0.35));
    marquee.style.transform = `translate3d(${marqueeX.toFixed(1)}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
  }

  force = false;
  requestAnimationFrame(tick);
}

// ── boot ─────────────────────────────────────────────────────────────────
let lastW = innerWidth, lastH = innerHeight;
function onResize() {
  // iOS fires resize as the toolbar slides; only a real resize re-measures
  if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 150) return;
  lastW = innerWidth; lastH = innerHeight;
  measure(); sizeBolts(); stage?.resize();
}
addEventListener('resize', () => requestAnimationFrame(onResize));
addEventListener('orientationchange', () => setTimeout(() => { lastW = -1; onResize(); }, 250));
// first measure after the first paint, so boot never forces a layout ahead of it
let measured = false;
requestAnimationFrame(() => { measure(); sizeBolts(); measured = true; requestAnimationFrame(tick); });
addEventListener('load', () => { if (measured) { measure(); force = true; } });
document.fonts?.ready.then(() => { if (measured) measure(); });
// ?debug exposes internals to QA scripts
if (location.search.includes('debug')) window.__v = { get stage() { return stage; }, L, sec, get region() { return region; } };

/** Is there WebGL, and is it a real GPU or a software rasterizer? */
function probeGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl', { antialias: false });
    if (!gl) return { ok: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) };
  } catch { return { ok: false }; }
}

function useFallback(err) {
  if (err) console.warn('VOLTIC: live can unavailable, showing the photo', err);
  fallbackOn = true;
  if (!fallbackImg.getAttribute('src')) fallbackImg.src = fallbackImg.dataset.src;
  fallbackImg.style.filter = FLAVOR_UI[flavor].hue ? `hue-rotate(${FLAVOR_UI[flavor].hue}deg)` : '';
  stageEl.classList.add('is-fallback');
  force = true;
}

let lowPower = false;
async function bootStage() {
  try {
    const { createStage } = await import('./stage.js');
    stage = await createStage(stageEl, { lowPower });
    stageEl.insertBefore(stage.renderer.domElement, $('.charging'));
    stage.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); stage = null; useFallback('context lost');
    });
    stage.attachDrag($('.spin-pad'));
    if (flavor !== 'original') stage.setFlavor(flavor);
    // a photo stand-in may be showing (GPU-less boot): the live can takes over
    fallbackOn = false;
    stageEl.classList.remove('is-fallback');
    stageEl.classList.add('is-live');
    stage.intro();
    force = true;
    if (!lowPower) setTimeout(() => { if (region === 'hero') bigStrike(); }, 520);
    (window.requestIdleCallback || setTimeout)(() => stage?.preloadFlavors(), { timeout: 3000 });
  } catch (err) {
    useFallback(err);
  }
}

// Boot the live can after first paint so the hero type lands first.
// No GPU (software WebGL): the photo stands in and the can boots on the first
// scroll or tap, instead of spending the first seconds rasterizing on the CPU.
// ?flat forces the photo, ?full forces the full show (both for QA).
{
  const q = new URLSearchParams(location.search);
  const afterLoad = (fn) => (document.readyState === 'complete' ? fn() : addEventListener('load', fn, { once: true }));
  const gl = q.has('flat') ? { ok: false } : probeGL();
  if (!gl.ok) {
    afterLoad(() => useFallback());
  } else if (gl.software && !q.has('full')) {
    lowPower = true;
    afterLoad(() => {
      useFallback();
      const evs = ['scroll', 'pointerdown', 'keydown', 'wheel', 'touchstart'];
      const once = () => { evs.forEach((e) => removeEventListener(e, once)); bootStage(); };
      evs.forEach((e) => addEventListener(e, once, { passive: true }));
    });
  } else {
    afterLoad(() => (window.requestIdleCallback || setTimeout)(bootStage, { timeout: 600 }));
  }
}
