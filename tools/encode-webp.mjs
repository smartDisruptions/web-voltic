#!/usr/bin/env node
/**
 * One-off asset optimization: everything the page loads becomes WebP,
 * and the droplet plate gets pre-blurred variants so the three parallax
 * layers stop paying for live CSS blur/saturate filters on full-screen
 * elements. Encoded outputs are committed; this never runs in CI.
 */
import sharp from 'sharp';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const IMG = join(ROOT, 'public', 'img');
const FRAMES = join(ROOT, 'public', 'frames');
const kb = (p) => (statSync(p).size / 1024).toFixed(0) + 'KB';

// page images (og.jpg stays JPEG for social crawlers)
for (const [src, out, opts] of [
  ['hero-can.jpg', 'hero-can.webp', { quality: 82 }],
  ['splash.jpg', 'splash.webp', { quality: 78 }],
  ['trio.jpg', 'trio.webp', { quality: 78 }],
  ['macro.jpg', 'macro.webp', { quality: 78 }],
]) {
  await sharp(join(IMG, src)).webp(opts).toFile(join(IMG, out));
  console.log(out.padEnd(18), kb(join(IMG, src)), '→', kb(join(IMG, out)));
}

// droplet plate: three variants with the layer's blur/saturation baked in
const drops = join(IMG, 'droplets.jpg');
await sharp(drops).blur(2.2).webp({ quality: 72 }).toFile(join(IMG, 'drops-far.webp'));
await sharp(drops).blur(1.0).webp({ quality: 74 }).toFile(join(IMG, 'drops-mid.webp'));
await sharp(drops).modulate({ saturation: 1.25 }).webp({ quality: 76 }).toFile(join(IMG, 'drops-near.webp'));
for (const v of ['drops-far.webp', 'drops-mid.webp', 'drops-near.webp'])
  console.log(v.padEnd(18), '→', kb(join(IMG, v)));

// spin frames
let before = 0, after = 0;
for (const f of readdirSync(FRAMES).filter((f) => f.endsWith('.jpg'))) {
  const out = join(FRAMES, f.replace('.jpg', '.webp'));
  await sharp(join(FRAMES, f)).webp({ quality: 80 }).toFile(out);
  before += statSync(join(FRAMES, f)).size;
  after += statSync(out).size;
}
console.log(`frames: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`);
