/**
 * The VOLTIC can as real geometry — a cylinder wearing an authored label
 * texture, lit by the site's studio rig (cyan rim left, lime rim right),
 * standing on its own computed reflection. Loaded on demand; renders only
 * when something changed, so the idle cost is zero.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const R = 0.29;            // can radius
const BODY_H = 1.42;       // label wrap height
const FLOOR_Y = -0.86;

export function createCan3D(container) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 2 / 3, 0.1, 20);
  camera.position.set(0, 0.14, 4.7);
  camera.lookAt(0, -0.04, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;

  // ── lights: the studio rig ────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x28323a, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.5);
  key.position.set(0.7, 1.6, 2.6);
  scene.add(key);
  const cyanRim = new THREE.DirectionalLight(0x2fd8f5, 1.55);
  cyanRim.position.set(-2.8, 0.5, -1.9);
  scene.add(cyanRim);
  const limeRim = new THREE.DirectionalLight(0xb7e93c, 1.4);
  limeRim.position.set(2.8, 0.3, -2.0);
  scene.add(limeRim);
  const fill = new THREE.DirectionalLight(0x91a3ad, 0.22);
  fill.position.set(0, -0.4, 3);
  scene.add(fill);

  // ── materials ─────────────────────────────────────────────────────────
  const loader = new THREE.TextureLoader();
  const tex = (url, cb) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; cb?.(t); dirty = true; });

  const label = tex('/tex/label.webp');
  const glow = tex('/tex/glow.webp');
  const drops = loader.load('/img/droplets.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2.2, 1.5);
    dirty = true;
  });

  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: label,
    emissiveMap: glow,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    roughness: 0.46,
    metalness: 0.12,
    clearcoat: 0.45,
    clearcoatRoughness: 0.4,
    bumpMap: drops,
    bumpScale: 0.6,
  });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.5, metalness: 0.6 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xb9c2c6, roughness: 0.32, metalness: 1.0 });

  // ── geometry ──────────────────────────────────────────────────────────
  const can = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, BODY_H, 96, 1, true), bodyMat);
  can.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R, 0.1, 96, 1, true), darkMetal);
  neck.position.y = BODY_H / 2 + 0.05;
  can.add(neck);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.86, 0.014, 12, 96), silver);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BODY_H / 2 + 0.1;
  can.add(rim);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.85, 0.012, 96), silver);
  lid.position.y = BODY_H / 2 + 0.088;
  can.add(lid);
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 8, 40), silver);
  tab.rotation.x = Math.PI / 2;
  tab.position.set(0, BODY_H / 2 + 0.1, 0.05);
  can.add(tab);
  const tabPin = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16), silver);
  tabPin.position.set(0, BODY_H / 2 + 0.098, -0.01);
  can.add(tabPin);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.8, 0.08, 96, 1, true), darkMetal);
  base.position.y = -BODY_H / 2 - 0.04;
  can.add(base);
  const baseCap = new THREE.Mesh(new THREE.CircleGeometry(R * 0.8, 96), darkMetal);
  baseCap.rotation.x = Math.PI / 2;
  baseCap.position.y = -BODY_H / 2 - 0.08;
  can.add(baseCap);

  can.position.y = FLOOR_Y + BODY_H / 2 + 0.08;
  scene.add(can);

  // ── reflection: mirrored clone fading with distance from the floor ────
  const fadeData = new Uint8Array(128);
  for (let i = 0; i < 128; i++) fadeData[i] = Math.max(0, 220 - i * 3.2);
  const fadeTex = new THREE.DataTexture(fadeData, 1, 128, THREE.RedFormat);
  fadeTex.needsUpdate = true;

  const refl = can.clone(true);
  refl.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    if (o.geometry.type === 'CylinderGeometry' && o.material.map) {
      o.material.alphaMap = fadeTex;
      o.material.opacity = 0.34;
    } else {
      o.material.opacity = 0.12;
    }
    o.material.emissiveIntensity = 0.5;
  });
  refl.scale.y = -1;
  refl.position.y = 2 * FLOOR_Y - can.position.y;
  scene.add(refl);

  // contact shadow disc
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 48),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = FLOOR_Y + 0.001;
  scene.add(shadow);

  // ── control surface ───────────────────────────────────────────────────
  // Texture u=0.25 is the front face. CylinderGeometry places u=0 toward +Z
  // (the camera), so rotate the label's front into view; SIGN makes the
  // visible surface glide right-to-left as the angle grows (matches the
  // footage the site has always used).
  const OFFSET = -Math.PI / 2;
  const SIGN = 1;
  let dirty = true;
  let angleDeg = 0, dragDeg = 0;

  function apply() {
    const a = OFFSET + SIGN * (angleDeg + dragDeg) * (Math.PI / 180);
    can.rotation.y = a;
    refl.rotation.y = a;
  }

  function render() {
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  resize();

  // drag-to-spin: adds a decaying manual offset on top of the scroll angle
  let dragging = false, lastX = 0;
  container.style.touchAction = 'pan-y';
  container.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; container.setPointerCapture(e.pointerId); });
  container.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dragDeg += (e.clientX - lastX) * 0.45;
    lastX = e.clientX;
    apply(); dirty = true;
  });
  const endDrag = () => { dragging = false; };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);

  return {
    setAngle(deg) {
      if (!dragging && dragDeg !== 0) {
        dragDeg *= 0.88;
        if (Math.abs(dragDeg) < 0.2) dragDeg = 0;
      }
      if (deg === angleDeg && dragDeg === 0 && !dirty) return;
      angleDeg = deg;
      apply(); dirty = true;
    },
    render,
    resize,
    isDragging: () => dragging || dragDeg !== 0,
  };
}
