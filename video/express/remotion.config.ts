// Render settings for every `npx remotion` command in this project (CLI flags still override).
// Restart the Studio after editing this file.
import { existsSync, readdirSync } from 'node:fs';
import { Config } from '@remotion/cli/config';

// Which Chromium renders the frames. Order: an explicit path (env), a path baked in by
// scripts/new-film.sh --browser, a sandbox-installed headless shell, else Remotion's own download.
// Sandboxes often block Remotion's browser download but ship a Chromium headless shell.
const PINNED_BROWSER: string | null = null;

const sandboxBrowser = (): string | null => {
  const root = '/opt/pw-browsers';
  if (!existsSync(root)) return null;
  const found = readdirSync(root)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])) // newest build first
    .map((d) => `${root}/${d}/chrome-linux/headless_shell`)
    .find((p) => existsSync(p));
  return found ?? null;
};

const browser = process.env.REMOTION_BROWSER || process.env.CHROMIUM_PATH || PINNED_BROWSER || sandboxBrowser();
if (browser) Config.setBrowserExecutable(browser);

// ANGLE gives the GPU code paths (WebGL, effects) a working GL backend in headless Linux.
Config.setChromiumOpenGlRenderer('angle');
// Intermediate frames: JPEG q95 (Remotion's default is q80, which blocks up soft gradients).
// Use --image-format=png for dark gradient-heavy shots or alpha.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
// Deliverables: convert and tag every encode as BT.709 limited range, the way HD players decode
// it (Remotion's 'default' writes untagged full-range BT.601, so a preview judged on one player
// differs from the master on another). scripts/render.sh overrides this with
// --color-space=default only for its intermediates (the speed-measurement pass and the sub-frame
// stream), which accumulate.py decodes by their own tags. See references/finishing.md §4.
Config.setColorSpace('bt709');
// Font loading and measurement can take a while on a cold, busy machine.
Config.setDelayRenderTimeoutInMilliseconds(120000);
Config.setOverwriteOutput(true);
// Concurrency stays at Remotion's default (about half the cores); pass --concurrency=N to change it.
