#!/usr/bin/env node
/**
 * Splice the two pinned Veo half-turns into the 60-frame 360° scrub sequence.
 * Crops the 9:16 padding back off (anchors were padded 800×1422; the real
 * 2:3 band maps to y=104,h=1072 at the 720-wide output), samples 30 frames
 * per half, and writes public/frames/f01–f60.webp.
 */
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '..');
const FRAMES = join(ROOT, 'public', 'frames');
const TMP = join(tmpdir(), 'voltic-frames');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// The scrub is clip B PLAYED IN REVERSE with NON-UNIFORM sampling. The clip's
// rotation is not constant speed: measured against the 144 source frames, the
// whole front reveal lives in ~121-143, ~66-118 is parked on the blank flank,
// and 0-62 carries the panel arc. Uniform sampling made the label vanish in
// the first few scrub frames and left a long dead zone, so slots are
// allocated where the visual rotation actually happens.
const src = join(ROOT, 'assets', 'raw', 'spin3-B.mp4');
const n = Number(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'stream=nb_frames', '-of', 'csv=p=0', src]).toString().trim().split('\n')[0]);
const indices = [];
for (let i = 0; i < 18; i++) indices.push(Math.round(143 - (i * 22) / 17));   // front arc, stretched
for (let i = 0; i < 8; i++) indices.push(Math.round(118 - (i * 52) / 7));     // parked flank, compressed
for (let i = 0; i < 34; i++) indices.push(Math.round(62 - (i * 62) / 33));    // panel arc
let out = 0;
for (const srcIdx of indices) {
  const png = join(TMP, `x.png`);
  execFileSync('ffmpeg', ['-v', 'quiet', '-i', src, '-vf', `select=eq(n\\,${Math.min(srcIdx, n - 1)}),crop=720:1072:0:104`, '-vframes', '1', '-y', png]);
  out++;
  await sharp(png).webp({ quality: 80 }).toFile(join(FRAMES, `f${String(out).padStart(2, '0')}.webp`));
}
console.log(`B: ${n} source frames → ${indices.length} non-uniform samples (reversed)`);
const total = readdirSync(FRAMES).filter((f) => f.endsWith('.webp')).length;
console.log(`frames dir now holds ${total} webp files`);
