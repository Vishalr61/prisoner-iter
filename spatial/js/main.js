import { STRATEGIES } from './strategies.js';
import {
  GRID_W, GRID_H, GRID_N,
  grid, scores,
  initRandom, step, paintCircle, getNeighbourStrategies, getGeneration,
} from './world.js';
import { render, renderUI, setup } from './renderer.js';

// ── App state ──────────────────────────────────────────────────────────────
let paused       = false;
let stepsPerSec  = 4;
let brushRadius  = 3;
let paintIdx     = 2;   // default: TfT
let hoverCell    = null;
let isPainting   = false;
let payoffs      = { R: 3, T: 5, P: 1, S: 0 };
let payoffMod    = null;
let eventTimer   = null;
const MATCH_ROUNDS = 5;

// ── Canvases ────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('world');
const uiCanvas = document.getElementById('world-ui');

function resizeCanvas() {
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = uiCanvas.width  = w;
  canvas.height = uiCanvas.height = h;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
function init() {
  resizeCanvas();
  setup(canvas);
  window.addEventListener('resize', () => { resizeCanvas(); setup(canvas); });
  initRandom();
  buildStratPicker();
  buildPopBars();
  wireSpeedBtns();
  wireBrushBtns();
  wireEventBtns();
  wirePlayControls();
  wireCanvas();
  wireIntro();
  requestAnimationFrame(loop);
}

function wireIntro() {
  const overlay = document.getElementById('intro-overlay');
  const dismiss = () => {
    overlay.style.transition = 'opacity .4s ease';
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 400);
  };
  document.getElementById('intro-start').addEventListener('click', dismiss);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
}

// ── Game loop ──────────────────────────────────────────────────────────────
let lastStep = 0;
function loop(ts) {
  const pay = payoffMod || payoffs;

  if (!paused) {
    if (stepsPerSec === 0) {
      // Warp: multiple steps per frame
      for (let k = 0; k < 4; k++) step(pay, MATCH_ROUNDS);
    } else if (ts - lastStep >= 1000 / stepsPerSec) {
      step(pay, MATCH_ROUNDS);
      lastStep = ts;
    }
  }

  render(ts, hoverCell);
  renderUI(uiCanvas, hoverCell, brushRadius);
  updateHUD();
  requestAnimationFrame(loop);
}

// ── HUD update ────────────────────────────────────────────────────────────
const _counts = new Uint32Array(STRATEGIES.length);

function updateHUD() {
  document.getElementById('gen-num').textContent = getGeneration();

  _counts.fill(0);
  for (let i = 0; i < GRID_N; i++) _counts[grid[i]]++;

  let maxI = 0;
  STRATEGIES.forEach((_, i) => {
    const pct = (_counts[i] / GRID_N * 100);
    const fill = document.getElementById(`pf-${i}`);
    const lbl  = document.getElementById(`pp-${i}`);
    if (fill) fill.style.width = pct.toFixed(1) + '%';
    if (lbl)  lbl.textContent  = pct.toFixed(0) + '%';
    if (_counts[i] > _counts[maxI]) maxI = i;
  });

  const leader    = STRATEGIES[maxI];
  const leaderPct = (_counts[maxI] / GRID_N * 100).toFixed(0);
  const ldot = document.getElementById('leader-dot');
  const lname = document.getElementById('leader-name');
  const lpct  = document.getElementById('leader-pct');
  if (ldot)  ldot.style.background = leader.color;
  if (lname) { lname.textContent = leader.short; lname.style.color = leader.color; }
  if (lpct)  lpct.textContent = leaderPct + '%';
}

// ── Strategy picker ───────────────────────────────────────────────────────
function buildStratPicker() {
  const el = document.getElementById('strat-picker');
  STRATEGIES.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'spick-item';

    const btn = document.createElement('button');
    btn.className = 'spick' + (i === paintIdx ? ' active' : '');
    btn.style.background = s.color;
    btn.style.setProperty('--sc', s.color);
    btn.title = s.name;

    const lbl = document.createElement('span');
    lbl.className = 'spick-label';
    lbl.textContent = s.short;
    lbl.style.color = s.color;

    item.appendChild(btn);
    item.appendChild(lbl);
    item.addEventListener('click', () => {
      document.querySelectorAll('.spick').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      paintIdx = i;
    });
    el.appendChild(item);
  });
}

// ── Population bars ───────────────────────────────────────────────────────
function buildPopBars() {
  const el = document.getElementById('pop-bars');
  STRATEGIES.forEach((s, i) => {
    el.insertAdjacentHTML('beforeend', `
      <div class="pop-item" title="${s.name}">
        <span class="pop-abbr" style="color:${s.color}">${s.short}</span>
        <div class="pop-track">
          <div class="pop-fill" id="pf-${i}" style="background:${s.color}"></div>
        </div>
        <span class="pop-pct" id="pp-${i}">--%</span>
      </div>
    `);
  });
}

// ── Speed buttons ─────────────────────────────────────────────────────────
function wireSpeedBtns() {
  document.querySelectorAll('.spd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.spd-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      stepsPerSec = +btn.dataset.spd;
    });
  });
}

// ── Brush buttons ─────────────────────────────────────────────────────────
function wireBrushBtns() {
  document.querySelectorAll('.brush-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      brushRadius = +btn.dataset.r;
    });
  });
}

// ── Play / pause / step ───────────────────────────────────────────────────
function wirePlayControls() {
  const btnPause = document.getElementById('btn-pause');
  const btnStep  = document.getElementById('btn-step');

  btnPause.addEventListener('click', () => {
    paused = !paused;
    btnPause.textContent = paused ? '▶' : '⏸';
    btnPause.classList.toggle('lit', paused);
  });

  btnStep.addEventListener('click', () => {
    step(payoffMod || payoffs, MATCH_ROUNDS);
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); btnPause.click(); }
    if (e.code === 'ArrowRight') { e.preventDefault(); step(payoffMod || payoffs, MATCH_ROUNDS); }
  });
}

// ── Environmental events ──────────────────────────────────────────────────
function wireEventBtns() {
  document.querySelectorAll('.evt-btn').forEach(btn => {
    const meta = EVENT_META[btn.dataset.evt];
    if (meta?.tooltip) btn.dataset.tooltip = meta.tooltip;
    btn.addEventListener('click', () => triggerEvent(btn.dataset.evt, btn));
  });
}

const EVENT_META = {
  famine:   { label: '☠  Famine',   sub: 'Cooperation yields less. Defectors surge.',  tooltip: 'Mutual cooperation earns 45% less for 18s — defectors gain ground.',      mod: p => ({ ...p, R: p.R * 0.55, S: 0 }) },
  paradise: { label: '✦  Paradise', sub: 'Cooperation is richly rewarded.',            tooltip: 'Cooperation bonus +2.5 pts for 18s — cooperators thrive.',                 mod: p => ({ ...p, R: p.R + 2.5, S: p.S + 1 }) },
  plague:   { label: '⚗  Plague',   sub: '15% of organisms mutate randomly.',          tooltip: '15% of cells instantly mutate to a random strategy.',                      mod: null },
  invasion: { label: '⚔  Invasion', sub: 'A wave of strangers floods the south-east.', tooltip: 'The south-east is flooded with a single random strategy.',                 mod: null },
  reset:    { label: '↺  Reset',    sub: 'The world begins again.',                    tooltip: 'Randomise all territories and restart from scratch.',                       mod: null },
};

function triggerEvent(name, btn) {
  const meta = EVENT_META[name];
  if (!meta) return;

  showFlash(meta.label, meta.sub);

  clearTimeout(eventTimer);
  payoffMod = null;

  switch (name) {
    case 'famine':
    case 'paradise':
      payoffMod  = meta.mod(payoffs);
      eventTimer = setTimeout(() => { payoffMod = null; }, 18000);
      btn.classList.add('evt-active');
      setTimeout(() => btn.classList.remove('evt-active'), 18000);
      break;

    case 'plague': {
      const kill = Math.floor(GRID_N * 0.15);
      const n    = STRATEGIES.length;
      for (let k = 0; k < kill; k++) {
        grid[Math.floor(Math.random() * GRID_N)] = Math.floor(Math.random() * n);
      }
      break;
    }

    case 'invasion': {
      const invStrat = Math.floor(Math.random() * STRATEGIES.length);
      const x0 = Math.floor(GRID_W * 0.55), y0 = Math.floor(GRID_H * 0.55);
      for (let y = y0; y < GRID_H; y++) {
        for (let x = x0; x < GRID_W; x++) {
          if (Math.random() < 0.82) grid[y * GRID_W + x] = invStrat;
        }
      }
      break;
    }

    case 'reset':
      initRandom();
      break;
  }
}

function showFlash(label, sub) {
  const el = document.getElementById('evt-flash');
  el.innerHTML = `<div class="flash-title">${label}</div><div class="flash-sub">${sub}</div>`;
  el.style.display = 'flex';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 2400);
}

// ── Canvas interactions ───────────────────────────────────────────────────
function toGrid(e) {
  const r = uiCanvas.getBoundingClientRect();
  return [
    Math.floor((e.clientX - r.left) / r.width  * GRID_W),
    Math.floor((e.clientY - r.top)  / r.height * GRID_H),
  ];
}

function wireCanvas() {
  const hint = document.getElementById('canvas-hint');
  const dismissHint = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      hint.classList.add('hidden');
    };
  })();
  setTimeout(dismissHint, 7000);

  uiCanvas.addEventListener('mousedown', e => {
    dismissHint();
    isPainting = true;
    const [cx, cy] = toGrid(e);
    paintCircle(cx, cy, paintIdx, brushRadius);
  });

  uiCanvas.addEventListener('mousemove', e => {
    const [cx, cy] = toGrid(e);
    if (isPainting) paintCircle(cx, cy, paintIdx, brushRadius);
    hoverCell = [cx, cy];
    showInspector(e, cx, cy);
  });

  uiCanvas.addEventListener('mouseup',    () => { isPainting = false; });
  uiCanvas.addEventListener('mouseleave', () => {
    isPainting = false;
    hoverCell  = null;
    document.getElementById('inspector').style.display = 'none';
  });
}

// Inspector order: maps flat NB index [0..7] → 3×3 grid position
// NB order: TL,T,TR,L,R,BL,B,BR  (from world.js NB_DX/NB_DY)
// 3×3 slot order: TL,T,TR,L,C,R,BL,B,BR → NB indices: 0,1,2,3,·,4,5,6,7
const NB_SLOT = [0, 1, 2, 3, -1, 4, 5, 6, 7];

function showInspector(e, cx, cy) {
  if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return;

  const si  = grid[cy * GRID_W + cx];
  const s   = STRATEGIES[si];
  const sc  = scores[cy * GRID_W + cx];
  const nbs = getNeighbourStrategies(cx, cy);

  const nbGrid = NB_SLOT.map(k =>
    k === -1
      ? `<div class="nb-cell nb-center" style="background:${s.color}"></div>`
      : `<div class="nb-cell" style="background:${STRATEGIES[nbs[k]].color}" title="${STRATEGIES[nbs[k]].short}"></div>`
  ).join('');

  const insp = document.getElementById('inspector');
  insp.style.display = 'flex';

  // Keep tooltip on screen
  let lx = e.clientX + 18, ly = e.clientY - 8;
  if (lx + 220 > window.innerWidth)  lx = e.clientX - 228;
  if (ly + 180 > window.innerHeight - 64) ly = e.clientY - 172;
  insp.style.left = lx + 'px';
  insp.style.top  = ly + 'px';

  insp.innerHTML = `
    <div class="insp-name" style="color:${s.color}">${s.name}</div>
    <div class="insp-score">Score: <strong>${sc.toFixed(1)}</strong> pts this gen</div>
    <div class="insp-desc">${s.desc}</div>
    <div class="insp-nb-grid">${nbGrid}</div>
    <div class="insp-nb-label">neighbourhood</div>
  `;
}

init();
