#!/usr/bin/env node
/**
 * Post-build: inline the (small) CSS and JS bundles straight into index.html
 * so first paint needs exactly one document round trip — no render-blocking
 * stylesheet fetch, no module fetch.
 */
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(import.meta.dirname, '..', 'dist');
const htmlPath = join(DIST, 'index.html');
let html = readFileSync(htmlPath, 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/, (m, path) =>
  `<style>${readFileSync(join(DIST, path), 'utf8').trim()}</style>`);

html = html.replace(/<script type="module"[^>]*src="\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (m, path) =>
  `<script type="module">${readFileSync(join(DIST, path), 'utf8').trim()}</script>`);

if (html.includes('/assets/')) throw new Error('an asset reference survived inlining');
writeFileSync(htmlPath, html);
rmSync(join(DIST, 'assets'), { recursive: true });
console.log(`inlined → index.html ${(html.length / 1024).toFixed(1)}KB, assets/ removed`);
console.log('dist:', readdirSync(DIST).join(' '));
