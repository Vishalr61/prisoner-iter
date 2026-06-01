// Lab view — Phase 3 (Session A).
// Tweak the environment (roster, payoffs, noise, round count) and watch
// the round-robin re-rank in real time. Teaches the canonical IPD
// lesson — there is no universal best strategy, only the right
// strategy for the environment.
//
// Public API: initLabView(navigate), showLab().

import { REGISTRY }       from '../../../core/registry.js';
import { runRoundRobin }  from '../../../core/tournament.js';
import { getUserStrategies, getExperiments, saveExperiment, deleteExperiment } from '../progress.js';
import { buildSilhouette } from '../silhouette.js';

const CANONICAL_IDS = ['allC', 'allD', 'tft', 'grim', 'tf2t', 'pavlov', 'gtft', 'stft', 'rand'];
const CHARACTER_IDS = ['allC', 'allD', 'tft', 'grim', 'tf2t', 'pavlov']; // for silhouette lookup

// IDs of the canonical cast in narrative campaign order (so the roster
// reads Sam → Marcus → Maya → … rather than alphabetical).
const CANONICAL_DISPLAY_ORDER = [
  { id: 'allC',   character: 'sam' },
  { id: 'allD',   character: 'marcus' },
  { id: 'tft',    character: 'maya' },
  { id: 'grim',   character: 'theo' },
  { id: 'tf2t',   character: 'naomi' },
  { id: 'pavlov', character: 'ren' },
  { id: 'gtft',   character: null },
  { id: 'stft',   character: null },
  { id: 'rand',   character: null },
];

const BASELINE_ENV = { rounds: 50, noise: 0, payoffs: { R: 3, T: 5, P: 1, S: 0 }, masterSeed: 1 };

let state;
let go = null;
let _rerunTimer = null;
let _baselineRanked = null;  // cached baseline ranking for diff

const DEFAULT_STATE = () => ({
  selected: new Set(CANONICAL_IDS),
  payoffs:  { R: 3, T: 5, P: 1, S: 0 },
  noise:    0,
  rounds:   50,
});

export function initLabView(navigateFn) { go = navigateFn; }

export function showLab() {
  state = DEFAULT_STATE();
  _baselineRanked = null;
  const el = document.getElementById('view-lab');
  buildDOM(el);
  wireEvents(el);
  rerun(el);
}

// ── Strategy registry (canonical + user) ──────────────────────────────────────

function allSpecs() {
  const canonical = CANONICAL_IDS.map(id => REGISTRY[id]);
  const user      = getUserStrategies();
  return [...canonical, ...user];
}

function userSpecs() { return getUserStrategies(); }

// ── DOM ───────────────────────────────────────────────────────────────────────

function buildDOM(el) {
  el.innerHTML = `
    <div class="wsp lab" style="--bld-color:#60a5fa">
      <header class="wsp-masthead">
        <div class="wsp-kicker"><span class="dot"></span>The Trust Game · Environment Lab</div>
        <h1 class="wsp-title">Change the <em>world</em>.</h1>
        <p class="wsp-deck">There is no universal best strategy — only the right strategy for the environment. Move a slider; watch the ranking change.</p>
      </header>

      ${experimentsHTML()}

      <div class="wsp-grid">
        <div class="wsp-build">
          <div class="wsp-controls">
            ${rosterSectionHTML()}
            ${payoffSectionHTML()}
            ${noiseSectionHTML()}
            ${roundsSectionHTML()}
          </div>

          <div class="actions">
            <button class="wsp-btn wsp-btn-ghost" data-action="reset">Reset to baseline</button>
            <button class="wsp-btn wsp-btn-ghost" data-action="back">Back</button>
          </div>
        </div>

        <div class="wsp-arena-col">
          <div class="arena">
            <div class="thesis">
              <div class="thesis-label">Ranking under this environment</div>
              <div class="thesis-text" data-thesis>—</div>
            </div>

            <div class="lab-results" data-results></div>

            <div class="verdict">
              <div class="verdict-text" data-diff></div>
            </div>

            <div class="stats" data-stats>
              <div class="stat"><div class="stat-num" data-stat="top">—</div><div class="stat-lbl">Top score</div></div>
              <div class="stat"><div class="stat-num" data-stat="spread">—</div><div class="stat-lbl">Spread</div></div>
              <div class="stat"><div class="stat-num" data-stat="n">—</div><div class="stat-lbl">Strategies</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Experiments bar ──────────────────────────────────────────────────────────

function experimentsHTML() {
  const list = getExperiments();
  const chips = list.map(exp => {
    const active = experimentMatches(exp, state);
    return `
      <div class="lab-exp${active ? ' active' : ''}" data-exp-id="${exp.id}" title="${escapeHtml(envSummary(exp.env))}">
        <button class="lab-exp-load" data-exp-load="${exp.id}">${escapeHtml(exp.name)}</button>
        <button class="lab-exp-del"  data-exp-del="${exp.id}" aria-label="Delete">×</button>
      </div>
    `;
  }).join('');

  return `
    <section class="lab-experiments">
      <span class="eyebrow">Experiments</span>
      <div class="lab-exp-chips">
        ${chips || '<span class="lab-exp-empty">No saved environments yet</span>'}
        <button class="lab-exp-add" data-exp-add>＋ Save current</button>
      </div>
      <div class="lab-exp-namebar" data-exp-namebar hidden>
        <input class="lab-exp-name-input" type="text" placeholder="Name this environment…" data-exp-name maxlength="32" />
        <button class="wsp-btn wsp-btn-primary lab-exp-confirm" data-exp-confirm>Save</button>
        <button class="wsp-btn wsp-btn-ghost lab-exp-cancel"   data-exp-cancel>Cancel</button>
      </div>
    </section>
  `;
}

// Compact human-readable env summary, used in the chip tooltip.
function envSummary(env) {
  const parts = [`${env.selected.length} players`, `${env.rounds}r`];
  if (env.noise > 0) parts.push(`${Math.round(env.noise * 100)}% noise`);
  const p = env.payoffs;
  if (p.R !== 3 || p.T !== 5 || p.P !== 1 || p.S !== 0) parts.push(`payoffs ${p.R}/${p.T}/${p.P}/${p.S}`);
  return parts.join(' · ');
}

function snapshotEnv(s) {
  return {
    selected: [...s.selected].sort(),
    payoffs:  { ...s.payoffs },
    noise:    s.noise,
    rounds:   s.rounds,
  };
}

function experimentMatches(exp, s) {
  if (exp.env.rounds !== s.rounds || exp.env.noise !== s.noise) return false;
  const p = exp.env.payoffs;
  if (p.R !== s.payoffs.R || p.T !== s.payoffs.T || p.P !== s.payoffs.P || p.S !== s.payoffs.S) return false;
  if (exp.env.selected.length !== s.selected.size) return false;
  for (const id of exp.env.selected) if (!s.selected.has(id)) return false;
  return true;
}

function loadExperimentIntoState(exp) {
  state.selected = new Set(exp.env.selected);
  state.payoffs  = { ...exp.env.payoffs };
  state.noise    = exp.env.noise;
  state.rounds   = exp.env.rounds;
}

function rosterSectionHTML() {
  const canonical = CANONICAL_DISPLAY_ORDER.map(({ id, character }) => {
    const spec = REGISTRY[id];
    const checked = state.selected.has(id);
    const silh = character ? `<span class="lab-silh">${buildSilhouette(character, spec.color, 18)}</span>` : `<span class="lab-pip" style="background:${spec.color}"></span>`;
    return `
      <label class="lab-row${checked ? ' on' : ''}" data-strategy="${id}">
        <input type="checkbox" data-strategy-toggle="${id}" ${checked ? 'checked' : ''} />
        ${silh}
        <span class="lab-row-name">${spec.name}</span>
      </label>
    `;
  }).join('');

  const user = userSpecs();
  const userRows = user.length === 0 ? '' : `
    <div class="lab-roster-divider">Your builds</div>
    ${user.map(spec => {
      const checked = state.selected.has(spec.id);
      return `
        <label class="lab-row${checked ? ' on' : ''}" data-strategy="${spec.id}">
          <input type="checkbox" data-strategy-toggle="${spec.id}" ${checked ? 'checked' : ''} />
          <span class="lab-pip" style="background:${spec.color}"></span>
          <span class="lab-row-name">${escapeHtml(spec.name)}</span>
        </label>
      `;
    }).join('')}
  `;

  return `
    <div class="section">
      <div class="sec-num">01</div>
      <div class="sec-body">
        <div class="sec-head"><span class="sec-title">Who competes</span><span class="sec-readout"><span class="sec-pct" data-count>${state.selected.size}</span></span></div>
        <p class="note">Pick the players. Every pair plays each other once.</p>
        <div class="lab-roster">${canonical}${userRows}</div>
      </div>
    </div>
  `;
}

function payoffSectionHTML() {
  const { R, T, P, S } = state.payoffs;
  return `
    <div class="section">
      <div class="sec-num">02</div>
      <div class="sec-body">
        <div class="sec-head"><span class="sec-title">Payoff matrix</span><span class="sec-readout"><span class="sec-region" data-payoff-flag>${payoffFlag(state.payoffs)}</span></span></div>
        <p class="note">The prisoner's dilemma needs <em>T &gt; R &gt; P &gt; S</em>. If that breaks, you're playing a different game.</p>
        <div class="lab-payoffs">
          <label class="lab-pay"><span>R</span><input type="number" step="1" value="${R}" data-payoff="R" /><span class="lab-pay-help">both share</span></label>
          <label class="lab-pay"><span>T</span><input type="number" step="1" value="${T}" data-payoff="T" /><span class="lab-pay-help">you take, they share</span></label>
          <label class="lab-pay"><span>P</span><input type="number" step="1" value="${P}" data-payoff="P" /><span class="lab-pay-help">both take</span></label>
          <label class="lab-pay"><span>S</span><input type="number" step="1" value="${S}" data-payoff="S" /><span class="lab-pay-help">you share, they take</span></label>
        </div>
      </div>
    </div>
  `;
}

function noiseSectionHTML() {
  const fill = `${(state.noise / 0.3) * 100}%`;
  return `
    <div class="section">
      <div class="sec-num">03</div>
      <div class="sec-body">
        <div class="sec-head"><span class="sec-title">Noise</span><span class="sec-readout"><span class="sec-region" data-noise-region>${noiseRegion(state.noise)}</span><span class="sec-pct" data-noise-pct>${pct(state.noise)}</span></span></div>
        <p class="note">Chance any chosen move flips by accident. Strict strategies bleed. Forgiving ones absorb it.</p>
        <div class="slider-wrap">
          <input class="slider" type="range" min="0" max="0.3" step="0.01" value="${state.noise}" style="--fill:${fill}" data-field="noise" />
          <div class="scale-ticks"><span>0%</span><span>15%</span><span>30%</span></div>
        </div>
      </div>
    </div>
  `;
}

function roundsSectionHTML() {
  const fill = `${((state.rounds - 10) / 190) * 100}%`;
  return `
    <div class="section">
      <div class="sec-num">04</div>
      <div class="sec-body">
        <div class="sec-head"><span class="sec-title">Match length</span><span class="sec-readout"><span class="sec-pct" data-rounds-pct>${state.rounds}</span><span class="sec-region">rounds</span></span></div>
        <p class="note">More rounds favor strategies that build trust over time. Fewer rounds favor exploitation.</p>
        <div class="slider-wrap">
          <input class="slider" type="range" min="10" max="200" step="5" value="${state.rounds}" style="--fill:${fill}" data-field="rounds" />
          <div class="scale-ticks"><span>10</span><span>100</span><span>200</span></div>
        </div>
      </div>
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────────────────────

function wireEvents(el) {
  // Roster checkboxes (delegated)
  el.addEventListener('change', e => {
    const cb = e.target.closest('[data-strategy-toggle]');
    if (cb) {
      const id = cb.dataset.strategyToggle;
      if (cb.checked) state.selected.add(id);
      else state.selected.delete(id);
      el.querySelector(`[data-strategy="${id}"]`)?.classList.toggle('on', cb.checked);
      el.querySelector('[data-count]').textContent = state.selected.size;
      scheduleRerun(el);
      return;
    }
  });

  // Payoff inputs + sliders
  el.addEventListener('input', e => {
    const pi = e.target.closest('[data-payoff]');
    if (pi) {
      const key = pi.dataset.payoff;
      state.payoffs[key] = parseFloat(pi.value) || 0;
      el.querySelector('[data-payoff-flag]').textContent = payoffFlag(state.payoffs);
      scheduleRerun(el);
      return;
    }
    const sl = e.target.closest('.slider');
    if (sl) {
      const field = sl.dataset.field;
      const val = parseFloat(sl.value);
      state[field] = val;
      sl.style.setProperty('--fill', field === 'noise'
        ? `${(val / 0.3) * 100}%`
        : `${((val - 10) / 190) * 100}%`);
      if (field === 'noise') {
        el.querySelector('[data-noise-pct]').textContent    = pct(val);
        el.querySelector('[data-noise-region]').textContent = noiseRegion(val);
      } else if (field === 'rounds') {
        el.querySelector('[data-rounds-pct]').textContent = val;
      }
      scheduleRerun(el);
      return;
    }
  });

  el.querySelector('[data-action="reset"]').addEventListener('click', () => {
    state = DEFAULT_STATE();
    buildDOM(el);
    wireEvents(el);
    rerun(el);
  });
  el.querySelector('[data-action="back"]').addEventListener('click', () => go && go('evolution'));

  wireExperimentEvents(el);
}

// Experiments — save/load/delete + the inline name input.
// Two-layer wiring: the delegated load/delete listener is registered ONCE
// per view-root (guarded by a flag); the namebar + add buttons are
// re-bound every time the section re-renders.
function wireExperimentEvents(el) {
  bindNameBarButtons(el);

  if (el.__expDelegated) return;
  el.__expDelegated = true;
  el.addEventListener('click', e => {
    const loadBtn = e.target.closest('[data-exp-load]');
    if (loadBtn) {
      const id = loadBtn.dataset.expLoad;
      const exp = getExperiments().find(x => x.id === id);
      if (!exp) return;
      loadExperimentIntoState(exp);
      buildDOM(el);
      wireEvents(el);
      rerun(el);
      return;
    }
    const delBtn = e.target.closest('[data-exp-del]');
    if (delBtn) {
      e.stopPropagation();
      const id = delBtn.dataset.expDel;
      const exp = getExperiments().find(x => x.id === id);
      if (!exp) return;
      if (!confirm(`Delete experiment "${exp.name}"?`)) return;
      deleteExperiment(id);
      refreshExperimentsBar(el);
      return;
    }
  });
}

function bindNameBarButtons(el) {
  const nameBar   = el.querySelector('[data-exp-namebar]');
  const nameInput = el.querySelector('[data-exp-name]');
  if (!nameBar || !nameInput) return;

  el.querySelector('[data-exp-add]')?.addEventListener('click', () => {
    nameBar.hidden = false;
    nameInput.value = '';
    nameInput.focus();
  });

  el.querySelector('[data-exp-cancel]')?.addEventListener('click', () => { nameBar.hidden = true; });

  const confirmSave = () => {
    const name = (nameInput.value || '').trim();
    if (!name) { nameInput.focus(); return; }
    saveExperiment({
      id: `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      createdAt: Date.now(),
      env: snapshotEnv(state),
    });
    nameBar.hidden = true;
    refreshExperimentsBar(el);
  };
  el.querySelector('[data-exp-confirm]')?.addEventListener('click', confirmSave);
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmSave();
    else if (e.key === 'Escape') { nameBar.hidden = true; }
  });
}

// Replace only the experiments section — preserves the user's editing
// context (slider drags, name input focus, etc.) elsewhere on the page.
function refreshExperimentsBar(el) {
  const section = el.querySelector('.lab-experiments');
  if (!section) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = experimentsHTML();
  section.replaceWith(fresh.firstElementChild);
  bindNameBarButtons(el);
}

// Keep the "active" chip in sync with the current env without rebuilding
// the whole section (which would lose user focus on inputs). Cheap.
function updateActiveExperimentChip(el) {
  el.querySelectorAll('.lab-exp').forEach(chip => {
    const id = chip.dataset.expId;
    const exp = getExperiments().find(x => x.id === id);
    chip.classList.toggle('active', !!exp && experimentMatches(exp, state));
  });
}

// 150ms debounce so dragging a slider doesn't queue dozens of runs.
function scheduleRerun(el) {
  if (_rerunTimer) clearTimeout(_rerunTimer);
  _rerunTimer = setTimeout(() => rerun(el), 150);
}

// ── Re-run tournament + paint results ─────────────────────────────────────────

function rerun(el) {
  // Edge: fewer than 2 selected — bail with hint
  if (state.selected.size < 2) {
    el.querySelector('[data-thesis]').textContent = 'Pick at least two players.';
    el.querySelector('[data-results]').innerHTML = '';
    el.querySelector('[data-diff]').innerHTML = '';
    setStats(el, '—', '—', state.selected.size);
    return;
  }

  // Payoff sanity — IPD requires T > R > P > S. Run anyway but flag.
  const valid = isValidPayoff(state.payoffs);

  const specs = allSpecs().filter(s => state.selected.has(s.id));
  const result = runRoundRobin(specs, {
    rounds:     state.rounds,
    noise:      state.noise,
    payoffs:    state.payoffs,
    masterSeed: 1,
  });

  // Baseline (canonical 9 at default env) computed once, cached.
  if (!_baselineRanked) {
    const baselineSpecs = CANONICAL_IDS.map(id => REGISTRY[id]);
    _baselineRanked = runRoundRobin(baselineSpecs, BASELINE_ENV).ranked;
  }

  el.querySelector('[data-thesis]').textContent =
    `${specs.length} players, ${state.rounds} rounds each${state.noise > 0 ? `, ${pct(state.noise)} noise` : ''}.`;

  renderRankingChart(el, result);
  renderDiff(el, result, valid);

  setStats(el,
    result.ranked[0]?.score ?? '—',
    (result.ranked[0]?.score ?? 0) - (result.ranked[result.ranked.length - 1]?.score ?? 0),
    specs.length);

  updateActiveExperimentChip(el);
}

function renderRankingChart(el, result) {
  const max = result.ranked[0]?.score || 1;
  const html = result.ranked.map((row, i) => {
    const pct = Math.max(2, (row.score / max) * 100);
    const isUser = row.spec.source === 'player';
    return `
      <div class="lab-bar-row${isUser ? ' user' : ''}">
        <span class="lab-bar-rank">${i + 1}</span>
        <span class="lab-bar-pip" style="background:${row.spec.color}"></span>
        <span class="lab-bar-name">${escapeHtml(row.spec.name)}</span>
        <div class="lab-bar-track"><div class="lab-bar-fill" style="width:${pct}%; background:${row.spec.color}"></div></div>
        <span class="lab-bar-score">${row.score}</span>
      </div>
    `;
  }).join('');
  el.querySelector('[data-results]').innerHTML = html;
}

function renderDiff(el, result, validPayoffs) {
  const diffEl = el.querySelector('[data-diff]');
  if (!validPayoffs) {
    diffEl.innerHTML = `<b style="color:var(--take)">This isn't a prisoner's dilemma anymore.</b> The payoff matrix needs T &gt; R &gt; P &gt; S — try the reset button.`;
    return;
  }
  if (isBaselineEnv(state) && setEquals(state.selected, new Set(CANONICAL_IDS))) {
    diffEl.innerHTML = `<span style="color:var(--fg-dim)">This is the baseline — move a slider to see the world change.</span>`;
    return;
  }

  // Compare position changes against baseline (only for strategies present in both)
  const currentRank = new Map(result.ranked.map((r, i) => [r.spec.id, i + 1]));
  const baseRank    = new Map(_baselineRanked.map((r, i) => [r.spec.id, i + 1]));

  const moves = [];
  for (const [id, cur] of currentRank) {
    if (!baseRank.has(id)) continue;
    const base = baseRank.get(id);
    const delta = base - cur;  // positive = moved up
    if (delta !== 0) moves.push({ id, cur, base, delta, name: REGISTRY[id]?.name ?? id });
  }
  moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = moves.slice(0, 3);

  if (top.length === 0) {
    diffEl.innerHTML = `Same ranking as baseline.`;
    return;
  }

  const lines = top.map(m => {
    const arrow = m.delta > 0 ? '↑' : '↓';
    const color = m.delta > 0 ? 'var(--share)' : 'var(--take)';
    return `<span class="lab-diff-line"><b>${m.name}</b> <span style="color:${color}">${arrow} ${Math.abs(m.delta)}</span> <span style="color:var(--fg-faint)">(${m.base} → ${m.cur})</span></span>`;
  }).join('');
  diffEl.innerHTML = `<div class="lab-diff-head">Versus baseline</div>${lines}`;
}

function setStats(el, top, spread, n) {
  el.querySelector('[data-stat="top"]').textContent    = top;
  el.querySelector('[data-stat="spread"]').textContent = spread;
  el.querySelector('[data-stat="n"]').textContent      = n;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct = x => `${Math.round(x * 100)}%`;
function noiseRegion(v) { return v < 0.01 ? 'Clean' : v < 0.05 ? 'Realistic' : v < 0.15 ? 'Noisy' : 'Chaotic'; }
function isValidPayoff(p) { return p.T > p.R && p.R > p.P && p.P > p.S; }
function payoffFlag(p)    { return isValidPayoff(p) ? 'valid IPD' : 'invalid — not IPD'; }
function isBaselineEnv(s) {
  return s.noise === 0 && s.rounds === 50 &&
         s.payoffs.R === 3 && s.payoffs.T === 5 && s.payoffs.P === 1 && s.payoffs.S === 0;
}
function setEquals(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
