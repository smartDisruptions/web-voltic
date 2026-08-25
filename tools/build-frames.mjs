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

// The scrub is clip B PLAYED IN REVERSE — the one clip where Veo produced a
// flawless upright turntable (it only behaves when the clip STARTS on the
// back anchor). Reversed it reads front→back, landing exactly on the real
// English back-panel photo at 180°; a constant-speed turntable is
// direction-symmetric so the reversal is invisible. 60 samples = 3°/frame.
let out = 0;
for (const [half, reverse, count] of [['B', true, 60]]) {
  const src = join(ROOT, 'assets', 'raw', `spin3-${half}.mp4`);
  const n = Number(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'stream=nb_frames', '-of', 'csv=p=0', src]).toString().trim().split('\n')[0]);
  for (let i = 0; i < count; i++) {
    const j = reverse ? count - 1 - i : i;
    const srcIdx = Math.round((j * (n - 1)) / (count - 1));
    const png = join(TMP, `x.png`);
    execFileSync('ffmpeg', ['-v', 'quiet', '-i', src, '-vf', `select=eq(n\\,${srcIdx}),crop=720:1072:0:104`, '-vframes', '1', '-y', png]);
    out++;
    await sharp(png).webp({ quality: 80 }).toFile(join(FRAMES, `f${String(out).padStart(2, '0')}.webp`));
  }
  console.log(`${half}: ${n} source frames → ${count} sampled${reverse ? ' (reversed)' : ''}`);
}
const total = readdirSync(FRAMES).filter((f) => f.endsWith('.webp')).length;
console.log(`frames dir now holds ${total} webp files`);
