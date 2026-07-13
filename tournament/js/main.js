import { STRATEGIES } from './strategies.js';
import { getPayoffs, runTournament, runEvolution } from './tournament.js';
import { drawEvolutionChart } from './chart.js';

// ── State ────────────────────────────────────────────────────────────────────
let activeStrategies = [...STRATEGIES];
let tournamentResult = null;
let evoHistory       = null;
let selectedCell     = null;

// ── Init ─────────────────────────────────────────────────────────────────────
function init() {
  renderStrategyList();
  wireSliders();
  wireButtons();
}

// ── Strategy list ─────────────────────────────────────────────────────────────
function renderStrategyList() {
  const list = document.getElementById('strategy-list');
  list.innerHTML = '';

  STRATEGIES.forEach(strat => {
    const item = document.createElement('div');
    item.className = 'strategy-item';
    item.dataset.id = strat.id;

    item.innerHTML = `
      <label class="strategy-label">
        <input type="checkbox" checked data-id="${strat.id}" />
        <span class="sdot" style="background:${strat.color};box-shadow:0 0 6px ${strat.color}55"></span>
        <span class="sname">${strat.name}</span>
        <span class="sshort">${strat.short}</span>
      </label>
      <p class="sdesc">${strat.desc}</p>
    `;

    item.querySelector('input').addEventListener('change', syncActive);
    list.appendChild(item);
  });
}

function syncActive() {
  const ids = new Set(
    [...document.querySelectorAll('#strategy-list input:checked')].map(el => el.dataset.id)
  );
  activeStrategies = STRATEGIES.filter(s => ids.has(s.id));
  document.getElementById('active-count').textContent = `${activeStrategies.length} active`;
}

// ── Sliders ───────────────────────────────────────────────────────────────────
function wireSliders() {
  [
    ['rounds',      'rounds-val',  v => v],
    ['generations', 'gens-val',    v => v],
    ['noise',       'noise-val',   v => `${v}%`],
  ].forEach(([id, dispId, fmt]) => {
    const el   = document.getElementById(id);
    const disp = document.getElementById(dispId);
    disp.textContent = fmt(el.value);
    el.addEventListener('input', () => { disp.textContent = fmt(el.value); });
  });
}

// ── Buttons ───────────────────────────────────────────────────────────────────
function wireButtons() {
  document.getElementById('run-btn').addEventListener('click', onRunTournament);
  document.getElementById('evolve-btn').addEventListener('click', onEvolve);
  document.getElementById('reset-btn').addEventListener('click', onReset);
}

// ── Status ────────────────────────────────────────────────────────────────────
function setStatus(text, busy = false) {
  document.getElementById('status-text').textContent = text;
  document.getElementById('bdot').classList.toggle('running', busy);
}

function guard() {
  if (activeStrategies.length < 2) {
    setStatus('Select at least 2 strategies');
    return false;
  }
  return true;
}

// ── Run tournament ────────────────────────────────────────────────────────────
function onRunTournament() {
  if (!guard()) return;
  setStatus('Running tournament…', true);

  requestAnimationFrame(() => setTimeout(() => {
    const rounds  = +document.getElementById('rounds').value;
    const payoffs = getPayoffs();

    tournamentResult = runTournament(activeStrategies, rounds, payoffs);
    renderMatrix(tournamentResult.scores, activeStrategies, tournamentResult.matches);
    updateStrategyScores(tournamentResult.scores, activeStrategies);
    setStatus(`Done · ${activeStrategies.length} strategies · ${rounds} rounds/match`);
  }, 16));
}

// ── Evolve ────────────────────────────────────────────────────────────────────
function onEvolve() {
  if (!guard()) return;
  setStatus('Evolving population…', true);

  requestAnimationFrame(() => setTimeout(() => {
    const rounds  = +document.getElementById('rounds').value;
    const gens    = +document.getElementById('generations').value;
    const noise   = +document.getElementById('noise').value / 100;
    const payoffs = getPayoffs();

    // Always (re)run tournament so matrix is fresh
    tournamentResult = runTournament(activeStrategies, rounds, payoffs);
    renderMatrix(tournamentResult.scores, activeStrategies, tournamentResult.matches);
    updateStrategyScores(tournamentResult.scores, activeStrategies);

    evoHistory = runEvolution(activeStrategies, rounds, gens, noise, payoffs);
    document.getElementById('chart-empty').style.display = 'none';

    const canvas = document.getElementById('evo-chart');
    drawEvolutionChart(canvas, evoHistory, activeStrategies);

    setStatus(`Evolution done · ${gens} generations · mutation ${noise * 100}%`);
  }, 16));
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function onReset() {
  tournamentResult = null;
  evoHistory       = null;
  selectedCell     = null;

  document.getElementById('matrix-container').innerHTML = emptyState('⚔', 'Run the tournament to see how strategies compete');
  document.getElementById('replay-container').innerHTML = emptyState('🔍', 'Click any cell in the score matrix to inspect that matchup');
  document.getElementById('chart-empty').style.display  = 'flex';
  document.getElementById('replay-stats').style.display = 'none';
  document.getElementById('replay-desc').textContent    = 'Click any cell above to inspect that matchup';

  const ctx = document.getElementById('evo-chart').getContext('2d');
  ctx.clearRect(0, 0, 9999, 9999);

  // Clear per-strategy score badges
  document.querySelectorAll('.strategy-item').forEach(el => {
    el.querySelector('.sscore')?.remove();
  });

  setStatus('Ready');
}

// ── Score badges in sidebar ───────────────────────────────────────────────────
function updateStrategyScores(scores, strategies) {
  const totals = strategies.map((_, i) =>
    scores[i].reduce((acc, s) => acc + (s ?? 0), 0) / (strategies.length)
  );
  const max = Math.max(...totals);

  strategies.forEach((strat, i) => {
    const item = document.querySelector(`.strategy-item[data-id="${strat.id}"]`);
    if (!item) return;
    item.querySelector('.sscore')?.remove();
    const badge = document.createElement('span');
    badge.className = 'sscore';
    badge.style.setProperty('--p', totals[i] / max);
    badge.textContent = totals[i].toFixed(2);
    badge.title = 'Avg score per round across all opponents';
    item.querySelector('.strategy-label').appendChild(badge);
  });
}

// ── Matrix ────────────────────────────────────────────────────────────────────
function renderMatrix(scores, strategies, matches) {
  const container = document.getElementById('matrix-container');
  const n = strategies.length;

  // Score range (ignore diagonal for colour scale)
  let min = Infinity, max = -Infinity;
  scores.forEach((row, i) => row.forEach((s, j) => {
    if (i !== j && s !== null) { if (s < min) min = s; if (s > max) max = s; }
  }));
  if (min === Infinity) { min = 0; max = 5; }

  const cols = n + 1;
  let html = `<div class="matrix" style="--cols:${cols}">`;

  // Corner
  html += `<div class="m-corner"><span>↓ vs →</span></div>`;

  // Col headers
  strategies.forEach(s => {
    html += `<div class="m-head m-col" style="--c:${s.color}">${s.short}</div>`;
  });

  // Rows
  strategies.forEach((rowS, i) => {
    html += `<div class="m-head m-row" style="--c:${rowS.color}">${rowS.short}</div>`;
    strategies.forEach((colS, j) => {
      const score  = scores[i][j];
      const isSelf = i === j;
      const t      = isSelf ? 0.5 : Math.max(0, Math.min(1, (score - min) / (max - min || 1)));
      const hue    = t * 120;
      const L      = isSelf ? 15 : 22 + t * 14;

      html += `<div class="m-cell${isSelf ? ' self' : ''}"
        style="background:hsl(${hue},65%,${L}%);border-color:hsl(${hue},65%,${L + 14}%)"
        data-i="${i}" data-j="${j}"
        title="${rowS.name} vs ${colS.name}: ${score !== null ? score.toFixed(2) : 'n/a'} pts/round"
      >
        <span class="m-score">${score !== null ? score.toFixed(2) : '—'}</span>
        ${isSelf ? '<span class="self-label">self</span>' : ''}
      </div>`;
    });
  });

  html += '</div>';
  container.innerHTML = html;

  // Stagger animation
  container.querySelectorAll('.m-cell').forEach((el, k) => {
    el.style.animationDelay = `${(k % (n * n)) * 12}ms`;
  });

  // Click handlers
  container.querySelectorAll('.m-cell:not(.self)').forEach(el => {
    el.addEventListener('click', () => {
      // Deselect previous
      container.querySelector('.m-cell.selected')?.classList.remove('selected');
      el.classList.add('selected');
      const i = +el.dataset.i, j = +el.dataset.j;
      showReplay(i, j, strategies, matches[`${i}-${j}`]);
    });
  });
}

// ── Match replay ──────────────────────────────────────────────────────────────
function showReplay(i, j, strategies, match) {
  const sA = strategies[i], sB = strategies[j];
  const log = match.roundLog;

  document.getElementById('replay-desc').textContent =
    `${sA.name}  ·  vs  ·  ${sB.name}`;

  const statsEl = document.getElementById('replay-stats');
  statsEl.style.display = 'flex';
  statsEl.innerHTML = `
    <span class="rs-name" style="color:${sA.color}">${sA.short}</span>
    <span class="rs-score" style="color:${sA.color}">${match.scoreA.toFixed(2)}</span>
    <span class="rs-sep">pts/round</span>
    <span class="rs-vs">vs</span>
    <span class="rs-score" style="color:${sB.color}">${match.scoreB.toFixed(2)}</span>
    <span class="rs-name" style="color:${sB.color}">${sB.short}</span>
  `;

  const crA = (log.filter(r => r.ma === 'C').length / log.length * 100).toFixed(0);
  const crB = (log.filter(r => r.mb === 'C').length / log.length * 100).toFixed(0);

  const moveGrid = (moves, color) => moves.map((r, k) => {
    const m = r.ma !== undefined ? r.ma : r;
    return `<div class="msq ${m === 'C' ? 'mc' : 'md'}" title="Round ${k+1}: ${m}"></div>`;
  }).join('');

  document.getElementById('replay-container').innerHTML = `
    <div class="replay-wrap">
      <div class="coop-bars">
        ${coopBar(sA, crA)}
        ${coopBar(sB, crB)}
      </div>
      <div class="move-section">
        <div class="move-row">
          <span class="move-label" style="color:${sA.color}">${sA.short}</span>
          <div class="move-grid">${moveGrid(log.map(r => ({ ma: r.ma })), sA.color)}</div>
        </div>
        <div class="move-row">
          <span class="move-label" style="color:${sB.color}">${sB.short}</span>
          <div class="move-grid">${moveGrid(log.map(r => ({ ma: r.mb })), sB.color)}</div>
        </div>
      </div>
    </div>
  `;
}

function coopBar(strat, pct) {
  return `
    <div class="coop-bar-row">
      <span class="cb-label" style="color:${strat.color}">${strat.short}</span>
      <div class="cb-track">
        <div class="cb-fill" style="width:${pct}%;background:${strat.color}"></div>
      </div>
      <span class="cb-pct">${pct}% C</span>
    </div>
  `;
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="ei">${icon}</div><p>${text}</p></div>`;
}

init();
