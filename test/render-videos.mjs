// Renders the synthetic plank timelines into MJPEG files usable as a fake webcam:
//   chromium --use-fake-device-for-media-stream --use-file-for-fake-video-capture=out/front.y4m
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TIMELINES, FPS, paramsAt, duration } from './timelines.mjs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8765/test/render.html');
await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
for (const [view, timeline] of Object.entries(TIMELINES)) {
  const dir = `out/frames-${view}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const n = Math.round(duration(timeline) * FPS);
  for (let i = 0; i < n; i++) {
    const p = paramsAt(timeline, i / FPS);
    const url = await page.evaluate(([p, view, first]) => window.renderFrame({ ...p, resetCamera: first }, view), [p, view, i === 0]);
    writeFileSync(`${dir}/${String(i).padStart(4, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${dir}/%04d.png`, '-pix_fmt', 'yuv420p', `out/${view}.y4m`]);
  console.log(`${view}: ${n} frames -> out/${view}.y4m`);
}
await browser.close();
