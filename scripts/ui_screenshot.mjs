#!/usr/bin/env node
/**
 * scripts/ui_screenshot.mjs — UI verification harness (Task R19).
 *
 * Drives a real Chrome (headless, CDP) through the actual login form and
 * screenshots every page, so each frontend task has reproducible visual
 * evidence for docs/PROGRESS.md. Zero npm dependencies (Node >= 21).
 *
 * Usage:
 *   node scripts/ui_screenshot.mjs                          # defaults below
 *   node scripts/ui_screenshot.mjs --base http://localhost:5174 --out /tmp/shots
 *   node scripts/ui_screenshot.mjs --mobile                 # add 390x844 pass
 *
 * Options / env:
 *   --base   frontend origin        (default http://localhost:5173)
 *   --api    backend origin         (default http://localhost:8000)
 *   --out    output dir             (default ./ui-shots, gitignored)
 *   --user   / AEGIS_USER           (default admin)
 *   --pass   / AEGIS_PASS           (default DevPass123)
 *
 * Requires: backend + frontend dev servers running, Google Chrome installed.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = flag('base', 'http://localhost:5173');
const API = flag('api', 'http://localhost:8000');
const OUT = resolve(flag('out', 'ui-shots'));
const USER = flag('user', process.env.AEGIS_USER || 'admin');
const PASS = flag('pass', process.env.AEGIS_PASS || 'DevPass123');
const DO_MOBILE = args.includes('--mobile');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9330 + Math.floor(Math.random() * 60);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });

// ── Launch Chrome + CDP session ────────────────────────────────────────────
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=/tmp/aegis-shot-profile-${Date.now()}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });
chrome.on('exit', (c) => { console.error(`chrome exited ${c}`); process.exit(1); });

let version;
for (let i = 0; i < 40; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json(); break; }
  catch { await sleep(250); }
}
if (!version) { console.error('DevTools endpoint never came up'); process.exit(1); }

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolvePromise) => {
    const id = ++msgId;
    pending.set(id, resolvePromise);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
const evalJS = async (expression, awaitPromise = false) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId))
    .result?.result?.value;

async function navigate(url, settleMs = 3000) {
  await send('Page.navigate', { url }, sessionId);
  await sleep(settleMs);
}

async function shot(name, { width, height, mobile = false } = {}) {
  if (width) {
    await send('Emulation.setDeviceMetricsOverride',
      { width, height: height || 900, deviceScaleFactor: 2, mobile }, sessionId);
    await sleep(600);
  }
  const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  if (r.result?.data) {
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
    console.log('saved', `${OUT}/${name}.png`);
  } else {
    console.error('SHOT FAILED:', name);
    process.exitCode = 1;
  }
}

// ── Real login through the UI (sets both the cookie and localStorage) ──────
await navigate(`${BASE}/login`, 2000);
await evalJS(`(() => {
  const set = (el, v) => {
    const p = el instanceof HTMLInputElement ? HTMLInputElement.prototype : el.constructor.prototype;
    Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const [u, p] = document.querySelectorAll('.lp-form input');
  set(u, ${JSON.stringify(USER)}); set(p, ${JSON.stringify(PASS)});
  document.querySelector('.lp-btn').click();
})()`);
let ok = false;
for (let i = 0; i < 30; i++) {
  await sleep(400);
  if ((await evalJS('location.pathname')) !== '/login') { ok = true; break; }
}
if (!ok) { console.error('Login did not redirect — check credentials/servers'); process.exit(1); }
await sleep(2000);

// ── Pages ───────────────────────────────────────────────────────────────────
// [name, path, settle ms, extra query for a seeded day]
const today = new Date().toISOString().slice(0, 10);
const pages = [
  ['01-dashboard', '/', 3000, ''],
  ['02-grid', '/grid', 3500, ''],
  ['03-playback', `/playback?date=${today}`, 4500, ''],
  ['04-detections', '/detections', 4000, ''],
  ['05-faces', '/faces', 3500, ''],
  ['06-settings', '/settings', 3500, ''],
];
for (const [name, path, settle] of pages) {
  await navigate(`${BASE}${path}`, settle);
  await shot(name, { width: 1440, height: 900 });
}

if (DO_MOBILE) {
  await navigate(`${BASE}/playback?date=${today}`, 4000);
  await shot('07-playback-mobile', { width: 390, height: 844, mobile: true });
  await evalJS('document.querySelector(".app-shell__main").scrollBy(0, 900); void 0');
  await sleep(800);
  await shot('08-playback-mobile-scrolled', { width: 390, height: 844, mobile: true });
  await navigate(`${BASE}/`, 3000);
  await shot('09-dashboard-mobile', { width: 390, height: 844, mobile: true });
}

console.log(`\nAPI was ${API}; ${DO_MOBILE ? '9' : '6'} screenshots in ${OUT}`);
chrome.kill();
process.exit(process.exitCode || 0);
