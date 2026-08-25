#!/usr/bin/env node
/**
 * Pinned half-turn via Veo 3.1 Fast (first/last frame mode) — fallback runner,
 * because kling-3.0's first/last mode 500s on every input shape today.
 * Veo has its own endpoint pair, separate from jobs/createTask.
 *
 *   node tools/veo-spin.mjs A   front → back
 *   node tools/veo-spin.mjs B   back → front
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { download, sleep } from './kie.mjs';

const ROOT = join(import.meta.dirname, '..');
const MANIFEST = join(ROOT, 'assets', 'raw', 'manifest.json');
for (const line of readFileSync(join(ROOT, '..', 'asset-forge', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.KIE_API_KEY;
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const balance = async () =>
  (await (await fetch('https://api.kie.ai/api/v1/chat/credit', { headers: H })).json()).data;

const half = process.argv[2];
const FRONT = 'https://web-voltic.vercel.app/img/ref-front-916.jpg';
const BACK = 'https://web-voltic.vercel.app/img/ref-back-916.jpg';
const ends = half === 'A' ? [FRONT, BACK] : half === 'B' || half === 'C' ? [BACK, FRONT] : null;
if (!ends) { console.error('usage: veo-spin.mjs <A|B|C>'); process.exit(1); }

// ceiling 565: Josh approved ~35 past the prior 529 for the matched-anchor clip
const spentSoFar = JSON.parse(readFileSync(MANIFEST, 'utf8')).spent;
if (spentSoFar + 62 > 565) {
  console.error(`ceiling: ${spentSoFar} spent, a ~60cr clip would breach 565`);
  process.exit(1);
}

const before = await balance();
console.log(`balance before: ${before}`);

const res = await fetch('https://api.kie.ai/api/v1/veo/generate', {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    model: 'veo3_fast',
    generationType: 'FIRST_AND_LAST_FRAMES_2_VIDEO',
    imageUrls: ends,
    aspect_ratio: '9:16',
    duration: 6,
    prompt:
      'Locked-off studio product turntable shot. The camera does not move at all. The matte ' +
      'black energy drink can stands on a motorized turntable and rotates smoothly about its ' +
      'own vertical axis at perfectly constant speed, turning exactly 180 degrees from the ' +
      'orientation in the first frame to the orientation in the last frame. The rotation ' +
      'begins immediately on the very first frame and never pauses. The can stays perfectly ' +
      'upright and vertical at all times: it NEVER tilts, NEVER tips over, NEVER floats, and ' +
      `NEVER leaves the surface. The visible surface of the can glides steadily from ${
        half === 'C' ? 'left to right' : 'right to left'
      } throughout the whole clip. The printed label stays crisp and sharp and glides ` +
      'around the cylinder naturally. Lighting, dark background, floor reflection and ' +
      'condensation droplets stay constant. Nothing else moves, nothing else in frame. No audio.',
  }),
});
const body = await res.json();
if (body.code !== 200) { console.error('generate failed:', JSON.stringify(body).slice(0, 400)); process.exit(1); }
const taskId = body.data.taskId;
console.log('task', taskId);

let delay = 4000;
for (;;) {
  await sleep(delay);
  delay = Math.min(delay * 1.3, 15000);
  const r = await (await fetch(`https://api.kie.ai/api/v1/veo/record-info?taskId=${taskId}`, { headers: H })).json();
  const d = r.data ?? {};
  if (d.successFlag === 1) {
    const urls = d.response?.resultUrls ?? d.resultUrls ?? [];
    const url = Array.isArray(urls) ? urls[0] : JSON.parse(urls)[0];
    const f = join(ROOT, 'assets', 'raw', `spin3-${half}.mp4`);
    await download(url, f);
    const after = await balance();
    const cost = Math.round((before - after) * 10) / 10;
    console.log(`✓ spin3-${half} downloaded, cost ${cost} credits (balance ${after})`);
    const cur = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    cur.results[`spin3-${half}`] = { url, file: f, credits: cost, taskId };
    cur.spent += cost;
    writeFileSync(MANIFEST, JSON.stringify(cur, null, 2));
    break;
  }
  if (d.successFlag === 2 || d.successFlag === 3) {
    console.error(`✗ failed: ${d.errorCode} ${d.errorMessage}`);
    process.exit(1);
  }
  process.stdout.write('.');
}
