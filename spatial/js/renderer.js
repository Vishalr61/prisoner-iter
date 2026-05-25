import { GRID_W, GRID_H, grid } from './world.js';

// Vivid bioluminescent palette — pops against dark background
const COLORS = [
  [  0, 255, 140],  // AllC  — vivid green
  [255,  45,  70],  // AllD  — hot red
  [ 50, 160, 255],  // TfT   — electric blue
  [190,  90, 255],  // Tf2T  — ultraviolet
  [255, 150,   0],  // Grim  — amber fire
  [255,  60, 200],  // Pvlv  — neon magenta
  [ 80, 210, 240],  // Rand  — ice cyan
  [  0, 230, 180],  // GTfT  — bioluminescent teal
  [255, 220,   0],  // STfT  — electric yellow
];

// Per-strategy brightness animation — smooth, organic, no aliasing
const ANIMS = [
  // AllC: slow peaceful breath
  (t)       => 0.72 + 0.28 * Math.sin(t * 1.6),
  // AllD: unstable shimmer (position-varied but smooth)
  (t, x, y) => 0.40 + 0.55 * (0.5 + 0.5 * Math.sin(t * 11.3 + x * 0.9 + y * 1.3)),
  // TfT: diagonal ripple wave
  (t, x, y) => 0.72 + 0.28 * Math.sin(t * 2.2 + (x + y) * 0.18),
  // Tf2T: slow deep pulse
  (t)       => 0.68 + 0.32 * Math.sin(t * 1.0),
  // Grim: nearly static with slow ember glow
  (t, x)    => 0.62 + 0.12 * Math.sin(t * 2.1 + x * 0.4),
  // Pavlov: smooth rhythmic throb (no aliasing)
  (t)       => 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3.4)),
  // Random: slow incoherent drift
  (t, x, y) => 0.45 + 0.50 * (0.5 + 0.5 * Math.sin(t * 7.1 + x * 1.7 + y * 2.3)),
  // GTfT: warm wandering glow
  (t, x, y) => 0.70 + 0.30 * Math.sin(t * 1.5 + x * 0.09 - y * 0.06),
  // STfT: nervous medium flicker
  (t, x, y) => 0.50 + 0.45 * (0.5 + 0.5 * Math.sin(t * 8.9 + y * 1.4 + x * 0.8)),
];

// Off-screen source canvas — drawn at grid resolution, scaled up by CSS/drawImage
const src    = document.createElement('canvas');
src.width    = GRID_W;
src.height   = GRID_H;
const srcCtx = src.getContext('2d');
let _img     = null;

// References set once by setup()
let _main, _glow;

export function setup(mainCanvas, glowCanvas) {
  _main = mainCanvas;
  _glow = glowCanvas;
}

export function render(timestamp, hoverCell) {
  const t = timestamp / 1000;

  // ── Write pixels ─────────────────────────────────────────────────────────
  if (!_img) _img = srcCtx.createImageData(GRID_W, GRID_H);
  const d = _img.data;

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i  = y * GRID_W + x;
      const s  = grid[i];
      const br = ANIMS[s](t, x, y);
      const c  = COLORS[s];
      const p  = i * 4;
      d[p]     = (c[0] * br) | 0;
      d[p + 1] = (c[1] * br) | 0;
      d[p + 2] = (c[2] * br) | 0;
      d[p + 3] = 255;
    }
  }
  srcCtx.putImageData(_img, 0, 0);

  // ── Draw to glow canvas (CSS applies heavy blur → luminous halos) ─────────
  if (_glow) {
    const gc = _glow.getContext('2d');
    gc.imageSmoothingEnabled = true;
    gc.imageSmoothingQuality = 'high';
    gc.clearRect(0, 0, _glow.width, _glow.height);
    gc.drawImage(src, 0, 0, _glow.width, _glow.height);
  }

  // ── Draw to main canvas (CSS applies soft blur → organic blobs) ──────────
  const ctx = _main.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, _main.width, _main.height);
  ctx.drawImage(src, 0, 0, _main.width, _main.height);
}

// Draw hover ring and brush preview on the UI canvas (no CSS filter)
export function renderUI(uiCanvas, hoverCell, brushRadius) {
  const ctx = uiCanvas.getContext('2d');
  ctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  if (!hoverCell) return;

  const cw = uiCanvas.width  / GRID_W;
  const ch = uiCanvas.height / GRID_H;
  const [hx, hy] = hoverCell;
  const cx = (hx + 0.5) * cw;
  const cy = (hy + 0.5) * ch;
  const r  = (brushRadius + 0.5) * Math.max(cw, ch);

  // Brush radius circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // Centre dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
}
