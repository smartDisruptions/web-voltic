#!/usr/bin/env node
/** Render label.html → public/tex/label.webp (albedo) + glow.webp (emissive). */
import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..');
mkdirSync(join(ROOT, 'public', 'tex'), { recursive: true });
const exe = join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const b = await chromium.launch({ executablePath: exe });
const p = await b.newPage({ viewport: { width: 2048, height: 1600 } });
await p.goto('file://' + join(ROOT, 'tools', 'label.html'));
await p.waitForTimeout(600); // fonts

const albedo = await p.screenshot();
await p.evaluate(() => document.body.classList.add('glow'));
await p.waitForTimeout(100);
const glow = await p.screenshot();
await b.close();

await sharp(albedo).webp({ quality: 92 }).toFile(join(ROOT, 'public', 'tex', 'label.webp'));
await sharp(glow).webp({ quality: 88 }).toFile(join(ROOT, 'public', 'tex', 'glow.webp'));
console.log('textures written to public/tex/');
