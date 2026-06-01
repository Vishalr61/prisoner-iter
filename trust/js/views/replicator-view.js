// Replicator view — Phase 4 (Session A).
// Real evolutionary dynamics. Each generation, strategies that score
// well grow; the rest shrink. The population becomes what survives.
// Visualized as a stacked area chart over time — bottom-to-top order
// by final population (winners broaden, losers shrink visibly to the
// top edge).
//
// Public API: initReplicatorView(navigate), showReplicator().

import { REGISTRY }      from '../../../core/registry.js';
import { runReplicator } from '../../../core/replicator.js';

const CANONICAL_IDS = ['allC', 'allD', 'tft', 'grim', 'tf2t', 'pavlov', 'gtft', 'stft', 'rand'];

// Default environment for the canonical evolutionary run.
const DEFAULT_STATE = () => ({
  generations: 80,
  noise:       0,
  rounds:      50,
  speed:       1,        // 1× / 2× / 4×
  playing:     false,
  currentGen:  0,        // animation cursor, 0..result.history.length-1
});

let state = DEFAULT_STATE();
let result = null;     // cached { history, ids, env, finalPop }
let go = null;
let _raf = null;       // animation frame id
let _lastTick = 0;

const FRAMES_PER_GEN = 8;   // base frames per generation at 1× speed (60fps → ~7.5gen/s)

export function initReplicatorView(navigateFn) { go = navigateFn; }

export function showReplicator() {
  state = DEFAULT_STATE();
  const el = document.getElementById('view-replicator');
  computeRun();
  buildDOM(el);
  wireEvents(el);
  drawChart(el);
  play(el);
}

// ── Run the simulation ────────────────────────────────────────────────────────

function computeRun() {
  const specs = CANONICAL_IDS.map(id => REGISTRY[id]);
  result = runReplicator(specs, {
    generations: state.generations,
    rounds:      state.rounds,
    noise:       state.noise,
    masterSeed:  1,
    mutation:    0,
  });
  // Drawing order — bottom-to-top by FINAL population.
  // Winners on bottom (big and stable), losers on top (visibly shrinking).
  result.drawOrder = [...result.ids].sort(
    (a, b) => (result.finalPop[b] - result.finalPop[a])
  );
}

// ── DOM ───────────────────────────────────────────────────────────────────────

function buildDOM(el) {
  el.innerHTML = `
    <div class="wsp repl" style="--bld-color:#fbbf24">
      <header class="wsp-masthead">
        <div class="wsp-kicker"><span class="dot"></span>The Trust Game · Evolutionary Dynamics</div>
        <h1 class="wsp-title">Watch them <em>evolve</em>.</h1>
        <p class="wsp-deck">Each generation, the strategies that scored well grow. The rest shrink. Over enough time, the population becomes what survives — and the question becomes <em>which strategies survive</em>.</p>
      </header>

      <div class="repl-grid">
        <div class="repl-controls">
          <div class="section">
            <div class="sec-num">01</div>
            <div class="sec-body">
              <div class="sec-head"><span class="sec-title">Generations</span><span class="sec-readout"><span class="sec-pct" data-gens-pct>${state.generations}</span></span></div>
              <p class="note">How long the population evolves. After 40 or so, the long-run winner is usually clear.</p>
              <div class="slider-wrap">
                <input class="slider" type="range" min="20" max="200" step="5" value="${state.generations}" style="--fill:${(state.generations - 20) / 180 * 100}%" data-field="generations" />
                <div class="scale-ticks"><span>20</span><span>100</span><span>200</span></div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="sec-num">02</div>
            <div class="sec-body">
              <div class="sec-head"><span class="sec-title">Noise</span><span class="sec-readout"><span class="sec-region" data-noise-region>${noiseRegion(state.noise)}</span><span class="sec-pct" data-noise-pct>${pct(state.noise)}</span></span></div>
              <p class="note">Chance any move flips by accident. Strict strategies bleed under noise; forgiving ones recover.</p>
              <div class="slider-wrap">
                <input class="slider" type="range" min="0" max="0.3" step="0.01" value="${state.noise}" style="--fill:${state.noise / 0.3 * 100}%" data-field="noise" />
                <div class="scale-ticks"><span>0%</span><span>15%</span><span>30%</span></div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="sec-num">03</div>
            <div class="sec-body">
              <div class="sec-head"><span class="sec-title">Match length</span><span class="sec-readout"><span class="sec-pct" data-rounds-pct>${state.rounds}</span><span class="sec-region">rounds</span></span></div>
              <p class="note">Rounds per match within each generation. Longer matches favor strategies that build trust.</p>
              <div class="slider-wrap">
                <input class="slider" type="range" min="10" max="200" step="5" value="${state.rounds}" style="--fill:${(state.rounds - 10) / 190 * 100}%" data-field="rounds" />
                <div class="scale-ticks"><span>10</span><span>100</span><span>200</span></div>
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="wsp-btn wsp-btn-primary" data-action="restart">Restart</button>
            <button class="wsp-btn wsp-btn-ghost" data-action="back">Back</button>
          </div>
        </div>

        <div class="repl-stage">
          <div class="repl-arena">
            <div class="repl-arena-head">
              <div class="repl-arena-meta">
                <span class="arena-eyebrow">Generation <span class="repl-genlabel" data-gen-label>0</span> of <span data-gen-total>${state.generations}</span></span>
                <div class="repl-transport">
                  <button class="repl-btn-play" data-action="playpause">${state.playing ? '⏸' : '▶'}</button>
                  <div class="repl-speed">
                    ${[1, 2, 4].map(s => `<button class="repl-spd${s === state.speed ? ' on' : ''}" data-speed="${s}">${s}×</button>`).join('')}
                  </div>
                </div>
              </div>
              <div class="repl-legend" data-legend></div>
            </div>

            <canvas class="repl-chart" data-chart></canvas>

            <div class="repl-verdict" data-verdict></div>
          </div>
        </div>
      </div>
    </div>
  `;
  drawLegend(el);
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function drawLegend(el) {
  const order = result.drawOrder;
  const html = order.map(id => {
    const final = (result.finalPop[id] * 100).toFixed(1);
    const fade  = result.finalPop[id] < 0.02 ? ' faded' : '';
    return `
      <div class="repl-legend-row${fade}">
        <span class="repl-legend-pip" style="background:${REGISTRY[id].color}"></span>
        <span class="repl-legend-name">${REGISTRY[id].name}</span>
        <span class="repl-legend-pct">${final}%</span>
      </div>
    `;
  }).join('');
  el.querySelector('[data-legend]').innerHTML = html;
}

function drawChart(el) {
  const canvas = el.querySelector('[data-chart]');
  if (!canvas || !result) return;

  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.clientHeight || 320;
  const dpr  = window.devicePixelRatio || 1;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const totalGens = result.history.length - 1;
  const xAt = i => (i / totalGens) * cssW;
  const order = result.drawOrder;
  const limit = Math.max(1, Math.min(state.currentGen + 1, result.history.length));

  // Draw each strategy's stacked band, bottom up.
  for (let bandIdx = 0; bandIdx < order.length; bandIdx++) {
    const id = order[bandIdx];
    ctx.fillStyle = REGISTRY[id].color;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();

    // Top edge — sum of (this band + all bands above it in order) at each gen.
    for (let g = 0; g < limit; g++) {
      const sumAbove = order.slice(bandIdx + 1).reduce((a, oid) => a + result.history[g].pop[oid], 0);
      const sumThisAndAbove = sumAbove + result.history[g].pop[id];
      const y = cssH - sumThisAndAbove * cssH;
      const x = xAt(g);
      g === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    // Bottom edge — sum of bands above only.
    for (let g = limit - 1; g >= 0; g--) {
      const sumAbove = order.slice(bandIdx + 1).reduce((a, oid) => a + result.history[g].pop[oid], 0);
      const y = cssH - sumAbove * cssH;
      ctx.lineTo(xAt(g), y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Current-generation marker line.
  if (state.currentGen > 0 && state.currentGen < totalGens) {
    const x = xAt(state.currentGen);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
  }

  // Update gen label.
  el.querySelector('[data-gen-label]').textContent = state.currentGen;
}

// ── Animation loop ────────────────────────────────────────────────────────────

function play(el) {
  state.playing = true;
  el.querySelector('[data-action="playpause"]').textContent = '⏸';
  _lastTick = 0;
  step(el);
}

function pause(el) {
  state.playing = false;
  if (_raf) cancelAnimationFrame(_raf);
  _raf = null;
  const btn = el.querySelector('[data-action="playpause"]');
  if (btn) btn.textContent = '▶';
}

function step(el) {
  if (!state.playing) return;
  _raf = requestAnimationFrame(now => {
    if (!_lastTick) _lastTick = now;
    const dt = now - _lastTick;
    const framesPerGen = FRAMES_PER_GEN / state.speed * (1000 / 60);  // ms per gen
    if (dt >= framesPerGen) {
      state.currentGen += 1;
      _lastTick = now;
      if (state.currentGen >= result.history.length - 1) {
        state.currentGen = result.history.length - 1;
        drawChart(el);
        showVerdict(el);
        pause(el);
        return;
      }
      drawChart(el);
    }
    step(el);
  });
}

function showVerdict(el) {
  const verdictEl = el.querySelector('[data-verdict]');
  const top = [...result.ids].sort((a, b) => result.finalPop[b] - result.finalPop[a])[0];
  const topName = REGISTRY[top].name;
  const topPct  = (result.finalPop[top] * 100).toFixed(1);
  const extinct = result.ids.filter(id => result.finalPop[id] < 0.01).map(id => REGISTRY[id].name);
  const extinctLine = extinct.length > 0
    ? `<span class="repl-verdict-sub">Extinct by the end: ${extinct.join(', ')}.</span>`
    : '';

  verdictEl.innerHTML = `
    <div class="repl-verdict-head">After ${state.generations} generations</div>
    <div class="repl-verdict-body">
      <b>${topName}</b> dominates the long run at <b>${topPct}%</b> of the population.
      ${extinctLine}
    </div>
  `;
  verdictEl.classList.add('shown');
}

// ── Events ────────────────────────────────────────────────────────────────────

function wireEvents(el) {
  // Play/Pause
  el.querySelector('[data-action="playpause"]').addEventListener('click', () => {
    if (state.playing) pause(el);
    else {
      if (state.currentGen >= result.history.length - 1) state.currentGen = 0;
      play(el);
      el.querySelector('[data-verdict]').classList.remove('shown');
    }
  });

  // Speed
  el.querySelectorAll('[data-speed]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.speed = parseInt(btn.dataset.speed, 10);
      el.querySelectorAll('[data-speed]').forEach(b =>
        b.classList.toggle('on', b.dataset.speed === btn.dataset.speed));
    });
  });

  // Sliders
  el.addEventListener('input', e => {
    const sl = e.target.closest('.slider');
    if (!sl) return;
    const field = sl.dataset.field;
    const val = field === 'noise' ? parseFloat(sl.value) : parseInt(sl.value, 10);
    state[field] = val;
    if (field === 'noise')        sl.style.setProperty('--fill', `${val / 0.3 * 100}%`);
    if (field === 'generations')  sl.style.setProperty('--fill', `${(val - 20) / 180 * 100}%`);
    if (field === 'rounds')       sl.style.setProperty('--fill', `${(val - 10) / 190 * 100}%`);

    el.querySelector('[data-gens-pct]').textContent    = state.generations;
    el.querySelector('[data-rounds-pct]').textContent  = state.rounds;
    el.querySelector('[data-noise-pct]').textContent   = pct(state.noise);
    el.querySelector('[data-noise-region]').textContent = noiseRegion(state.noise);
    el.querySelector('[data-gen-total]').textContent   = state.generations;
  });

  // Restart
  el.querySelector('[data-action="restart"]').addEventListener('click', () => {
    pause(el);
    state.currentGen = 0;
    computeRun();
    drawLegend(el);
    el.querySelector('[data-verdict]').classList.remove('shown');
    drawChart(el);
    play(el);
  });

  el.querySelector('[data-action="back"]').addEventListener('click', () => go && go('evolution'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct = x => `${Math.round(x * 100)}%`;
function noiseRegion(v) { return v < 0.01 ? 'Clean' : v < 0.05 ? 'Realistic' : v < 0.15 ? 'Noisy' : 'Chaotic'; }
