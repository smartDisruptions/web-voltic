#!/usr/bin/env node
/**
 * Regression suite: axe-core at several scroll states, network 404 sweep,
 * console/page errors, keyboard order + skip link, reduced-motion render,
 * and screenshots across viewports. Exits non-zero on any failure.
 *
 *   node tools/regression.mjs <url> <outdir>
 */
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const URL = process.argv[2] || 'http://localhost:5199';
const OUT = process.argv[3] || './regression-out';
mkdirSync(OUT, { recursive: true });
const exe = join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const axeSrc = readFileSync(join(import.meta.dirname, '..', 'node_modules/axe-core/axe.min.js'), 'utf8');

const failures = [];
const b = await chromium.launch({ executablePath: exe });

// ── main pass: errors, 404s, axe, screenshots ────────────────────────────
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], bad = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(axeSrc);

  const axeIssues = new Map();
  for (const f of [0, 0.15, 0.28, 0.5, 0.75, 0.95]) {
    await p.evaluate((fr) => scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * fr, behavior: 'instant' }), f);
    await p.waitForTimeout(900);
    await p.screenshot({ path: join(OUT, `d-${Math.round(f * 100)}.png`) });
    const res = await p.evaluate(() => axe.run(document, { resultTypes: ['violations'] }));
    for (const v of res.violations) axeIssues.set(v.id, v);
  }
  await p.waitForTimeout(1500); // let idle frame loading finish before 404 tally

  if (axeIssues.size) failures.push(`axe: ${[...axeIssues.keys()].join(', ')}`);
  if (errors.length) failures.push(`js/console errors: ${errors.join(' | ')}`);
  if (bad.length) failures.push(`bad responses: ${bad.join(' | ')}`);
  console.log(`axe: ${axeIssues.size} violation(s) · errors: ${errors.length} · non-200s: ${bad.length}`);

  // keyboard: first Tab must reveal the skip link; all stops must have visible outline
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await p.keyboard.press('Tab');
  await p.waitForTimeout(350); // the skip link slides in over 0.2s
  const skip = await p.evaluate(() => {
    const el = document.activeElement;
    return el.className === 'skip-link' && el.getBoundingClientRect().top >= 0;
  });
  if (!skip) failures.push('skip link is not the first, visible tab stop');
  let noOutline = 0;
  for (let i = 0; i < 8; i++) {
    await p.keyboard.press('Tab');
    const ok = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none');
    if (!ok) noOutline++;
  }
  if (noOutline) failures.push(`${noOutline} tab stops lack a visible outline`);
  console.log(`keyboard: skip-link ${skip ? 'ok' : 'MISSING'} · outlines ok on ${8 - noOutline}/8 stops`);
  await p.close();
}

// ── viewport passes ──────────────────────────────────────────────────────
for (const [name, w, h] of [['mobile', 390, 844], ['landscape', 844, 390], ['wide', 1920, 1080]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: join(OUT, `${name}-hero.png`) });
  await p.evaluate(() => scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * 0.9, behavior: 'instant' }));
  await p.waitForTimeout(900);
  await p.screenshot({ path: join(OUT, `${name}-deep.png`) });
  if (errs.length) failures.push(`${name}: ${errs.join(' | ')}`);
  console.log(`${name} ${w}×${h}: ${errs.length ? 'ERRORS' : 'ok'}`);
  await p.close();
}

// ── reduced motion: the show MUST still run (deliberate site policy) ─────
// Motion is this site's product, so prefers-reduced-motion is intentionally
// not honored — this pass asserts the animations still play under it.
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  // scroll through the page so scroll-driven effects get their chance to fire
  for (const f of [0.2, 0.5, 0.8, 1]) {
    await p.evaluate((fr) => scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * fr, behavior: 'instant' }), f);
    await p.waitForTimeout(900);
  }
  const checks = await p.evaluate(() => ({
    revealsFired: [...document.querySelectorAll('.reveal')].filter((el) => el.classList.contains('is-in')).length > 10,
    spinAlive: !!document.querySelector('.spin-3d canvas') || !!document.querySelector('.spin-canvas'),
    cardShown: parseFloat(getComputedStyle(document.querySelector('.spin-card')).opacity) === 1,
    counterRan: document.querySelector('.count[data-count="200"]').textContent === '200',
  }));
  await p.screenshot({ path: join(OUT, 'reduced-motion.png') });
  for (const [k, v] of Object.entries(checks)) if (!v) failures.push(`forced-motion under reduce: ${k} failed`);
  if (errs.length) failures.push(`reduced-motion errors: ${errs.join(' | ')}`);
  console.log('forced-motion under reduce:', Object.entries(checks).map(([k, v]) => `${k}=${v}`).join(' '));
  await p.close();
}

await b.close();
console.log(failures.length ? `\n✗ FAILURES:\n- ${failures.join('\n- ')}` : '\n✓ regression PASSED');
process.exit(failures.length ? 1 : 0);
