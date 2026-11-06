/**
 * VOLTIC v2 — the persistent stage.
 *
 * One live can, rendered once into a fixed full-screen canvas, travels the
 * whole page: it materializes in the hero, turns 360° to show its real
 * nutrition panel, docks beside the ingredient circuit, changes flavor, and
 * cracks open at the end. It's geometry wearing an authored label, so every
 * angle and every flavor is correct by construction.
 *
 * Renders on demand only: if nothing moved, nothing is drawn.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Points,
  CylinderGeometry, TorusGeometry, CircleGeometry, BufferGeometry, BufferAttribute,
  MeshPhysicalMaterial, MeshStandardMaterial, MeshBasicMaterial, PointsMaterial,
  AmbientLight, DirectionalLight, Color, Vector3, CanvasTexture, TextureLoader,
  PMREMGenerator, EquirectangularReflectionMapping, SRGBColorSpace,
  ACESFilmicToneMapping, RepeatWrapping, AdditiveBlending,
} from 'three';

const R = 0.29;              // can radius
const BODY_H = 1.42;         // label wrap height
const LID_Y = BODY_H / 2 + 0.094;
const CAN_H = BODY_H + 0.18; // base to rim
const DEG = Math.PI / 180;
const FOV = 30, CAM_Z = 6;
const VIS_H = 2 * CAM_Z * Math.tan((FOV / 2) * DEG); // world height visible at z=0

export const FLAVORS = {
  original: { rimA: 0x2fd8f5, rimB: 0xb7e93c, fizz: 0xc8f7ff },
  citrus:   { rimA: 0xe9ff52, rimB: 0x8fe83a, fizz: 0xf6ffc8 },
  storm:    { rimA: 0xff5ad2, rimB: 0x7b8dff, fizz: 0xf2dcff },
};

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const smooth = (t) => t * t * (3 - 2 * t);

const yieldToPage = () => new Promise((r) => setTimeout(r, 0));

export async function createStage(host, { lowPower = false } = {}) {
  // lowPower (no GPU, see main.js): the can still renders, but only when
  // something changes — no idle sway, no environment pass, 1× pixels.
  const small = Math.min(innerWidth, innerHeight) < 700;
  const maxDpr = lowPower ? 1 : Math.min(devicePixelRatio || 1, small ? 2 : 1.5);
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: !lowPower && maxDpr < 2,   // at 2x the pixels do the antialiasing
    powerPreference: 'high-performance',
  });
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.domElement.className = 'stage-gl';
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 30);
  camera.position.set(0, 0, CAM_Z);

  // tiny procedural studio env — a 64×32 gradient with two colored softboxes
  // (skipped without a GPU: its prefilter passes are the costliest boot step)
  if (!lowPower) {
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 64; envCanvas.height = 32;
  const ec = envCanvas.getContext('2d');
  const eg = ec.createLinearGradient(0, 0, 0, 32);
  eg.addColorStop(0, '#3a444b'); eg.addColorStop(0.55, '#14181b'); eg.addColorStop(1, '#050607');
  ec.fillStyle = eg; ec.fillRect(0, 0, 64, 32);
  ec.fillStyle = 'rgba(200,230,240,0.32)'; ec.fillRect(2, 9, 10, 13);
  ec.fillStyle = 'rgba(200,230,240,0.26)'; ec.fillRect(52, 9, 10, 13);
  const envTex = new CanvasTexture(envCanvas);
  envTex.mapping = EquirectangularReflectionMapping;
  envTex.colorSpace = SRGBColorSpace;
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
  envTex.dispose(); pmrem.dispose();
  }
  await yieldToPage();

  // ── the studio rig: two colored rims that take the flavor's colors ──────
  scene.add(new AmbientLight(0x28323a, lowPower ? 0.9 : 0.45));
  const key = new DirectionalLight(0xffffff, 0.5);
  key.position.set(0.8, 1.6, 2.8);
  scene.add(key);
  const rimA = new DirectionalLight(FLAVORS.original.rimA, 1.6);
  rimA.position.set(-2.8, 0.6, -1.8);
  scene.add(rimA);
  const rimB = new DirectionalLight(FLAVORS.original.rimB, 1.45);
  rimB.position.set(2.8, 0.3, -2.0);
  scene.add(rimB);
  const fill = new DirectionalLight(0x91a3ad, 0.24);
  fill.position.set(0, -0.6, 3);
  scene.add(fill);

  // ── textures: one label + glow pair per flavor, loaded on demand ────────
  const loader = new TextureLoader();
  const flavorTex = {};
  function loadFlavor(name) {
    if (!flavorTex[name]) {
      const get = (url) => loader.loadAsync(url).then((t) => { t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t; });
      flavorTex[name] = Promise.all([get(`/tex/label-${name}.webp`), get(`/tex/glow-${name}.webp`)])
        .then(([map, glow]) => ({ map, glow }));
    }
    return flavorTex[name];
  }
  const first = await loadFlavor('original');

  let dirty = true;
  const wrap = (t) => { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(2.5, 2); dirty = true; };
  const dropsHeight = loader.load('/tex/drops-height.webp', wrap);
  const dropsRough = loader.load('/tex/drops-rough.webp', wrap);

  const bodyMat = new MeshPhysicalMaterial({
    map: first.map,
    emissiveMap: first.glow,
    emissive: 0xffffff,
    emissiveIntensity: 0.46,
    // matte can (~0.58) with glossy droplet interiors (~0.10): the specular
    // contrast is what reads as "wet"
    roughness: 1.0,
    roughnessMap: dropsRough,
    metalness: 0.12,
    bumpMap: dropsHeight,
    bumpScale: 1.25,
    envMapIntensity: 0.32,
  });
  const darkMetal = new MeshStandardMaterial({ color: 0x15181a, roughness: 0.5, metalness: 0.6 });
  const silver = new MeshStandardMaterial({ color: 0xb9c2c6, roughness: 0.3, metalness: 1.0 });

  // ── geometry: rig (place + tilt) → spinner (turn) → parts ───────────────
  const rig = new Group();
  const spinner = new Group();
  rig.add(spinner);
  scene.add(rig);
  const can = new Group();
  can.position.y = -0.01; // center the can on the rig origin
  spinner.add(can);

  const bodyGeo = new CylinderGeometry(R, R, BODY_H, 96, 1, true);
  // texture u=0.25 is the label's front; turn it toward the camera
  // (verified on screen: front at 0°, nutrition panel at 180°)
  bodyGeo.rotateY(-Math.PI / 2);
  can.add(new Mesh(bodyGeo, bodyMat));

  const neck = new Mesh(new CylinderGeometry(R * 0.86, R, 0.1, 96, 1, true), darkMetal);
  neck.position.y = BODY_H / 2 + 0.05;
  can.add(neck);
  const rim = new Mesh(new TorusGeometry(R * 0.86, 0.014, 12, 96), silver);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BODY_H / 2 + 0.1;
  can.add(rim);
  const lid = new Mesh(new CylinderGeometry(R * 0.85, R * 0.85, 0.012, 96), silver);
  lid.position.y = BODY_H / 2 + 0.088;
  can.add(lid);

  // the opening: a dark scored mouth that appears as the tab cracks
  const mouth = new Mesh(new CircleGeometry(0.075, 32), new MeshBasicMaterial({ color: 0x030405 }));
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.set(0, LID_Y + 0.0015, -0.11);
  mouth.scale.set(0.001, 0.001, 1);
  can.add(mouth);

  // the tab pivots on its rivet: finger ring rises, nose pushes the mouth in
  const tabPivot = new Group();
  tabPivot.position.set(0, LID_Y + 0.006, -0.01);
  can.add(tabPivot);
  const ring = new Mesh(new TorusGeometry(0.055, 0.011, 8, 40), silver);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = 0.06;
  tabPivot.add(ring);
  const nose = new Mesh(new CylinderGeometry(0.04, 0.04, 0.008, 24), silver);
  nose.scale.z = 0.8;
  nose.position.z = -0.035;
  tabPivot.add(nose);
  const rivet = new Mesh(new CylinderGeometry(0.016, 0.016, 0.02, 16), silver);
  rivet.position.set(0, LID_Y + 0.004, -0.01);
  can.add(rivet);

  const base = new Mesh(new CylinderGeometry(R, R * 0.8, 0.08, 96, 1, true), darkMetal);
  base.position.y = -BODY_H / 2 - 0.04;
  can.add(base);
  const baseCap = new Mesh(new CircleGeometry(R * 0.8, 96), darkMetal);
  baseCap.rotation.x = Math.PI / 2;
  baseCap.position.y = -BODY_H / 2 - 0.08;
  can.add(baseCap);

  // ── fizz: pooled additive points, CPU-stepped only while a burst lives ──
  const N = small ? 140 : 220;
  const fizzPos = new Float32Array(N * 3);
  const fizzCol = new Float32Array(N * 4);   // rgba: the fade lives in alpha
  const fizzVel = new Float32Array(N * 3);
  const fizzLife = new Float32Array(N);
  const fizzMax = new Float32Array(N);
  const fizzGeo = new BufferGeometry();
  fizzGeo.setAttribute('position', new BufferAttribute(fizzPos, 3));
  fizzGeo.setAttribute('color', new BufferAttribute(fizzCol, 4));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const dctx = dot.getContext('2d');
  const dg = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  dg.addColorStop(0, 'rgba(255,255,255,1)');
  dg.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  dg.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = dg; dctx.fillRect(0, 0, 32, 32);
  const fizzMat = new PointsMaterial({
    size: 0.1, map: new CanvasTexture(dot), vertexColors: true,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const fizz = new Points(fizzGeo, fizzMat);
  fizz.visible = false;
  fizz.frustumCulled = false;
  can.add(fizz);
  let fizzAlive = 0;
  const fizzColor = new Color(FLAVORS.original.fizz);

  // ── state ───────────────────────────────────────────────────────────────
  const s = { x: 0, y: 0, h: 0.6, ry: 0, rx: 0, rz: 0, open: 0, alpha: 1 };
  let aspect = 1, visW = VIS_H;
  let dragDeg = 0, dragging = false;
  let introT = 0;              // 0→1 materialize
  let strikeLvl = 0, strikeT = 0;
  let flavor = 'original';
  let tween = null;            // rim color tween
  let last = performance.now();
  const colA = new Color(FLAVORS.original.rimA), colB = new Color(FLAVORS.original.rimB);
  const fromA = new Color(), fromB = new Color(), toA = new Color(), toB = new Color();

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    visW = VIS_H * aspect;
    dirty = true;
  }
  resize();

  function apply() {
    const it = easeOutCubic(introT);
    const scale = (s.h * VIS_H) / CAN_H * (0.72 + 0.28 * easeOutBack(Math.min(1, introT * 1.05)));
    rig.position.set((s.x * visW) / 2, (-s.y * VIS_H) / 2 + (1 - it) * 0.35, 0);
    rig.scale.setScalar(scale);
    rig.rotation.set(s.rx * DEG, 0, s.rz * DEG);
    // the materialize spin: arrives turning, settles exactly on the scroll angle
    spinner.rotation.y = (s.ry + dragDeg - 540 * (1 - it)) * DEG;
    tabPivot.rotation.x = -smooth(Math.min(1, s.open)) * 1.15;
    const m = smooth(Math.min(1, Math.max(0, (s.open - 0.35) / 0.65)));
    mouth.scale.set(Math.max(0.001, m), Math.max(0.001, m * 0.72), 1);

    const k = strikeLvl * (0.65 + 0.35 * Math.sin(strikeT * 70));
    rimA.color.copy(colA); rimB.color.copy(colB);
    rimA.intensity = 1.6 * (1 + 2.2 * k);
    rimB.intensity = 1.45 * (1 + 2.2 * k);
    key.intensity = 0.5 + 0.9 * k;
    bodyMat.emissiveIntensity = 0.46 + 0.7 * k;
  }

  function stepFizz(dt) {
    let alive = 0;
    for (let i = 0; i < N; i++) {
      if (fizzLife[i] <= 0) continue;
      fizzLife[i] -= dt;
      const j = i * 3, c = i * 4;
      if (fizzLife[i] <= 0) { fizzCol[c + 3] = 0; continue; }
      alive++;
      fizzVel[j + 1] -= 2.4 * dt;           // gravity
      fizzVel[j] *= 0.985; fizzVel[j + 2] *= 0.985;
      fizzPos[j] += fizzVel[j] * dt;
      fizzPos[j + 1] += fizzVel[j + 1] * dt;
      fizzPos[j + 2] += fizzVel[j + 2] * dt;
      // fading alpha (not color) so a dying droplet never darkens the page
      // through the transparent canvas
      fizzCol[c] = fizzColor.r; fizzCol[c + 1] = fizzColor.g; fizzCol[c + 2] = fizzColor.b;
      fizzCol[c + 3] = Math.min(1, (fizzLife[i] / fizzMax[i]) * 1.6);
    }
    fizzGeo.attributes.position.needsUpdate = true;
    fizzGeo.attributes.color.needsUpdate = true;
    fizzAlive = alive;
    fizz.visible = alive > 0;
  }

  // pay the shader compile + texture upload now, not on the first scroll frame
  // (async where the driver compiles in parallel, so boot doesn't block input)
  apply();
  await yieldToPage();
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  await yieldToPage();
  renderer.render(scene, camera);

  const lidWorld = new Vector3();
  const api = {
    /** Merge a partial placement; marks dirty only on a real change. */
    set(next) {
      for (const k in next) {
        if (Math.abs(next[k] - s[k]) > 1e-4) { s[k] = next[k]; dirty = true; }
      }
    },
    /** Draw if anything changed. Returns true when a frame was rendered. */
    frame(now) {
      // rAF timestamps can precede the moment this stage was built: clamp
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = Math.max(last, now);
      let anim = false;
      if (introT > 0 && introT < 1) { introT = Math.min(1, introT + dt / 1.1); anim = true; }
      if (strikeLvl > 0) {
        strikeT += dt;
        strikeLvl *= Math.exp(-dt / 0.22);
        if (strikeLvl < 0.01) strikeLvl = 0;
        anim = true;
      }
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / 0.7);
        const e = smooth(tween.t);
        colA.lerpColors(fromA, toA, e); colB.lerpColors(fromB, toB, e);
        if (tween.t >= 1) tween = null;
        anim = true;
      }
      if (!dragging && dragDeg !== 0) {
        dragDeg *= Math.pow(0.9, dt * 60);
        if (Math.abs(dragDeg) < 0.15) dragDeg = 0;
        anim = true;
      }
      if (fizzAlive || fizz.visible) { stepFizz(dt); anim = true; }
      if (!dirty && !anim) return false;
      dirty = false;
      apply();
      renderer.render(scene, camera);
      return true;
    },
    /** Kick off the materialize-in (instant without a GPU). */
    intro() { introT = lowPower ? 1 : 0.0001; dirty = true; },
    lowPower,
    introDone: () => introT >= 1,
    strike(level = 1) { strikeLvl = Math.max(strikeLvl, level); strikeT = 0; },
    async setFlavor(name) {
      if (name === flavor || !FLAVORS[name]) return;
      flavor = name;
      const tex = await loadFlavor(name);
      if (flavor !== name) return;          // a newer pick won the race
      bodyMat.map = tex.map;
      bodyMat.emissiveMap = tex.glow;
      fromA.copy(colA); fromB.copy(colB);
      toA.set(FLAVORS[name].rimA); toB.set(FLAVORS[name].rimB);
      fizzColor.set(FLAVORS[name].fizz);
      tween = { t: 0 };
      dirty = true;
    },
    preloadFlavors() { Object.keys(FLAVORS).forEach(loadFlavor); },
    /** Spray fizz out of the mouth. */
    burst() {
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.05;
        fizzPos[j] = Math.cos(a) * r;
        fizzPos[j + 1] = LID_Y + 0.01;
        fizzPos[j + 2] = -0.11 + Math.sin(a) * r * 0.7;
        const up = 1.2 + Math.random() * 2.4;
        fizzVel[j] = (Math.random() - 0.5) * 1.4;
        fizzVel[j + 1] = up;
        fizzVel[j + 2] = (Math.random() - 0.3) * 1.1;
        fizzMax[i] = fizzLife[i] = 0.6 + Math.random() * 1.0;
      }
      fizzMat.size = 0.085 + 0.035 * Math.random();
      stepFizz(0);
    },
    /** Grab-to-spin on any element; returns a detach function. */
    attachDrag(el, { onTap } = {}) {
      let lastX = 0, startX = 0, startY = 0, moved = false, id = null;
      const down = (e) => {
        id = e.pointerId; dragging = true; moved = false;
        lastX = startX = e.clientX; startY = e.clientY;
      };
      const move = (e) => {
        if (!dragging || e.pointerId !== id) return;
        if (!moved && Math.abs(e.clientX - startX) > 6) {
          moved = true;
          el.setPointerCapture?.(e.pointerId);
        }
        if (Math.abs(e.clientY - startY) > 40 && !moved) { dragging = false; return; }
        if (moved) { dragDeg += (e.clientX - lastX) * 0.55; dirty = true; }
        lastX = e.clientX;
      };
      const up = (e) => {
        if (e.pointerId !== id) return;
        if (dragging && !moved && onTap) onTap(e);
        dragging = false; id = null;
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', () => { dragging = false; id = null; });
    },
    isBusy: () => dragging || dragDeg !== 0 || strikeLvl > 0 || !!tween || fizz.visible || (introT > 0 && introT < 1),
    /** Where the lid sits on screen, in CSS px of the host. */
    lidPoint() {
      apply();
      rig.updateMatrixWorld(true);
      lidWorld.set(0, LID_Y + 0.02, 0);
      can.localToWorld(lidWorld);
      lidWorld.project(camera);
      return {
        x: (lidWorld.x * 0.5 + 0.5) * host.clientWidth,
        y: (-lidWorld.y * 0.5 + 0.5) * host.clientHeight,
      };
    },
    resize,
    /** Drop resolution a notch when frames run long. */
    degrade() {
      if (dpr <= 1) return false;
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      resize();
      return true;
    },
    get dpr() { return dpr; },
    debug: () => ({ s: { ...s }, introT, rigY: rig.position.y, scale: rig.scale.x, size: [renderer.domElement.width, renderer.domElement.height], aspect: camera.aspect }),
    renderer,
  };
  return api;
}
