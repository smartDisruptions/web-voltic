#!/usr/bin/env node
/**
 * The back-anchor's floor reflection reached Veo truncated (a compositing
 * error), so the clip renders a shapeless smudge under the can — most
 * visible on the resting frame. This rebuilds the floor zone of the final
 * frames deterministically: clean the smudge with the frame's own side-floor
 * gradient, then composite a true vertical mirror of the can, faded and
 * softened, ramping in across f56→f60 so the rest frame is crisp.
 */
import sharp from 'sharp';
import { join } from 'node:path';

const FRAMES = join(import.meta.dirname, '..', 'public', 'frames');
const W = 720, H = 1072;
const CAN_X0 = 225, CAN_X1 = 500;              // can bounds incl. margin

// Measured on the luminance profile of f60: can body ends ~845, dark floor
// seam 850-895, the bogus smudge glow starts ~900. Same geometry across the
// locked-off clip, so one constant beats a detector (the first, gradient-based
// detector latched onto the barcode's edge and ate the can's bottom third).
const FLOOR_Y = 858;

const files = ['f56', 'f57', 'f58', 'f59', 'f60'];
const alphas = [0.16, 0.2, 0.24, 0.28, 0.32];

for (let k = 0; k < files.length; k++) {
  const p = join(FRAMES, `${files[k]}.webp`);
  const img = sharp(p);
  const raw = await img.clone().raw().toBuffer();
  const floorY = FLOOR_Y;

  // clean floor: per-row colour sampled from the sides (x<120, x>600),
  // stretched across the full width — kills the smudge, keeps the vignette
  const floorH = H - floorY;
  const rowStrip = Buffer.alloc(floorH * 3);
  for (let y = 0; y < floorH; y++) {
    for (let c = 0; c < 3; c++) {
      let s = 0, n = 0;
      for (const x of [40, 80, 110, 620, 660, 690]) { s += raw[((floorY + y) * W + x) * 3 + c]; n++; }
      rowStrip[y * 3 + c] = Math.round(s / n);
    }
  }
  const floorFill = await sharp(rowStrip, { raw: { width: 1, height: floorH, channels: 3 } })
    .resize(W, floorH, { fit: 'fill' }).png().toBuffer();

  // reflection: mirror of the can's bottom band, faded top→bottom
  const bandH = Math.min(300, floorY - 400);
  const band = await img.clone().extract({ left: CAN_X0, top: floorY - bandH, width: CAN_X1 - CAN_X0, height: bandH }).flip().blur(1.4).toBuffer();
  const fadeH = Math.min(bandH, floorH);
  // alpha mask: linear fade to nothing over the fade height
  const maskRaw = Buffer.alloc((CAN_X1 - CAN_X0) * fadeH);
  for (let y = 0; y < fadeH; y++) {
    const a = Math.round(255 * alphas[k] * (1 - y / fadeH));
    maskRaw.fill(a, y * (CAN_X1 - CAN_X0), (y + 1) * (CAN_X1 - CAN_X0));
  }
  const mask = await sharp(maskRaw, { raw: { width: CAN_X1 - CAN_X0, height: fadeH, channels: 1 } }).png().toBuffer();
  const refl = await sharp(band).extract({ left: 0, top: 0, width: CAN_X1 - CAN_X0, height: fadeH })
    .joinChannel(mask).png().toBuffer();

  const out = await sharp(p)
    .composite([
      { input: floorFill, left: 0, top: floorY },
      { input: refl, left: CAN_X0, top: floorY + 2 },
    ])
    .webp({ quality: 82 }).toBuffer();
  await sharp(out).toFile(p);
  console.log(`${files[k]}: floor at y=${floorY}, reflection alpha ${alphas[k]}`);
}
