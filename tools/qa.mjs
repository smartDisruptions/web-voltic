#!/usr/bin/env node
/** Headless QA: screenshots at key scroll positions + console error dump. */
import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { homedir } from 'node:os';

const OUT = process.argv[3] || '/private/tmp/claude-501/-Users-joshadmin-Documents-src/5efd4a2d-4cb0-4ecd-898a-3c813291bbb5/scratchpad/qa';
const URL = process.argv[2] || 'http://localhost:5199';
const exe = join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell');

const W = Number(process.env.QA_W) || 1440;
const H = Number(process.env.QA_H) || 900;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const stops = await page.evaluate(() => {
  const spin = document.querySelector('.spin');
  const el = (s) => document.querySelector(s);
  return {
    hero: 0,
    'spin-25': spin.offsetTop + (spin.offsetHeight - innerHeight) * 0.25,
    'spin-50': spin.offsetTop + (spin.offsetHeight - innerHeight) * 0.5,
    'spin-90': spin.offsetTop + (spin.offsetHeight - innerHeight) * 0.9,
    splash: el('#charge').offsetTop + 300,
    macro: el('.macro').offsetTop - 200,
    flavors: el('#flavors').offsetTop + 300,
    cta: el('#cta').offsetTop,
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
