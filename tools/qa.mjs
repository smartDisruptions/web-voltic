#!/usr/bin/env node
/** Headless QA: screenshots at key scroll positions + console error dump. */
import { join } from 'node:path';
import { launch } from './browser.mjs';

const OUT = process.argv[3] || './qa-out';
const URL = process.argv[2] || 'http://localhost:5199/?full';

const W = Number(process.env.QA_W) || 1440;
const H = Number(process.env.QA_H) || 900;
const browser = await launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// every scene, including the pinned ones at a few points of their scroll
const stops = await page.evaluate(() => {
  const top = (id) => { let t = 0; for (let n = document.getElementById(id); n; n = n.offsetParent) t += n.offsetTop; return t; };
  const pin = (id, f) => {
    const el = document.getElementById(id);
    const stage = el.querySelector('[class$="-stage"]');
    return top(id) + stage.offsetTop * 0 + (el.offsetHeight - stage.offsetHeight) * f;
  };
  return {
    hero: 0,
    'spin-10': pin('spin', 0.1), 'spin-31-back': pin('spin', 0.31), 'spin-90-facts': pin('spin', 0.9),
    charge: top('charge') + innerHeight * 0.4,
    circuit: top('circuit') + innerHeight * 0.6,
    'flavor-original': pin('flavors', 0.14), 'flavor-citrus': pin('flavors', 0.52), 'flavor-storm': pin('flavors', 0.88),
    shoot: pin('shoot', 0.5),
    'cta-open': document.documentElement.scrollHeight,
  };
});

for (const [name, y] of Object.entries(stops)) {
  await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), y);
  await page.waitForTimeout(1600); // let the lerp settle
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`✓ ${name} @ ${Math.round(y)}`);
}

console.log(errors.length ? `\nCONSOLE ERRORS:\n${errors.join('\n')}` : '\nno console errors');
await browser.close();
