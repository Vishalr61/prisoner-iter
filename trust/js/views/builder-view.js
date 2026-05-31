// Builder view — Phase 2 (Session A).
// Five-control simplified-config UI + live preview vs Maya (TfT).
// Saves to localStorage.userStrategies[].
// Advanced rule editor, URL encoding, and the test-in-tournament sidebar
// come in Session B.

import { compileStrategy, configToRules } from '../../../core/strategy.js';
import { REGISTRY }                        from '../../../core/registry.js';
import { runMatch }                        from '../../../core/match.js';
import { saveUserStrategy }                from '../progress.js';

const PREVIEW_ROUNDS = 20;
const PREVIEW_OPPONENT_ID = 'tft';   // Maya
const PREVIEW_SEED = 1;

// Default starting config: TfT-shape. Familiar, easy to mutate.
const DEFAULT_STATE = () => ({
  name:  'Your player',
  color: '#2dd4bf',
  config: {
    opener:      'C',
    mode:        'opponent-reactive',
    reaction:    'mirror',
    forgiveness: 0,
    noise:       0,
  },
});

const COLOR_SWATCHES = [
  '#2dd4bf', '#f43f5e', '#f0c674', '#5e8ca8', '#c87635',
  '#a085bd', '#4c9c6a', '#94a3b8', '#a23b3b',
];

let state = DEFAULT_STATE();
let go = null;

export function initBuilderView(navigateFn) {
  go = navigateFn;
}

export function showBuilder() {
  state = DEFAULT_STATE();
  const el = document.getElementById('view-builder');
  buildDOM(el);
  wireEvents(el);
  refreshPreview(el);
}

// ── DOM ───────────────────────────────────────────────────────────────────────

function buildDOM(el) {
  el.innerHTML = `
    <div class="bld-wrap" style="--bld-color:${state.color}">
      <header class="bld-header">
        <h1 class="bld-title">Build a player</h1>
        <p class="bld-subtitle">Five choices. Watch them play Maya.</p>
      </header>

      <div class="bld-identity">
        <input class="bld-name" type="text" value="${state.name}" maxlength="24" aria-label="Name" />
        <div class="bld-swatches" role="radiogroup" aria-label="Color">
          ${COLOR_SWATCHES.map(c => `
            <button class="bld-swatch${c === state.color ? ' selected' : ''}"
              data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>
          `).join('')}
        </div>
      </div>

      <section class="bld-section">
        <h2 class="bld-label">First move</h2>
        ${chips('opener', state.config.opener, [
          { v: 'C',      l: 'Cooperate' },
          { v: 'D',      l: 'Defect' },
          { v: 'random', l: 'Random' },
        ])}
      </section>

      <section class="bld-section">
        <h2 class="bld-label">What they react to</h2>
        ${chips('mode', state.config.mode, [
          { v: 'opponent-reactive', l: 'What you did' },
          { v: 'outcome-reactive',  l: 'How it went' },
          { v: 'none',              l: 'Nothing' },
          { v: 'random',            l: 'Random' },
        ])}
      </section>

      <section class="bld-section bld-reaction"></section>

      <section class="bld-section bld-forgiveness"></section>

      <section class="bld-section">
        <h2 class="bld-label">Execution noise <span class="bld-pct" data-noise-pct>0%</span></h2>
        <p class="bld-hint">Chance any chosen move flips by accident.</p>
        <input class="bld-slider" type="range" min="0" max="0.3" step="0.01"
          value="${state.config.noise}" data-field="noise" />
      </section>

      <div class="bld-summary" data-summary></div>

      <section class="bld-preview">
        <h2 class="bld-label">Watch them play Maya</h2>
        <div class="bld-preview-row">
          <span class="bld-preview-name">You</span>
          <div class="bld-dots" data-dots="me"></div>
          <span class="bld-preview-score" data-score="me">0</span>
        </div>
        <div class="bld-preview-row">
          <span class="bld-preview-name">Maya</span>
          <div class="bld-dots" data-dots="them"></div>
          <span class="bld-preview-score" data-score="them">0</span>
        </div>
      </section>

      <div class="bld-actions">
        <button class="btn btn-primary" data-action="save">Save player</button>
        <button class="btn btn-ghost"   data-action="back">Back</button>
      </div>
    </div>
  `;

  renderConditionalSections(el);
}

function chips(field, current, options) {
  return `<div class="bld-chips" role="radiogroup">
    ${options.map(o => `
      <button class="bld-chip${o.v === current ? ' selected' : ''}"
        data-field="${field}" data-value="${o.v}" role="radio"
        aria-checked="${o.v === current}">${o.l}</button>
    `).join('')}
  </div>`;
}

// Renders the reaction-style and forgiveness sections — they depend on `mode`
// and `reaction`, so we re-render whenever those change.
function renderConditionalSections(el) {
  const reactionEl = el.querySelector('.bld-reaction');
  const forgEl     = el.querySelector('.bld-forgiveness');
  const { mode, reaction, forgiveness } = state.config;

  let reactionHtml = '';
  if (mode === 'opponent-reactive') {
    reactionHtml = `
      <h2 class="bld-label">How they react</h2>
      ${chips('reaction', reaction, [
        { v: 'mirror',                l: 'Mirror' },
        { v: 'mirror-after-two',      l: 'After two' },
        { v: 'permanent-punishment',  l: 'Never forgive' },
      ])}
    `;
  } else if (mode === 'outcome-reactive') {
    reactionHtml = `
      <h2 class="bld-label">How they react</h2>
      ${chips('reaction', reaction, [
        { v: 'repeat-on-success', l: 'Repeat what worked' },
        { v: 'flip-on-success',   l: 'Switch when it works' },
      ])}
    `;
  }
  reactionEl.innerHTML = reactionHtml;

  // Forgiveness only matters for the classic mirror case
  if (mode === 'opponent-reactive' && reaction === 'mirror') {
    forgEl.innerHTML = `
      <h2 class="bld-label">Forgiveness <span class="bld-pct" data-forg-pct>${pct(forgiveness)}</span></h2>
      <p class="bld-hint">Chance of cooperating despite a defection.</p>
      <input class="bld-slider" type="range" min="0" max="0.3" step="0.01"
        value="${forgiveness}" data-field="forgiveness" />
    `;
  } else {
    forgEl.innerHTML = '';
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

function wireEvents(el) {
  // Name
  el.querySelector('.bld-name').addEventListener('input', e => {
    state.name = e.target.value;
  });

  // Colors
  el.querySelector('.bld-swatches').addEventListener('click', e => {
    const sw = e.target.closest('.bld-swatch');
    if (!sw) return;
    state.color = sw.dataset.color;
    el.querySelectorAll('.bld-swatch').forEach(s => s.classList.toggle('selected', s === sw));
    el.querySelector('.bld-wrap').style.setProperty('--bld-color', state.color);
  });

  // Chips + sliders — delegated
  el.addEventListener('click', e => {
    const chip = e.target.closest('.bld-chip');
    if (!chip) return;
    const { field, value } = chip.dataset;
    handleConfigChange(el, field, value);
  });

  el.addEventListener('input', e => {
    const slider = e.target.closest('.bld-slider');
    if (!slider) return;
    const { field } = slider.dataset;
    handleConfigChange(el, field, parseFloat(slider.value));
  });

  // Buttons
  el.querySelector('[data-action="save"]').addEventListener('click', () => saveAndExit(el));
  el.querySelector('[data-action="back"]').addEventListener('click', () => go('evolution'));
}

function handleConfigChange(el, field, value) {
  if (field === 'mode') {
    state.config.mode = value;
    // Reset reaction to a sensible default for the new mode
    if (value === 'opponent-reactive') state.config.reaction = 'mirror';
    else if (value === 'outcome-reactive') state.config.reaction = 'repeat-on-success';
  } else {
    state.config[field] = value;
  }

  // Re-render conditional sections (reaction style + forgiveness visibility)
  renderConditionalSections(el);

  // Mark selected chips
  el.querySelectorAll('.bld-chip').forEach(c => {
    c.classList.toggle('selected',
      c.dataset.field in state.config &&
      String(state.config[c.dataset.field]) === c.dataset.value);
  });

  // Update slider percentage labels
  el.querySelector('[data-noise-pct]').textContent = pct(state.config.noise);
  const forgPct = el.querySelector('[data-forg-pct]');
  if (forgPct) forgPct.textContent = pct(state.config.forgiveness);

  refreshPreview(el);
}

// ── Live preview ──────────────────────────────────────────────────────────────

function refreshPreview(el) {
  const summaryEl = el.querySelector('[data-summary]');
  summaryEl.textContent = behaviorSummary(state.config);

  // Compile the in-progress strategy
  let compiled;
  try {
    compiled = compileStrategy({
      id: 'preview',
      name: state.name || 'Preview',
      color: state.color,
      config: state.config,
      version: 1,
    });
  } catch (err) {
    setPreviewError(el, err.message);
    return;
  }

  const opponent = compileStrategy(REGISTRY[PREVIEW_OPPONENT_ID]);
  const result = runMatch(compiled, opponent, {
    rounds:     PREVIEW_ROUNDS,
    noise:      state.config.noise,
    masterSeed: PREVIEW_SEED,
  });

  renderDots(el.querySelector('[data-dots="me"]'),   result.history.map(h => h.aMove), state.color);
  renderDots(el.querySelector('[data-dots="them"]'), result.history.map(h => h.bMove), REGISTRY.tft.color);
  el.querySelector('[data-score="me"]').textContent   = result.finalScoreA;
  el.querySelector('[data-score="them"]').textContent = result.finalScoreB;
}

function renderDots(container, moves, color) {
  container.innerHTML = moves.map(m =>
    `<span class="bld-dot bld-dot-${m}" style="${m === 'C' ? `background:${color}` : ''}"></span>`
  ).join('');
}

function setPreviewError(el, msg) {
  el.querySelector('[data-dots="me"]').innerHTML   = `<span class="bld-error">${msg}</span>`;
  el.querySelector('[data-dots="them"]').innerHTML = '';
}

// ── Behavior summary in plain English ─────────────────────────────────────────

function behaviorSummary({ opener, mode, reaction, forgiveness, noise }) {
  if (mode === 'random') return 'Coin flip every round. Nothing else matters.';
  if (mode === 'none') {
    return opener === 'C' ? 'Cooperates every round, no matter what.'
         : opener === 'D' ? 'Defects every round, no matter what.'
         : 'Random first move, then sticks with it.';
  }

  const open = opener === 'C' ? 'Cooperates first' : opener === 'D' ? 'Defects first' : 'Opens with a coin flip';

  let react = '';
  if (mode === 'opponent-reactive') {
    react = reaction === 'mirror' ? 'mirrors what you did last'
          : reaction === 'mirror-after-two' ? 'only retaliates after two defections in a row'
          : 'cooperates until you defect once, then defects forever';
    if (reaction === 'mirror' && forgiveness > 0) {
      react += `, forgives ${pct(forgiveness)} of the time`;
    }
  } else {
    react = reaction === 'repeat-on-success' ? 'repeats what worked, switches when it didn\'t'
          : 'switches when it worked, repeats when it didn\'t';
  }

  let s = `${open}, then ${react}.`;
  if (noise > 0) s += ` ${pct(noise)} of moves flip by accident.`;
  return s;
}

function pct(x) { return `${Math.round(x * 100)}%`; }

// ── Save ──────────────────────────────────────────────────────────────────────

function saveAndExit(el) {
  const name = (state.name || '').trim() || 'Untitled';
  const spec = {
    id:          `player-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    color:       state.color,
    source:      'player',
    description: behaviorSummary(state.config),
    config:      { ...state.config },
    createdAt:   Date.now(),
    version:     1,
  };
  saveUserStrategy(spec);

  // Brief confirmation, then back to evolution
  const saveBtn = el.querySelector('[data-action="save"]');
  saveBtn.textContent = 'Saved ✓';
  saveBtn.disabled = true;
  setTimeout(() => go('evolution'), 700);
}
