#!/usr/bin/env node
/**
 * Condensation textures for the 3D can, generated as data — not photographed.
 * A photo of rim-lit droplets makes a terrible bump map (bright ring edges
 * read as crater rims). Real droplets need:
 *   height map — smooth radial DOMES (bright core → dark edge = raised)
 *   gloss map  — droplets glossy, can matte (roughnessMap: dark = glossy)
 * Same seeded positions drive both, tile-wrapped so the texture repeats
 * seamlessly around the cylinder.
 */
import sharp from 'sharp';
import { join } from 'node:path';

const SIZE = 1024;
const OUT = join(import.meta.dirname, '..', 'public', 'tex');

// deterministic LCG so reruns produce the identical can
let seed = 20260825;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

const drops = [];
// fine mist: hundreds of tiny beads
for (let i = 0; i < 900; i++) drops.push({ x: rand() * SIZE, y: rand() * SIZE, r: 1.2 + rand() * 2.6, run: 0 });
// medium beads
for (let i = 0; i < 160; i++) drops.push({ x: rand() * SIZE, y: rand() * SIZE, r: 4 + rand() * 5, run: 0 });
// large drops, some with a short run-down trail
for (let i = 0; i < 34; i++) drops.push({ x: rand() * SIZE, y: rand() * SIZE, r: 10 + rand() * 9, run: rand() < 0.45 ? 12 + rand() * 40 : 0 });

// wrap duplicates so nothing clips at a tile edge
const placed = [];
for (const d of drops) {
  placed.push(d);
  const m = d.r + d.run + 2;
  if (d.x < m) placed.push({ ...d, x: d.x + SIZE });
  if (d.x > SIZE - m) placed.push({ ...d, x: d.x - SIZE });
  if (d.y < m) placed.push({ ...d, y: d.y + SIZE });
  if (d.y > SIZE - m) placed.push({ ...d, y: d.y - SIZE });
}

function svg(mode) {
  // height: black ground, dome = radial white core fading out
  // rough:  light ground (matte can ~0.58), droplet interior dark (glossy ~0.10)
  const shapes = placed.map((d) => {
    const trail = d.run
      ? `<rect x="${(d.x - d.r * 0.42).toFixed(1)}" y="${d.y.toFixed(1)}" width="${(d.r * 0.84).toFixed(1)}" height="${d.run.toFixed(1)}" rx="${(d.r * 0.42).toFixed(1)}" fill="url(#${mode}t)"/>`
      : '';
    return `${trail}<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(1)}" fill="url(#${mode}g)"/>`;
  }).join('');
  const defs = mode === 'h'
    ? `<radialGradient id="hg"><stop offset="0%" stop-color="#ffffff"/><stop offset="62%" stop-color="#b9b9b9"/><stop offset="88%" stop-color="#3a3a3a"/><stop offset="100%" stop-color="#000000"/></radialGradient>
       <linearGradient id="ht" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#000000"/><stop offset="50%" stop-color="#9a9a9a"/><stop offset="100%" stop-color="#000000"/></linearGradient>`
    : `<radialGradient id="rg"><stop offset="0%" stop-color="#1a1a1a"/><stop offset="72%" stop-color="#242424"/><stop offset="96%" stop-color="#949494"/><stop offset="100%" stop-color="#949494"/></radialGradient>
       <linearGradient id="rt" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#949494"/><stop offset="50%" stop-color="#2c2c2c"/><stop offset="100%" stop-color="#949494"/></linearGradient>`;
  const bg = mode === 'h' ? '#000000' : '#949494';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><defs>${defs}</defs><rect width="${SIZE}" height="${SIZE}" fill="${bg}"/>${shapes}</svg>`;
}

await sharp(Buffer.from(svg('h'))).blur(0.6).webp({ quality: 90 }).toFile(join(OUT, 'drops-height.webp'));
await sharp(Buffer.from(svg('r'))).blur(0.4).webp({ quality: 90 }).toFile(join(OUT, 'drops-rough.webp'));
console.log('drops-height.webp + drops-rough.webp written');
