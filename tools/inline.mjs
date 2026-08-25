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

html = html.replace(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/, (m, path) => {
  const css = readFileSync(join(DIST, path), 'utf8').trim();
  rmSync(join(DIST, path), { force: true });
  return `<style>${css}</style>`;
});

let entry = null;
html = html.replace(/<script type="module"[^>]*src="\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (m, path) => {
  entry = path;
  // the entry now lives inline at the document root, so its relative dynamic
  // imports must become absolute /assets/ paths
  const js = readFileSync(join(DIST, path), 'utf8').trim()
    .replaceAll('"./', '"/assets/').replaceAll("'./", "'/assets/");
  return `<script type="module">${js}</script>`;
});
// drop any preload hints for the inlined entry; lazy chunks (the 3D can) stay
// as real files in dist/assets and load on demand
if (entry) html = html.replaceAll(`<link rel="modulepreload" crossorigin href="/${entry}">`, '');
rmSync(join(DIST, entry), { force: true });

writeFileSync(htmlPath, html);
const chunks = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
console.log(`inlined → index.html ${(html.length / 1024).toFixed(1)}KB · lazy chunks kept: ${chunks.join(', ') || 'none'}`);
