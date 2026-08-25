#!/usr/bin/env node
/**
 * Luminance-continuity grade for the scrub frames. The Veo clip renders its
 * own flatter light except near the pinned anchors, so the bright front
 * anchor falls to the clip's level within ~8 frames — reads as a can swap.
 * This spreads the same falloff smoothly across the first ~70° so it reads
 * as the label light rotating away. Run after build-frames.mjs.
 */
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readdirSync, renameSync } from 'node:fs';

const FRAMES = join(import.meta.dirname, '..', 'public', 'frames');
const files = readdirSync(FRAMES).filter((f) => f.endsWith('.webp')).sort();

const yavg = (p) => {
  const out = execFileSync('ffmpeg', ['-i', p, '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-'],
    { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return parseFloat(out.split('\n').find((l) => l.includes('YAVG')).split('=')[1]);
};

const actual = files.map((f) => yavg(join(FRAMES, f)));
const start = actual[0];
const settled = actual.slice(10, 30).reduce((a, b) => a + b) / 20;

// target: eased descent start→settled across the first 24 frames, then follow
// the clip's own (gentle) curve untouched
const RAMP = 24;
let maxGain = 1;
for (let i = 0; i < files.length; i++) {
  let target = actual[i];
  if (i < RAMP) {
    const t = i / (RAMP - 1);
    target = settled + (start - settled) * Math.pow(1 - t, 1.6);
  }
  const gain = Math.min(1.4, Math.max(0.75, target / actual[i]));
  maxGain = Math.max(maxGain, gain);
  if (Math.abs(gain - 1) < 0.02) continue;
  const p = join(FRAMES, files[i]);
  const tmp = p + '.tmp.webp';
  await sharp(p).modulate({ brightness: gain }).webp({ quality: 82 }).toFile(tmp);
  renameSync(tmp, p);
}

const after = files.map((f) => yavg(join(FRAMES, f)));
const worstStep = Math.max(...after.slice(1).map((v, i) => Math.abs(v - after[i])));
console.log(`start ${start.toFixed(1)} → settled ${settled.toFixed(1)}, ramp spread over ${RAMP} frames`);
console.log(`worst frame-to-frame luminance step after grade: ${worstStep.toFixed(2)} (was ~2.5)`);
