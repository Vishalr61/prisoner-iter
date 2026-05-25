import { GRID_W, GRID_H, GRID_N, grid } from './world.js';

// Political map palette — earthy, distinct, readable on dark background
const COLORS = [
  [ 76, 175, 130], // AllC  — sage green
  [184,  53,  53], // AllD  — deep crimson
  [ 61, 111, 181], // TfT   — slate blue
  [123,  79, 168], // Tf2T  — muted purple
  [196, 144,  16], // Grim  — amber
  [192,  85,  40], // Pvlv  — burnt orange
  [ 90, 128, 149], // Rand  — steel blue-grey
  [ 45, 144,  96], // GTfT  — forest teal
  [154, 149,  24], // STfT  — olive
];

// Flash tracking — cells light up white when they flip strategy
const _prevGrid  = new Uint8Array(GRID_N);
const _changedAt = new Float32Array(GRID_N).fill(-9999);
const FLASH_MS   = 700;

// Off-screen source canvas drawn at grid resolution
const src    = document.createElement('canvas');
src.width    = GRID_W;
src.height   = GRID_H;
const srcCtx = src.getContext('2d');
let _img     = null;

let _main;

export function setup(mainCanvas) {
  _main = mainCanvas;
}

export function render(timestamp, hoverCell) {
  if (!_main) return;

  // ── Write one pixel per cell, with flash on strategy change ────────────
  if (!_img) _img = srcCtx.createImageData(GRID_W, GRID_H);
  const d = _img.data;

  for (let i = 0; i < GRID_N; i++) {
    const s = grid[i];
    const c = COLORS[s];
    let r = c[0], g = c[1], b = c[2];

    if (s !== _prevGrid[i]) {
      _changedAt[i] = timestamp;
      _prevGrid[i]  = s;
    }
    const age = timestamp - _changedAt[i];
    if (age < FLASH_MS) {
      const fl = (1 - age / FLASH_MS) * 0.82;
      r = (r + (255 - r) * fl) | 0;
      g = (g + (255 - g) * fl) | 0;
      b = (b + (255 - b) * fl) | 0;
    }

    const p = i * 4;
    d[p]     = r;
    d[p + 1] = g;
    d[p + 2] = b;
    d[p + 3] = 255;
  }
  srcCtx.putImageData(_img, 0, 0);

  const ctx = _main.getContext('2d');
  const W = _main.width, H = _main.height;
  const cw = W / GRID_W, ch = H / GRID_H;

  // ── Scale up — crisp territory blocks ──────────────────────────────────
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, W, H);

  // ── Territory borders — drawn at screen resolution ──────────────────────
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth   = 1.5;

  ctx.beginPath();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W - 1; x++) {
      if (grid[y * GRID_W + x] !== grid[y * GRID_W + x + 1]) {
        const px = Math.round((x + 1) * cw);
        ctx.moveTo(px, y * ch);
        ctx.lineTo(px, (y + 1) * ch);
      }
    }
  }
  ctx.stroke();

  ctx.beginPath();
  for (let y = 0; y < GRID_H - 1; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y * GRID_W + x] !== grid[(y + 1) * GRID_W + x]) {
        const py = Math.round((y + 1) * ch);
        ctx.moveTo(x * cw, py);
        ctx.lineTo((x + 1) * cw, py);
      }
    }
  }
  ctx.stroke();
}

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

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
}
