/**
 * Renders one game to an MP4, frame by frame:
 *
 *   npm run video -- runs/<run>/g017.json [--fps 30] [--move-ms 1500] [--out file.mp4]
 *
 * Frames come from the game file, not from a clock. The viewer opens in record
 * mode, and for each frame the script asks it to draw one exact moment
 * (window.replay.renderAt), takes a screenshot and pipes it to ffmpeg. The
 * same game gives the same video every time, at any speed, and a slow machine
 * gives a slow export, never a stuttering video.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import type { GameRecord } from '../src/record/types.js';

export interface VideoOptions {
  fps: number;
  moveMs: number;
  onProgress?: (done: number, total: number) => void;
}

export async function renderVideo(gameFile: string, out: string, options: VideoOptions): Promise<void> {
  const server = await createServer({ configFile: 'vite.config.ts', server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('The viewer did not start');

  // The full Chromium in new headless mode: it renders as a real Chrome does,
  // and it is the build `npx playwright install chromium` fetches.
  const browser = await chromium.launch({ channel: 'chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(`${url}?game=${encodeURI(gameFile)}&record=1&moveMs=${options.moveMs}`);
    await page.waitForFunction(() => Boolean(window.replay), undefined, { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);

    const ffmpeg = spawn(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(options.fps), '-c:v', 'png', '-i', '-',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    const closed = once(ffmpeg, 'close');

    const total = await page.evaluate(() => window.replay!.durationMs());
    const frames = Math.ceil((total / 1000) * options.fps) + 1;
    let lastKey = '';
    let png: Buffer = Buffer.alloc(0);

    for (let i = 0; i < frames; i++) {
      const key = await page.evaluate((ms) => window.replay!.renderAt(ms), (i * 1000) / options.fps);
      // Most frames hold still between moves: same key, same picture.
      if (key !== lastKey) {
        png = await page.screenshot({ type: 'png' });
        lastKey = key;
      }
      if (!ffmpeg.stdin.write(png)) await once(ffmpeg.stdin, 'drain');
      if (i % options.fps === 0 || i === frames - 1) options.onProgress?.(i + 1, frames);
    }

    ffmpeg.stdin.end();
    const [code] = await closed;
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

if (resolve(process.argv[1] ?? '') === resolve(import.meta.filename)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      fps: { type: 'string', default: '30' },
      'move-ms': { type: 'string', default: '1500' },
      out: { type: 'string' },
    },
  });

  const file = positionals[0];
  if (!file || !existsSync(file)) {
    console.error('Usage: npm run video -- runs/<run>/g017.json [--fps 30] [--move-ms 1500] [--out file.mp4]');
    process.exit(1);
  }
  const gameFile = relative(process.cwd(), resolve(file));
  if (!gameFile.startsWith('runs/')) {
    console.error('The game file must be inside runs/, where the viewer can read it.');
    process.exit(1);
  }
  const record = JSON.parse(readFileSync(gameFile, 'utf8')) as GameRecord;
  if (!record.termination) {
    console.error(`${record.id} is still playing. Export it when the game ends.`);
    process.exit(1);
  }

  const out = values.out ?? gameFile.replace(/\.json$/, '.mp4');
  const fps = Number(values.fps);
  const moveMs = Number(values['move-ms']);
  console.log(`${record.white.name} vs ${record.black.name} · ${record.id} · ${record.moves.length} plies`);
  console.log(`frame   1920 × 1080 · ${fps} fps · ${moveMs / 1000} s for each move${record.engine ? '' : ' · not graded yet'}`);

  const started = Date.now();
  await renderVideo(gameFile, out, {
    fps,
    moveMs,
    onProgress: (done, total) => {
      const width = 24;
      const filled = Math.round((done / total) * width);
      process.stdout.write(`\rframes  ${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${done} / ${total}`);
    },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\n✓ ${out}  (rendered in ${secs} s)`);
}
