#!/usr/bin/env node
/**
 * Render label.html → public/tex/label-<flavor>.webp (albedo) and
 * glow-<flavor>.webp (emissive) for every flavor. The can's whole wardrobe
 * comes from one authored HTML file.
 */
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { launch } from './browser.mjs';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'public', 'tex');
mkdirSync(OUT, { recursive: true });
const b = await launch();
const p = await b.newPage({ viewport: { width: 2048, height: 1600 } });

for (const f of ['original', 'citrus', 'storm']) {
  await p.goto('file://' + join(ROOT, 'tools', 'label.html') + '?f=' + f);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  const albedo = await p.screenshot();
  await p.evaluate(() => document.body.classList.add('glow'));
  await p.waitForTimeout(100);
  const glow = await p.screenshot();
  await sharp(albedo).webp({ quality: 90 }).toFile(join(OUT, `label-${f}.webp`));
  // the glow pass is mostly black — half resolution is visually identical
  await sharp(glow).resize(1024).webp({ quality: 86 }).toFile(join(OUT, `glow-${f}.webp`));
  console.log('rendered', f);
}
await b.close();
