#!/usr/bin/env node
/**
 * gen — VOLTIC asset generation via kie.ai.
 *
 *   node tools/gen.mjs hero       one canonical can design         (~8 cr)
 *   node tools/gen.mjs spin       360° turntable video from hero   (~50 cr)
 *   node tools/gen.mjs stills     3 photoreal shots from hero      (~24 cr)
 *   node tools/gen.mjs droplets   droplet overlay texture          (~8 cr)
 *
 * Spend is persisted to assets/raw/manifest.json and capped at 200 credits
 * for the whole build — Josh's stated budget for this project.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KieClient, SpendLedger, download } from './kie.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'assets', 'raw');
const MANIFEST = join(RAW, 'manifest.json');
const CEILING = 200;

// Key lives in asset-forge/.env — single source, never copied into this repo.
const envFile = join(ROOT, '..', 'asset-forge', '.env');
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const manifest = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
  : { spent: 0, results: {} };

const ledger = new SpendLedger(CEILING);
ledger.spent = manifest.spent; // resume against the same 200-credit budget

const kie = new KieClient({ apiKey: process.env.KIE_API_KEY, ledger, log: console.log });

function save(name, r, file) {
  // Re-read before writing — spin and stills may run as concurrent processes.
  const cur = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { spent: 0, results: {} };
  cur.results[name] = { url: r.urls[0], file, credits: r.credits, taskId: r.taskId };
  cur.spent += r.credits;
  writeFileSync(MANIFEST, JSON.stringify(cur, null, 2));
}

const CAN =
  'A single 16oz slim aluminum energy drink can, matte black finish, standing perfectly ' +
  'vertical and centred. The label design: the brand name "VOLTIC" in large bold uppercase ' +
  'sans-serif letters running vertically down the can, glowing electric cyan fading into ' +
  'acid lime green at the bottom. Above the wordmark a small sharp lightning bolt icon in ' +
  'the same cyan. Small thin text "LIQUID LIGHTNING · ENERGY" near the base. Fine beads of ' +
  'condensation cover the whole can, catching the light.';

const STYLE =
  'Ultra-photorealistic commercial beverage product photography, shot on a 100mm macro lens, ' +
  'crisp focus, dramatic dark studio: near-black charcoal background with a faint cyan rim ' +
  'light from the left and a lime rim light from the right, soft reflection on the glossy ' +
  'black surface the can stands on. No people, no hands, no text anywhere except on the can label.';

const cmds = {
  async hero() {
    const r = await kie.generate({
      model: 'nano-banana-2',
      input: { prompt: `${CAN} ${STYLE} Straight-on eye-level angle, the can fills most of the frame height.`, aspect_ratio: '2:3' },
      label: 'hero-can',
      estimate: 10,
    });
    const f = join(RAW, 'hero-can.png');
    await download(r.urls[0], f);
    save('hero', r, f);
  },

  async spin() {
    // reference the deployed asset — kie's own result URLs are short-lived
    const heroUrl = 'https://web-voltic.vercel.app/img/hero-can.jpg';
    const r = await kie.generate({
      model: 'kling-2.6/image-to-video',
      input: {
        prompt:
          'Studio product turntable shot. The camera is locked off and does not move. The energy ' +
          'drink can rotates smoothly and continuously about its own vertical axis, completing ' +
          'exactly one full 360 degree rotation at constant speed over the whole clip, ending at ' +
          'the same orientation it started. The large VOLTIC wordmark exists ONLY ONCE, on the ' +
          'front face of the can — as the back of the can rotates into view it shows only a small ' +
          'plain nutrition facts panel and a barcode in thin white print on the matte black metal. ' +
          'Never duplicate the logo, never mirror the label. ' +
          'Lighting, background, reflections and condensation stay constant. Nothing else moves.',
        image_urls: [heroUrl],
        sound: false,
        duration: '5',
      },
      label: 'spin-360-v2',
      estimate: 60,
    });
    const f = join(RAW, 'spin.mp4');
    await download(r.urls[0], f);
    save('spin', r, f);
  },

  async stills() {
    const hero = manifest.results.hero;
    if (!hero) throw new Error('run hero first');
    const LOCK =
      'CRITICAL: reproduce the can from the reference image EXACTLY — a matte BLACK aluminum can, ' +
      'the word "VOLTIC" running VERTICALLY down the can in bold letters that fade from electric ' +
      'cyan at the top to acid lime green at the bottom, a small cyan lightning bolt above the ' +
      'wordmark. Do NOT redesign the label. Do NOT change the colours. No red, no silver, no ' +
      'navy, no gold, no wings, no other logos. ';
    const shots = [
      { name: 'splash',
        prompt: LOCK + 'This exact can frozen mid-air at a slight dynamic tilt, bursting through ' +
          'an explosive crown of clear water splash with ice cubes and droplets suspended around ' +
          'it. ' + STYLE + ' High-speed flash photography look, every droplet sharp.' },
      { name: 'macro',
        prompt: 'Extreme macro close-up of the surface of the exact same VOLTIC can from the ' +
          'reference image: the glowing cyan letters of the label seen at a steep angle, huge ' +
          'beads of condensation in razor-sharp focus rolling down the matte black aluminum, ' +
          'shallow depth of field. ' + STYLE },
      { name: 'trio',
        prompt: LOCK + 'THREE identical copies of this exact can standing on wet black slate, ' +
          'the middle can slightly forward, shallow puddle reflections, a fine mist of water ' +
          'spray hanging in the air. ' + STYLE },
    ];
    const onlyArg = process.argv[3];
    const wanted = onlyArg ? shots.filter((s) => onlyArg.split(',').includes(s.name)) : shots;
    for (const s of wanted) {
      const r = await kie.generate({
        model: 'nano-banana-2',
        input: { prompt: s.prompt, aspect_ratio: s.name === 'macro' ? '16:9' : '3:2', image_urls: [hero.url] },
        label: s.name,
        estimate: 10,
      });
      const f = join(RAW, `${s.name}.png`);
      await download(r.urls[0], f);
      save(s.name, r, f);
    }
  },

  async droplets() {
    const r = await kie.generate({
      model: 'nano-banana-2',
      input: {
        prompt: 'Macro photograph of scattered clear water droplets of varied sizes on a pure ' +
          'pitch-black glass surface, photographed straight on. Each droplet catches a faint ' +
          'electric cyan and lime green highlight on its edge. Pure black background between ' +
          'droplets, high contrast, sharp focus across the frame. No text, no objects, only droplets.',
        aspect_ratio: '16:9',
      },
      label: 'droplets',
      estimate: 10,
    });
    const f = join(RAW, 'droplets.png');
    await download(r.urls[0], f);
    save('droplets', r, f);
  },
};

const cmd = process.argv[2];
if (!cmds[cmd]) {
  console.log(`usage: node tools/gen.mjs <${Object.keys(cmds).join('|')}>`);
  process.exit(1);
}
console.log(`budget: ${manifest.spent}/${CEILING} credits spent so far\n`);
await cmds[cmd]();
console.log(`\nbudget after: ${ledger.spent}/${CEILING} credits`);
