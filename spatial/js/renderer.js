import { GRID_W, GRID_H, grid } from './world.js';

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

  // ── Write one pixel per cell ────────────────────────────────────────────
  if (!_img) _img = srcCtx.createImageData(GRID_W, GRID_H);
  const d = _img.data;
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    const c = COLORS[grid[i]];
    const p = i * 4;
    d[p]     = c[0];
    d[p + 1] = c[1];
    d[p + 2] = c[2];
    d[p + 3] = 255;
  }
  srcCtx.putImageData(_img, 0, 0);

  const ctx = _main.getContext('2d');
  const W = _main.width, H = _main.height;
  const cw = W / GRID_W, ch = H / GRID_H;

  // ── Scale up — crisp territory blocks, no blurring ─────────────────────
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, W, H);

  // ── Territory borders — drawn at screen resolution ──────────────────────
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth   = 1.5;

  // Vertical borders (right edge of each column)
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

  // Horizontal borders (bottom edge of each row)
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
