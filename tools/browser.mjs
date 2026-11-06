/**
 * One place that knows where a headless Chromium lives, so every tool runs on
 * Josh's Mac and in a cloud session alike. Override with CHROME_PATH.
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CANDIDATES = [
  process.env.CHROME_PATH,
  join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  '/opt/pw-browsers/chromium',
].filter(Boolean);

export function launch(opts = {}) {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), ...opts });
}
