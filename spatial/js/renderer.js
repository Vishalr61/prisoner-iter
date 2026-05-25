import { GRID_W, GRID_H, grid, scores } from './world.js';

// RGB triples matching strategy hex colours (same order as STRATEGIES array)
const COLORS = [
  [74,  222, 128],  // AllC  #4ade80  green
  [248, 113, 113],  // AllD  #f87171  red
  [96,  165, 250],  // TfT   #60a5fa  blue
  [167, 139, 250],  // Tf2T  #a78bfa  violet
  [251, 146,  60],  // Grim  #fb923c  orange
  [232, 121, 249],  // Pvlv  #e879f9  fuchsia
  [148, 163, 184],  // Rand  #94a3b8  slate
  [ 52, 211, 153],  // GTfT  #34d399  emerald
  [251, 191,  36],  // STfT  #fbbf24  amber
];

// Per-strategy brightness animation — returns multiplier in [0,1]
// t = seconds, x/y = grid coords (0-indexed)
const ANIMS = [
  // AllC: slow, peaceful breath
  (t)       => 0.68 + 0.32 * Math.sin(t * 1.7),
  // AllD: chaotic high-freq flicker
  (t, x, y) => 0.28 + 0.62 * (0.5 + 0.5 * Math.sin(t * 37.3 + x * 8.7 + y * 13.1)),
  // TfT: ripple wave that travels diagonally
  (t, x, y) => 0.70 + 0.30 * Math.sin(t * 2.4 + (x + y) * 0.22),
  // Tf2T: deep, slow throb
  (t)       => 0.65 + 0.35 * Math.sin(t * 1.1),
  // Grim: almost static, brief glint
  (t, x, y) => 0.58 + 0.08 * Math.sin(t * 5.2 + x * 3.1 + y * 1.7),
  // Pavlov: rhythmic on-off throb
  (t)       => 0.50 + 0.50 * Math.abs(Math.sin(t * 3.6)),
  // Random: granular noise
  (t, x, y) => 0.35 + 0.60 * (0.5 + 0.5 * Math.sin(t * 19.1 + x * 5.3 + y * 7.9)),
  // GTfT: warm wandering glow
  (t, x, y) => 0.70 + 0.30 * Math.sin(t * 1.6 + x * 0.11 - y * 0.07),
  // STfT: nervous mid-freq flicker
  (t, x, y) => 0.52 + 0.42 * (0.5 + 0.5 * Math.sin(t * 12.7 + y * 5.9 + x * 2.1)),
];

// Off-screen grid canvas (GRID_W × GRID_H pixels)
const offscreen = document.createElement('canvas');
offscreen.width  = GRID_W;
offscreen.height = GRID_H;
const offCtx = offscreen.getContext('2d');
let _imgData = null;

export function render(canvas, timestamp, hoverCell) {
  const t   = timestamp / 1000;
  const ctx = canvas.getContext('2d');

  // ── Step 1: write pixels into ImageData ──────────────────────────────────
  if (!_imgData) _imgData = offCtx.createImageData(GRID_W, GRID_H);
  const d = _imgData.data;

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
  offCtx.putImageData(_imgData, 0, 0);

  // ── Step 2: scale up to display canvas (pixel-perfect) ───────────────────
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#07071a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

  // ── Step 3: hover highlight ───────────────────────────────────────────────
  if (hoverCell) {
    const cw = canvas.width  / GRID_W;
    const ch = canvas.height / GRID_H;
    const [hx, hy] = hoverCell;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(hx * cw + 0.5, hy * ch + 0.5, cw - 1, ch - 1);
  }
}
