// Builder view — Player Workshop redesign.
// Editorial-lab restage of the five-control builder, with the live match
// promoted to a persistent hero panel (animated move grid + cumulative-score
// chart + verdict + stat strip). Same engine, same save/share/prefill contract
// as before — only the DOM + presentation changed.
//
// Public API (unchanged): initBuilderView(navigate), showBuilder(params).

import { compileStrategy, configToRules, encodeStrategy } from '../../../core/strategy.js';
import { REGISTRY }                                       from '../../../core/registry.js';
import { runMatch }                                       from '../../../core/match.js';
import { saveUserStrategy }                               from '../progress.js';
import { buildSilhouette }                                from '../silhouette.js';

const ROUNDS  = 20;
const SEED    = 1;
const ANIM_MS = 1150;

// Preview opponents — the six campaign characters, in narrative order.
const OPPONENTS = [
  { id: 'tft',    strategyId: 'tft',    name: 'Maya',   color: '#5e8ca8' },
  { id: 'allC',   strategyId: 'allC',   name: 'Sam',    color: '#f0c674' },
  { id: 'tf2t',   strategyId: 'tf2t',   name: 'Naomi',  color: '#a085bd' },
  { id: 'grim',   strategyId: 'grim',   name: 'Theo',   color: '#c87635' },
  { id: 'pavlov', strategyId: 'pavlov', name: 'Ren',    color: '#4c9c6a' },
  { id: 'allD',   strategyId: 'allD',   name: 'Marcus', color: '#a23b3b' },
];

const PALETTE = [
  '#2dd4bf', '#34d399', '#4c9c6a',
  '#5e8ca8', '#60a5fa', '#3b82f6',
  '#a085bd', '#a78bfa', '#8b5cf6',
  '#f43f5e', '#ec4899', '#a23b3b',
  '#fb923c', '#c87635', '#ea580c',
  '#f0c674', '#fbbf24', '#94a3b8',
];

const PRESETS = [
  { id: 'sam',    name: 'Sam',    color: '#f0c674', config: { opener: 'C', mode: 'none',              reaction: 'mirror',               forgiveness: 0, noise: 0 } },
  { id: 'maya',   name: 'Maya',   color: '#5e8ca8', config: { opener: 'C', mode: 'opponent-reactive', reaction: 'mirror',               forgiveness: 0, noise: 0 } },
  { id: 'naomi',  name: 'Naomi',  color: '#a085bd', config: { opener: 'C', mode: 'opponent-reactive', reaction: 'mirror-after-two',     forgiveness: 0, noise: 0 } },
  { id: 'theo',   name: 'Theo',   color: '#c87635', config: { opener: 'C', mode: 'opponent-reactive', reaction: 'permanent-punishment', forgiveness: 0, noise: 0 } },
  { id: 'ren',    name: 'Ren',    color: '#4c9c6a', config: { opener: 'C', mode: 'outcome-reactive',  reaction: 'repeat-on-success',    forgiveness: 0, noise: 0 } },
  { id: 'marcus', name: 'Marcus', color: '#a23b3b', config: { opener: 'D', mode: 'none',              reaction: 'mirror',               forgiveness: 0, noise: 0 } },
];

const DEFAULT_STATE = () => ({
  name: '',
  color: '#2dd4bf',
  builderMode: 'simple',
  config: { opener: 'C', mode: 'opponent-reactive', reaction: 'mirror', forgiveness: 0, noise: 0 },
  rules: null,
  rulesError: null,
  previewOpponentId: 'tft',
  startedFromPresetId: null,
});

let state = DEFAULT_STATE();
let go = null;
let _gen = 0;     // preview-animation generation guard
let _raf = null;

const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initBuilderView(navigateFn) { go = navigateFn; }

export function showBuilder(params = {}) {
  state = params.prefill ? prefillFromSpec(params.prefill) : DEFAULT_STATE();
  const el = document.getElementById('view-builder');
  buildDOM(el);
  wireEvents(el);
  runPreview(el, { animate: true });
}

function prefillFromSpec(spec) {
  const d = DEFAULT_STATE();
  if (spec.rules && !spec.config) {
    return { ...d, name: spec.name || d.name, color: spec.color || d.color, builderMode: 'advanced', rules: spec.rules };
  }
  return {
    ...d,
    name: spec.name || d.name,
    color: spec.color || d.color,
    config: spec.config ? { ...d.config, ...spec.config } : d.config,
  };
}

// ── DOM ─────────────────────────────────────────────────────────────────────
function buildDOM(el) {
  el.innerHTML = `
    <div class="wsp" style="--bld-color:${state.color}">
      <header class="wsp-masthead">
        <div class="wsp-kicker"><span class="dot"></span>The Trust Game · Player Workshop</div>
        <h1 class="wsp-title">Build a <em>player</em>.</h1>
        <p class="wsp-deck">Six people taught you six ways to play. Now make your own — and watch it sit down across from them.</p>
      </header>

      <div class="wsp-grid">
        <div class="wsp-build">
          <div class="id-block">
            <div class="id-name-wrap">
              <span class="id-name-num">Name</span>
              <input class="id-name" type="text" value="${escapeHtml(state.name)}" maxlength="24" placeholder="Your player" aria-label="Player name" />
            </div>
            <div class="id-swatches" role="radiogroup" aria-label="Color">
              ${PALETTE.map(c => `<button class="id-swatch${c === state.color ? ' sel' : ''}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}
            </div>
          </div>

          <div class="presets">
            <span class="eyebrow">Start from someone you know</span>
            <div class="preset-row">
              ${PRESETS.map(p => {
                const active = p.id === state.startedFromPresetId;
                const mod = active && !configsEqual(p.config, state.config);
                return `<button class="preset${mod ? ' mod' : active ? ' sel' : ''}" data-preset="${p.id}" style="--preset-color:${p.color}"><span class="silh">${buildSilhouette(p.id, p.color, 22)}</span>${p.name}</button>`;
              }).join('')}
            </div>
          </div>

          <div class="mode-toggle" role="tablist">
            <button class="mode-btn${state.builderMode === 'simple' ? ' active' : ''}" data-mode="simple">Simple</button>
            <button class="mode-btn${state.builderMode === 'advanced' ? ' active' : ''}" data-mode="advanced">Advanced</button>
          </div>

          <div class="wsp-controls" data-controls></div>

          <div class="actions">
            <button class="wsp-btn wsp-btn-primary" data-action="save">Save player</button>
            <button class="wsp-btn wsp-btn-ghost" data-action="share">Share</button>
            <button class="wsp-btn wsp-btn-ghost" data-action="back">Back</button>
          </div>
        </div>

        <div class="wsp-arena-col">
          <div class="arena">
            <div class="thesis">
              ${state.startedFromPresetId ? `
                <div class="thesis-mark" aria-hidden="true">
                  ${buildSilhouette(state.startedFromPresetId, state.color, 64)}
                </div>
              ` : ''}
              <div class="thesis-label">This player will</div>
              <div class="thesis-text" data-thesis></div>
            </div>
            <div class="arena-head">
              <div class="arena-head-top">
                <span class="arena-eyebrow">Watch them play</span>
                <button class="arena-replay" data-action="replay" title="Replay match">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
                  Replay
                </button>
              </div>
              <div class="opp-picker" role="radiogroup" aria-label="Opponent">
                ${OPPONENTS.map(o => `<button class="opp${o.id === state.previewOpponentId ? ' sel' : ''}" data-opponent="${o.id}" style="--opp-color:${o.color}" aria-checked="${o.id === state.previewOpponentId}"><span class="pip"></span>${o.name}</button>`).join('')}
              </div>
            </div>
            <div class="scoreboard" data-scoreboard>
              <div class="score-side you">
                <span class="score-who"><span class="pip" style="background:${state.color}" data-mepip></span>You</span>
                <span class="score-val you" data-score="me">0</span>
              </div>
              <span class="score-lead" data-lead></span>
              <div class="score-side them">
                <span class="score-who"><span class="pip" data-opppip></span><span data-oppname>Maya</span></span>
                <span class="score-val them" data-score="them">0</span>
              </div>
            </div>
            <div class="grid-rows">
              <div class="grid-row"><span class="grid-tag">You</span><div class="tokens" data-tokens="me"></div></div>
              <div class="grid-row"><span class="grid-tag" data-tag="them">Maya</span><div class="tokens" data-tokens="them"></div></div>
            </div>
            <div class="chart-wrap">
              <canvas class="chart" data-chart></canvas>
              <div class="chart-caption"><span>cumulative score</span><span>${ROUNDS} rounds · seed 01</span></div>
            </div>
            <div class="verdict"><div class="verdict-text" data-verdict></div></div>
            <div class="stats" data-stats>
              <div class="stat"><div class="stat-num" data-stat="coop"></div><div class="stat-lbl">Mutual share</div></div>
              <div class="stat"><div class="stat-num" data-stat="share"></div><div class="stat-lbl">You shared</div></div>
              <div class="stat"><div class="stat-num" data-stat="margin"></div><div class="stat-lbl">Margin</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="wsp-toast" data-toast aria-live="polite"></div>
    </div>
  `;
  renderControls(el);
}

function renderControls(el) {
  const c = el.querySelector('[data-controls]');
  c.innerHTML = state.builderMode === 'advanced' ? advancedHTML() : simpleHTML();
}

// ── Simple controls (numbered spec sheet) ──────────────────────────────────────
function simpleHTML() {
  const { opener, mode, reaction, forgiveness, noise } = state.config;
  const secs = [];

  secs.push(section('First move',
    `Sam opened by sharing. Marcus opened by taking. What does yours do?`,
    chips('opener', opener, [['C', 'Cooperate'], ['D', 'Defect'], ['random', 'Random']])));

  secs.push(section('What they watch',
    `Maya watched <em>what you did</em>. Ren watched <em>how the round turned out</em>. Sam and Marcus watched nothing.`,
    chips('mode', mode, [['opponent-reactive', 'What you did'], ['outcome-reactive', 'How it went'], ['none', 'Nothing'], ['random', 'Random']])));

  if (mode === 'opponent-reactive') {
    secs.push(section('How they react',
      `Mirror it — like Maya. Wait for two — like Naomi. Never forgive a single one — like Theo.`,
      chips('reaction', reaction, [['mirror', 'Mirror'], ['mirror-after-two', 'After two'], ['permanent-punishment', 'Never forgive']])));
  } else if (mode === 'outcome-reactive') {
    secs.push(section('How they react',
      `Stick with what worked, switch when it didn’t — that’s how Ren played.`,
      chips('reaction', reaction, [['repeat-on-success', 'Repeat what worked'], ['flip-on-success', 'Switch when it works']])));
  }

  if (mode === 'opponent-reactive' && reaction === 'mirror') {
    secs.push(slider('Forgiveness', 'forgiveness', forgiveness, forgivenessRegion(forgiveness),
      `At 10% this is <em>Generous Tit-for-Tat</em> — Maya, but she lets one defection in ten slide. Often wins against noisy opponents.`));
  }

  secs.push(slider('Execution noise', 'noise', noise, noiseRegion(noise),
    `Sometimes you mean to share but your hand slips. Strict strategies get hurt by <em>noise</em>. Forgiving ones recover.`));

  return `<div class="spec">${secs.map((html, i) => html.replace('%%NUM%%', String(i + 1).padStart(2, '0'))).join('')}</div>`;
}

function section(title, note, optsHtml, readout = '') {
  return `
    <div class="section">
      <div class="sec-num">%%NUM%%</div>
      <div class="sec-body">
        <div class="sec-head"><span class="sec-title">${title}</span>${readout}</div>
        <p class="note">${note}</p>
        <div class="opts">${optsHtml}</div>
      </div>
    </div>`;
}

function slider(title, field, value, region, note) {
  const fill = `${(value / 0.3) * 100}%`;
  const readout = `<span class="sec-readout"><span class="sec-region" data-${field}-region>${region}</span><span class="sec-pct" data-${field}-pct>${pct(value)}</span></span>`;
  return `
    <div class="section">
      <div class="sec-num">%%NUM%%</div>
      <div class="sec-body">
        <div class="sec-head"><span class="sec-title">${title}</span>${readout}</div>
        <p class="note">${note}</p>
        <div class="slider-wrap">
          <input class="slider" type="range" min="0" max="0.3" step="0.01" value="${value}" style="--fill:${fill}" data-field="${field}" />
          <div class="scale-ticks"><span>0%</span><span>15%</span><span>30%</span></div>
        </div>
      </div>
    </div>`;
}

function chips(field, current, options) {
  return options.map(([v, l]) =>
    `<button class="opt${String(v) === String(current) ? ' sel' : ''}" data-field="${field}" data-value="${v}" role="radio" aria-checked="${String(v) === String(current)}">${l}</button>`
  ).join('');
}

// ── Advanced editor ──────────────────────────────────────────────────────────
function advancedHTML() {
  if (!state.rules) state.rules = configToRules(state.config) ?? [{ if: 'always', then: 'cooperate' }];
  const json = JSON.stringify(state.rules, null, 2);
  return `
    <div class="adv">
      <p class="note">Ordered list. The first matching condition fires its action. End with <code>{ "if": "always", … }</code> so every situation has a move.</p>
      <textarea class="adv-editor${state.rulesError ? ' err' : ''}" data-rules-editor spellcheck="false">${escapeHtml(json)}</textarea>
      ${state.rulesError ? `<p class="adv-error" data-rules-error>${escapeHtml(state.rulesError)}</p>` : ''}
      <details class="adv-ref">
        <summary>Vocabulary</summary>
        <p class="adv-ref-line"><b>Conditions:</b> always · first-round · last-round · round-equals N · opponent-last-was C|D · opponent-defected-in-last N · opponent-defected-count-in-last N at-least K · opponent-defection-rate-above P · opponent-ever-defected · i-last-played C|D · last-round-was CC|CD|DC|DD · last-round-payoff-was-good · probability P</p>
        <p class="adv-ref-line"><b>Actions:</b> cooperate · defect · mirror-opponent · repeat-last-move · flip-last-move · random · random-weighted P</p>
        <p class="adv-ref-line"><b>Composites:</b> <code>{ "and": [c1, c2] }</code> · <code>{ "or": [c1, c2] }</code> · <code>{ "not": c }</code></p>
      </details>
    </div>`;
}

// ── Events ─────────────────────────────────────────────────────────────────────
function wireEvents(el) {
  // Name
  el.querySelector('.id-name').addEventListener('input', e => { state.name = e.target.value; });

  // Swatches
  el.querySelector('.id-swatches').addEventListener('click', e => {
    const sw = e.target.closest('.id-swatch');
    if (!sw) return;
    state.color = sw.dataset.color;
    el.querySelectorAll('.id-swatch').forEach(s => s.classList.toggle('sel', s === sw));
    el.querySelector('.wsp').style.setProperty('--bld-color', state.color);
    const mepip = el.querySelector('[data-mepip]'); if (mepip) mepip.style.background = state.color;
    runPreview(el, { animate: false });
  });

  // Presets
  el.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
    const p = PRESETS.find(x => x.id === btn.dataset.preset);
    if (!p) return;
    state.color = p.color;
    state.config = { ...p.config };
    state.builderMode = 'simple';
    state.rules = null; state.rulesError = null;
    state.startedFromPresetId = p.id;
    if (!state.name || /^Like /.test(state.name)) state.name = `Like ${p.name}`;
    buildDOM(el); wireEvents(el); runPreview(el, { animate: true });
  }));

  // Mode toggle
  el.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
    const m = btn.dataset.mode;
    if (m === state.builderMode) return;
    state.builderMode = m;
    el.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    renderControls(el);
    runPreview(el, { animate: true });
  }));

  // Opponent picker
  el.querySelectorAll('[data-opponent]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.opponent;
    if (id === state.previewOpponentId) return;
    state.previewOpponentId = id;
    el.querySelectorAll('[data-opponent]').forEach(b => b.classList.toggle('sel', b.dataset.opponent === id));
    runPreview(el, { animate: true });
  }));

  // Chips + sliders (delegated)
  el.addEventListener('click', e => {
    const chip = e.target.closest('.opt');
    if (chip) handleChip(el, chip.dataset.field, chip.dataset.value);
  });
  el.addEventListener('input', e => {
    const sl = e.target.closest('.slider');
    if (sl) { handleSlider(el, sl.dataset.field, parseFloat(sl.value), sl); return; }
    const ed = e.target.closest('[data-rules-editor]');
    if (ed) handleRulesChange(el, ed.value);
  });

  // Actions
  el.querySelector('[data-action="save"]').addEventListener('click', () => saveAndExit(el));
  el.querySelector('[data-action="share"]').addEventListener('click', () => shareLink(el));
  el.querySelector('[data-action="back"]').addEventListener('click', () => go && go('evolution'));
  el.querySelector('[data-action="replay"]').addEventListener('click', () => runPreview(el, { animate: true }));
}

function handleChip(el, field, value) {
  if (field === 'mode') {
    state.config.mode = value;
    if (value === 'opponent-reactive') state.config.reaction = 'mirror';
    else if (value === 'outcome-reactive') state.config.reaction = 'repeat-on-success';
  } else {
    state.config[field] = value;
  }
  state.rules = null;
  renderControls(el);          // conditional sections may have changed
  updatePresetChips(el);
  runPreview(el, { animate: true });
}

function handleSlider(el, field, value, sliderEl) {
  state.config[field] = value;
  state.rules = null;
  sliderEl.style.setProperty('--fill', `${(value / 0.3) * 100}%`);
  const pctEl = el.querySelector(`[data-${field}-pct]`);
  const regEl = el.querySelector(`[data-${field}-region]`);
  if (pctEl) pctEl.textContent = pct(value);
  if (regEl) regEl.textContent = field === 'noise' ? noiseRegion(value) : forgivenessRegion(value);
  updatePresetChips(el);
  runPreview(el, { animate: false });
}

function updatePresetChips(el) {
  el.querySelectorAll('[data-preset]').forEach(btn => {
    const p = PRESETS.find(x => x.id === btn.dataset.preset);
    const active = p.id === state.startedFromPresetId;
    const mod = active && !configsEqual(p.config, state.config);
    btn.classList.toggle('sel', active && !mod);
    btn.classList.toggle('mod', mod);
  });
}

function handleRulesChange(el, raw) {
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { state.rulesError = `JSON: ${e.message}`; showRulesError(el); return; }
  if (!Array.isArray(parsed)) { state.rulesError = 'Rules must be an array.'; showRulesError(el); return; }
  try { compileStrategy({ id: 'preview', rules: parsed, version: 1 }); }
  catch (e) { state.rulesError = e.message; showRulesError(el); return; }
  state.rules = parsed; state.rulesError = null; showRulesError(el);
  runPreview(el, { animate: false });
}

function showRulesError(el) {
  const ed = el.querySelector('[data-rules-editor]');
  ed?.classList.toggle('err', !!state.rulesError);
  let errEl = el.querySelector('[data-rules-error]');
  if (state.rulesError) {
    if (!errEl) { errEl = document.createElement('p'); errEl.className = 'adv-error'; errEl.dataset.rulesError = ''; ed.parentNode.insertBefore(errEl, ed.nextSibling); }
    errEl.textContent = state.rulesError;
  } else if (errEl) { errEl.remove(); }
}

// ── Live preview ──────────────────────────────────────────────────────────────
function runPreview(el, opts = {}) {
  const animate = (opts.animate ?? false) && !REDUCED;
  _gen += 1; const gen = _gen;
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }

  // Thesis
  el.querySelector('[data-thesis]').textContent = state.builderMode === 'advanced'
    ? `apply ${(state.rules ?? []).length} rule${(state.rules ?? []).length === 1 ? '' : 's'} from top to bottom each round.`
    : behaviorSummary(state.config);

  // Compile / run
  let result, compiled;
  try { compiled = compileStrategy(specForPreview()); }
  catch (err) { setError(el, err.message); return; }
  const oppMeta = OPPONENTS.find(o => o.id === state.previewOpponentId) ?? OPPONENTS[0];
  const opponent = compileStrategy(REGISTRY[oppMeta.strategyId]);
  result = runMatch(compiled, opponent, { rounds: ROUNDS, noise: state.builderMode === 'simple' ? state.config.noise : 0, masterSeed: SEED });

  // Opponent labels + colors
  el.querySelector('[data-oppname]').textContent = oppMeta.name;
  el.querySelector('[data-tag="them"]').textContent = oppMeta.name;
  el.querySelector('[data-opppip]').style.background = oppMeta.color;
  el.querySelector('[data-scoreboard]').style.setProperty('--opp-color', oppMeta.color);

  const canvas   = el.querySelector('[data-chart]');
  const meTokens = el.querySelector('[data-tokens="me"]');
  const thTokens = el.querySelector('[data-tokens="them"]');
  const meScore  = el.querySelector('[data-score="me"]');
  const thScore  = el.querySelector('[data-score="them"]');
  const leadEl   = el.querySelector('[data-lead]');
  const verdict  = el.querySelector('[data-verdict]');
  const statsEl  = el.querySelector('[data-stats]');
  const meScoreEl = meScore, thScoreEl = thScore;

  const hist = result.history;
  const perTok = Math.min(58, ANIM_MS / ROUNDS);

  // Tokens (fresh nodes → CSS entrance animation replays)
  meTokens.innerHTML = hist.map((h, i) => `<span class="tok me ${h.aMove}${animate ? '' : ' instant'}" style="${animate ? `animation-delay:${i * perTok}ms` : ''}"></span>`).join('');
  thTokens.innerHTML = hist.map((h, i) => `<span class="tok ${h.bMove}${animate ? '' : ' instant'}" style="${animate ? `animation-delay:${i * perTok}ms` : ''}"></span>`).join('');

  // Settled stats
  const bothCoop  = hist.filter(h => h.aMove === 'C' && h.bMove === 'C').length;
  const shareRate = Math.round(hist.filter(h => h.aMove === 'C').length / hist.length * 100);
  const margin    = result.finalScoreA - result.finalScoreB;

  const settle = () => {
    meScoreEl.textContent = result.finalScoreA;
    thScoreEl.textContent = result.finalScoreB;
    meScoreEl.classList.remove('bump'); thScoreEl.classList.remove('bump');
    void meScoreEl.offsetWidth;
    meScoreEl.classList.add('bump'); thScoreEl.classList.add('bump');
    leadEl.textContent = leadLabel(result, oppMeta.name);
    drawChart(canvas, result, state.color, oppMeta.color, ROUNDS);
    verdict.innerHTML = verdictHTML(result.finalScoreA, result.finalScoreB, oppMeta.name, bothCoop);
    el.querySelector('.verdict-text').style.opacity = 1;
    statsEl.style.opacity = 1;
    statsEl.querySelector('[data-stat="coop"]').innerHTML = `${bothCoop}<span style="color:var(--fg-faint);font-size:0.7em">/${ROUNDS}</span>`;
    statsEl.querySelector('[data-stat="share"]').textContent = `${shareRate}%`;
    const mEl = statsEl.querySelector('[data-stat="margin"]');
    mEl.textContent = `${margin > 0 ? '+' : ''}${margin}`;
    mEl.style.color = margin > 0 ? 'var(--share)' : margin < 0 ? 'var(--take)' : 'var(--fg)';
  };

  // settle() must run exactly once per preview, even if rAF is throttled
  // (background tabs / embedded frames pause requestAnimationFrame).
  let settled = false;
  const finish = () => { if (settled || gen !== _gen) return; settled = true; settle(); };

  if (!animate) { finish(); return; }

  // Animated reveal — count scores up + draw chart progressively.
  verdict.innerHTML = 'Playing it out…';
  el.querySelector('.verdict-text').style.opacity = 0.4;
  statsEl.style.opacity = 0.3;
  let start;
  const frame = now => {
    if (gen !== _gen || settled) return;
    if (!start) start = now;
    const t = Math.min(1, (now - start) / ANIM_MS);
    const k = Math.max(0, Math.floor(t * ROUNDS));
    meScoreEl.textContent = k > 0 ? hist[k - 1].aCumulative : 0;
    thScoreEl.textContent = k > 0 ? hist[k - 1].bCumulative : 0;
    leadEl.textContent = t < 1 ? `round ${k}/${ROUNDS}` : leadLabel(result, oppMeta.name);
    drawChart(canvas, result, state.color, oppMeta.color, k);
    if (t < 1) { _raf = requestAnimationFrame(frame); }
    else { _raf = null; finish(); }
  };
  _raf = requestAnimationFrame(frame);
  // Guarantee completion even if rAF never fires.
  setTimeout(finish, ANIM_MS + 150);
}

function setError(el, msg) {
  el.querySelector('[data-tokens="me"]').innerHTML = '';
  el.querySelector('[data-tokens="them"]').innerHTML = '';
  const v = el.querySelector('[data-verdict]');
  v.innerHTML = `<span style="color:var(--take)">${escapeHtml(msg)}</span>`;
  el.querySelector('.verdict-text').style.opacity = 1;
}

function specForPreview() {
  const base = { id: 'preview', name: state.name || 'Preview', color: state.color, version: 1 };
  return state.builderMode === 'advanced' ? { ...base, rules: state.rules } : { ...base, config: state.config };
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function drawChart(canvas, result, myColor, themColor, reveal) {
  if (!canvas || !result) return;
  const cssW = canvas.clientWidth || 360;
  const cssH = canvas.clientHeight || 120;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) { canvas.width = cssW * dpr; canvas.height = cssH * dpr; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const h = result.history;
  const n = h.length;
  const maxScore = Math.max(result.finalScoreA, result.finalScoreB, 1);
  const padX = 2, padT = 8, padB = 4;
  const xAt = i => padX + (cssW - 2 * padX) * (i / (n - 1 || 1));
  const yAt = s => cssH - padB - (cssH - padT - padB) * (s / maxScore);

  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1;
  for (let q = 0; q <= 4; q++) {
    const y = padT + (cssH - padT - padB) * (q / 4);
    ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(cssW - padX, y); ctx.stroke();
  }

  const lim = Math.max(1, Math.min(reveal, n));
  const drawLine = (vals, color, fill) => {
    if (fill) {
      const grad = ctx.createLinearGradient(0, padT, 0, cssH);
      grad.addColorStop(0, hexA(color, 0.18));
      grad.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(xAt(0), yAt(0));
      vals.slice(0, lim).forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
      ctx.lineTo(xAt(lim - 1), cssH - padB);
      ctx.lineTo(xAt(0), cssH - padB);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    vals.slice(0, lim).forEach((v, i) => { const x = xAt(i), y = yAt(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
    if (lim >= 1) { const i = lim - 1; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(xAt(i), yAt(vals[i]), 2.6, 0, Math.PI * 2); ctx.fill(); }
  };
  drawLine(h.map(x => x.bCumulative), themColor, false);
  drawLine(h.map(x => x.aCumulative), myColor, true);
}

function hexA(hex, a) {
  const c = hex.replace('#', '');
  return `rgba(${parseInt(c.substring(0, 2), 16)},${parseInt(c.substring(2, 4), 16)},${parseInt(c.substring(4, 6), 16)},${a})`;
}

// ── Text ────────────────────────────────────────────────────────────────────
function verdictHTML(a, b, opp, bothCoop) {
  const m = a - b;
  if (m === 0)  return `Dead even at <b>${a}</b>. Neither of you could pull ahead.`;
  if (bothCoop >= ROUNDS * 0.85 && m >= 0) return `You both kept sharing — <b>${a}</b> to ${b}. This is what cooperation pays.`;
  if (m > 0 && m <= 4) return `You edged ${opp} by <b>${m}</b>. Close, but it held.`;
  if (m > 0)  return `You came out ahead, <b>+${m}</b> — but watch how you got there.`;
  if (m >= -4) return `${opp} edged you by <b>${Math.abs(m)}</b>.`;
  return `${opp} beat you by <b>${Math.abs(m)}</b>. Something in the build is bleeding points.`;
}

function leadLabel(result, opp) {
  const m = result.finalScoreA - result.finalScoreB;
  if (m === 0) return 'dead even';
  return m > 0 ? `you +${m}` : `${opp} +${Math.abs(m)}`;
}

function behaviorSummary({ opener, mode, reaction, forgiveness, noise }) {
  if (mode === 'random') return 'flip a coin every round — nothing else matters.';
  if (mode === 'none') {
    return opener === 'C' ? 'cooperate every round, no matter what.'
         : opener === 'D' ? 'defect every round, no matter what.'
         : 'make a random first move, then stick with it.';
  }
  const open = opener === 'C' ? 'cooperate first' : opener === 'D' ? 'defect first' : 'open with a coin flip';
  let react;
  if (mode === 'opponent-reactive') {
    react = reaction === 'mirror' ? 'mirror what you did last'
          : reaction === 'mirror-after-two' ? 'only retaliate after two defections in a row'
          : 'cooperate until you defect once, then defect forever';
    if (reaction === 'mirror' && forgiveness > 0) react += `, forgiving ${pct(forgiveness)} of the time`;
  } else {
    react = reaction === 'repeat-on-success' ? 'repeat what worked, switch when it didn’t'
          : 'switch when it worked, repeat when it didn’t';
  }
  let s = `${open}, then ${react}.`;
  if (noise > 0) s += ` ${pct(noise)} of moves flip by accident.`;
  return s;
}

const pct = x => `${Math.round(x * 100)}%`;
function forgivenessRegion(v) { return v < 0.01 ? 'Strict' : v < 0.05 ? 'Lenient' : v < 0.15 ? 'Generous TfT' : 'Very forgiving'; }
function noiseRegion(v) { return v < 0.01 ? 'Clean' : v < 0.05 ? 'Realistic' : v < 0.15 ? 'Noisy' : 'Chaotic'; }
function configsEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ── Save / Share ──────────────────────────────────────────────────────────────
function buildSpec() {
  const name = (state.name || '').trim() || 'Untitled';
  const base = { id: `player-${Date.now()}-${Math.floor(Math.random() * 1000)}`, name, color: state.color, source: 'player', createdAt: Date.now(), version: 1 };
  return state.builderMode === 'advanced'
    ? { ...base, rules: state.rules, description: `${(state.rules ?? []).length} rules` }
    : { ...base, config: { ...state.config }, description: behaviorSummary(state.config) };
}

function saveAndExit(el) {
  saveUserStrategy(buildSpec());
  const btn = el.querySelector('[data-action="save"]');
  btn.textContent = 'Saved ✓';
  btn.disabled = true;
  setTimeout(() => go && go('evolution'), 700);
}

async function shareLink(el) {
  const spec = buildSpec(); delete spec.id; delete spec.createdAt;
  const url = `${location.origin}${location.pathname}?play=${encodeStrategy(spec)}`;
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; }
  catch { window.prompt('Copy this link:', url); }
  toast(el, copied ? 'Link copied to clipboard' : 'Copy the link from the prompt');
}

function toast(el, msg) {
  const t = el.querySelector('[data-toast]');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1900);
}
