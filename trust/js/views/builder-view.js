// Builder view — Phase 2 (Session A).
// Five-control simplified-config UI + live preview vs Maya (TfT).
// Saves to localStorage.userStrategies[].
// Advanced rule editor, URL encoding, and the test-in-tournament sidebar
// come in Session B.

import { compileStrategy, configToRules, encodeStrategy } from '../../../core/strategy.js';
import { REGISTRY }                        from '../../../core/registry.js';
import { runMatch }                        from '../../../core/match.js';
import { saveUserStrategy }                from '../progress.js';
import { buildSilhouette }                 from '../silhouette.js';

const PREVIEW_ROUNDS = 20;
const PREVIEW_SEED   = 1;

// Preview opponents — the six campaign characters, in narrative order.
// User can pick which one the preview plays against. Default Maya (TfT)
// because she's the canonical reciprocator and gives the richest feedback
// for cooperative-leaning builds.
const PREVIEW_OPPONENTS = [
  { id: 'allC',   strategyId: 'allC',   name: 'Sam',    color: '#f0c674' },
  { id: 'tft',    strategyId: 'tft',    name: 'Maya',   color: '#5e8ca8' },
  { id: 'tf2t',   strategyId: 'tf2t',   name: 'Naomi',  color: '#a085bd' },
  { id: 'grim',   strategyId: 'grim',   name: 'Theo',   color: '#c87635' },
  { id: 'pavlov', strategyId: 'pavlov', name: 'Ren',    color: '#4c9c6a' },
  { id: 'allD',   strategyId: 'allD',   name: 'Marcus', color: '#a23b3b' },
];

// Animation gating — each refreshPreview increments this. Animation
// callbacks check that they're still the latest before continuing, so a
// rapid sequence of changes doesn't overlap into garbled output.
let _previewGen = 0;

// Default starting config: TfT-shape. Familiar, easy to mutate.
const DEFAULT_STATE = () => ({
  name:  'Your player',
  color: '#2dd4bf',
  // Builder mode: 'simple' uses the 5-control config UI; 'advanced' exposes
  // the raw condition-action rules as editable JSON.
  builderMode: 'simple',
  config: {
    opener:      'C',
    mode:        'opponent-reactive',
    reaction:    'mirror',
    forgiveness: 0,
    noise:       0,
  },
  // Only used when builderMode === 'advanced'. Populated from configToRules
  // the first time the user switches modes.
  rules: null,
  // Error message shown in advanced mode if the JSON doesn't parse or compile.
  rulesError: null,
  // Which preview opponent to play against in the live preview.
  previewOpponentId: 'tft',
  // Which preset the user started from (or null). The preset chip shows
  // a "selected" state when this matches, "modified" if state.config has
  // since drifted from the preset's original config.
  startedFromPresetId: null,
});

// Curated palette — 6 families × 3 weights. Familiar character colors
// are included so a preset's swatch is still selectable, but the wider
// palette removes the "everything looks like a cast member" constraint.
const COLOR_SWATCHES = [
  // teals / greens
  '#2dd4bf', '#34d399', '#4c9c6a',
  // blues
  '#5e8ca8', '#60a5fa', '#3b82f6',
  // purples
  '#a085bd', '#a78bfa', '#8b5cf6',
  // pinks / reds
  '#f43f5e', '#ec4899', '#a23b3b',
  // oranges
  '#fb923c', '#c87635', '#ea580c',
  // yellows / neutrals
  '#f0c674', '#fbbf24', '#94a3b8',
];

// Character presets — clicking one fills the config + color so the user is
// modifying someone they know rather than configuring from zero. The configs
// match what each canonical character's strategy compiles to.
const CHARACTER_PRESETS = [
  { id: 'sam',    name: 'Sam',    color: '#f0c674',
    config: { opener: 'C', mode: 'none',              reaction: 'mirror',                forgiveness: 0,   noise: 0 } },
  { id: 'maya',   name: 'Maya',   color: '#5e8ca8',
    config: { opener: 'C', mode: 'opponent-reactive', reaction: 'mirror',                forgiveness: 0,   noise: 0 } },
  { id: 'naomi',  name: 'Naomi',  color: '#a085bd',
    config: { opener: 'C', mode: 'opponent-reactive', reaction: 'mirror-after-two',      forgiveness: 0,   noise: 0 } },
  { id: 'theo',   name: 'Theo',   color: '#c87635',
    config: { opener: 'C', mode: 'opponent-reactive', reaction: 'permanent-punishment',  forgiveness: 0,   noise: 0 } },
  { id: 'ren',    name: 'Ren',    color: '#4c9c6a',
    config: { opener: 'C', mode: 'outcome-reactive',  reaction: 'repeat-on-success',     forgiveness: 0,   noise: 0 } },
  { id: 'marcus', name: 'Marcus', color: '#a23b3b',
    config: { opener: 'D', mode: 'none',              reaction: 'mirror',                forgiveness: 0,   noise: 0 } },
];

let state = DEFAULT_STATE();
let go = null;

export function initBuilderView(navigateFn) {
  go = navigateFn;
}

export function showBuilder(params = {}) {
  state = params.prefill ? prefillFromSpec(params.prefill) : DEFAULT_STATE();
  const el = document.getElementById('view-builder');
  buildDOM(el);
  wireEvents(el);
  refreshPreview(el, { animate: true });
}

// Map a Strategy spec from URL/storage back into the builder's working state.
// Falls back to defaults for anything the spec doesn't specify.
function prefillFromSpec(spec) {
  const defaults = DEFAULT_STATE();
  // Rules-only specs open straight into advanced mode (can't round-trip
  // arbitrary rules through the simplified 5-control UI).
  if (spec.rules && !spec.config) {
    return {
      ...defaults,
      name:        spec.name  || defaults.name,
      color:       spec.color || defaults.color,
      builderMode: 'advanced',
      rules:       spec.rules,
    };
  }
  return {
    ...defaults,
    name:   spec.name  || defaults.name,
    color:  spec.color || defaults.color,
    config: spec.config ? { ...defaults.config, ...spec.config } : defaults.config,
  };
}

// ── DOM ───────────────────────────────────────────────────────────────────────

function buildDOM(el) {
  el.innerHTML = `
    <div class="bld-wrap" style="--bld-color:${state.color}">
      <header class="bld-header">
        ${state.startedFromPresetId ? `
          <div class="bld-header-watermark" aria-hidden="true">
            ${buildSilhouette(state.startedFromPresetId, state.color, 220)}
          </div>
        ` : ''}
        <h1 class="bld-title">Build a player</h1>
        <p class="bld-subtitle">Make their choices. Watch them play Maya.</p>
      </header>

      <section class="bld-presets">
        <p class="bld-presets-label">Start from someone you know</p>
        <div class="bld-preset-chips">
          ${CHARACTER_PRESETS.map(c => {
            const isActive   = c.id === state.startedFromPresetId;
            const isModified = isActive && !configsEqual(c.config, state.config);
            const cls = isModified ? ' modified' : (isActive ? ' selected' : '');
            return `
              <button class="bld-preset-chip${cls}" data-preset="${c.id}" style="--preset-color:${c.color}">
                <span class="bld-preset-silhouette">${buildSilhouette(c.id, c.color, 24)}</span>${c.name}
              </button>
            `;
          }).join('')}
        </div>
      </section>

      <div class="bld-identity">
        <input class="bld-name" type="text" value="${escapeHtml(state.name)}" maxlength="24" aria-label="Name" />
        <div class="bld-swatches" role="radiogroup" aria-label="Color">
          ${COLOR_SWATCHES.map(c => `
            <button class="bld-swatch${c === state.color ? ' selected' : ''}"
              data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>
          `).join('')}
        </div>
      </div>

      <div class="bld-mode-toggle">
        <button class="bld-mode-btn${state.builderMode === 'simple' ? ' active' : ''}"
          data-mode="simple">Simple</button>
        <button class="bld-mode-btn${state.builderMode === 'advanced' ? ' active' : ''}"
          data-mode="advanced">Advanced</button>
      </div>

      <div class="bld-controls" data-controls></div>

      <section class="bld-summary-card">
        ${state.startedFromPresetId ? `
          <div class="bld-summary-mark" aria-hidden="true">
            ${buildSilhouette(state.startedFromPresetId, state.color, 56)}
          </div>
        ` : ''}
        <p class="bld-summary-label">This player will</p>
        <p class="bld-summary" data-summary></p>
      </section>

      <section class="bld-preview">
        <div class="bld-preview-header">
          <h2 class="bld-label">Watch them play</h2>
          <div class="bld-opponent-picker" role="radiogroup" aria-label="Preview opponent">
            ${PREVIEW_OPPONENTS.map(o => `
              <button class="bld-opp-chip${o.id === state.previewOpponentId ? ' selected' : ''}"
                data-opponent="${o.id}" style="--opp-color:${o.color}"
                aria-checked="${o.id === state.previewOpponentId}">
                <span class="bld-opp-pip"></span>${o.name}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="bld-preview-row">
          <span class="bld-preview-name" data-name="me">You</span>
          <div class="bld-tokens" data-tokens="me"></div>
          <span class="bld-preview-score" data-score="me">0</span>
        </div>
        <div class="bld-preview-row">
          <span class="bld-preview-name" data-name="them">Maya</span>
          <div class="bld-tokens" data-tokens="them"></div>
          <span class="bld-preview-score" data-score="them">0</span>
        </div>

        <canvas class="bld-chart" data-chart width="800" height="100"></canvas>
      </section>

      <div class="bld-actions">
        <button class="btn btn-primary" data-action="save">Save player</button>
        <button class="btn btn-ghost"   data-action="share-link">Share</button>
        <button class="btn btn-ghost"   data-action="back">Back</button>
      </div>
      <div class="bld-toast" data-toast aria-live="polite" hidden></div>
    </div>
  `;

  renderControls(el);
}

// Render either the simple 5-control UI or the advanced rule editor,
// depending on state.builderMode. The simple controls live in their own
// helper because reaction/forgiveness sections are conditional on `mode`.
function renderControls(el) {
  const container = el.querySelector('[data-controls]');
  if (state.builderMode === 'advanced') {
    container.innerHTML = renderAdvancedEditor();
  } else {
    container.innerHTML = renderSimpleControls();
    renderConditionalSections(el);
  }
  paintSliders(el);
}

function renderSimpleControls() {
  return `
    <section class="bld-section">
      <h2 class="bld-label">First move</h2>
      <p class="bld-teach">Sam opened by sharing. Marcus opened by taking. What does yours do?</p>
      ${chips('opener', state.config.opener, [
        { v: 'C',      l: 'Cooperate' },
        { v: 'D',      l: 'Defect' },
        { v: 'random', l: 'Random' },
      ])}
    </section>

    <section class="bld-section">
      <h2 class="bld-label">What they react to</h2>
      <p class="bld-teach">Maya watched what you did. Ren watched how the round turned out. Sam and Marcus didn't watch anything — they just stuck to their opener.</p>
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
      <h2 class="bld-label">
        Execution noise
        <span class="bld-pct-group">
          <span class="bld-region" data-noise-region>${noiseRegion(state.config.noise)}</span>
          <span class="bld-pct" data-noise-pct>${pct(state.config.noise)}</span>
        </span>
      </h2>
      <p class="bld-teach">Sometimes you mean to share but your hand slips. Game theorists call it <em>noise</em>. Strict strategies get hurt by it. Forgiving ones recover.</p>
      <input class="bld-slider" type="range" min="0" max="0.3" step="0.01"
        value="${state.config.noise}" data-field="noise" />
    </section>
  `;
}

function renderAdvancedEditor() {
  // Lazy-populate rules from the current config the first time we enter
  // advanced mode, so the user sees what their simple choices compile to.
  if (!state.rules) state.rules = configToRules(state.config) ?? [{ if: 'always', then: 'cooperate' }];

  const json = JSON.stringify(state.rules, null, 2);
  const errClass = state.rulesError ? ' bld-adv-error' : '';
  return `
    <section class="bld-section bld-advanced">
      <h2 class="bld-label">Rules</h2>
      <p class="bld-hint">
        Ordered list. First matching condition fires its action. End with
        <code>{ "if": "always", ... }</code> so every situation has a move.
      </p>
      <textarea class="bld-rules-editor${errClass}" data-rules-editor spellcheck="false">${escapeHtml(json)}</textarea>
      ${state.rulesError ? `<p class="bld-error" data-rules-error>${escapeHtml(state.rulesError)}</p>` : ''}

      <details class="bld-ref">
        <summary>Vocabulary</summary>
        <p class="bld-ref-line"><b>Conditions:</b> always · first-round · last-round · round-equals N · round-less-than N · round-greater-than N · opponent-last-was C|D · opponent-defected-in-last N · opponent-cooperated-in-last N · opponent-defected-count-in-last N at-least K · opponent-defection-rate-above P · opponent-defection-rate-below P · opponent-ever-defected · opponent-ever-cooperated · opponent-always-defected · opponent-always-cooperated · i-last-played C|D · last-round-was CC|CD|DC|DD · last-round-payoff-was-good · last-round-payoff-was-bad · probability P</p>
        <p class="bld-ref-line"><b>Actions:</b> cooperate · defect · mirror-opponent · repeat-last-move · flip-last-move · random · random-weighted P</p>
        <p class="bld-ref-line"><b>Composites:</b> <code>{ "and": [c1, c2] }</code> · <code>{ "or": [c1, c2] }</code> · <code>{ "not": c }</code></p>
      </details>
    </section>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
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
      <p class="bld-teach">Mirror what you just did — like Maya. Wait for two defections — like Naomi. Never forgive a single one — like Theo.</p>
      ${chips('reaction', reaction, [
        { v: 'mirror',                l: 'Mirror' },
        { v: 'mirror-after-two',      l: 'After two' },
        { v: 'permanent-punishment',  l: 'Never forgive' },
      ])}
    `;
  } else if (mode === 'outcome-reactive') {
    reactionHtml = `
      <h2 class="bld-label">How they react</h2>
      <p class="bld-teach">Stick with what worked, switch when it didn't — that's how Ren played. Watching outcomes, not opponents.</p>
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
      <h2 class="bld-label">
        Forgiveness
        <span class="bld-pct-group">
          <span class="bld-region" data-forg-region>${forgivenessRegion(forgiveness)}</span>
          <span class="bld-pct" data-forg-pct>${pct(forgiveness)}</span>
        </span>
      </h2>
      <p class="bld-teach">At 10%, this is <em>Generous Tit-for-Tat</em> — Maya, but she lets one defection in ten slide. Often wins against noisy opponents because it doesn't escalate.</p>
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

  // Preview opponent picker — change who the live preview plays against.
  el.querySelectorAll('[data-opponent]').forEach(btn => {
    btn.addEventListener('click', () => {
      const oppId = btn.dataset.opponent;
      if (oppId === state.previewOpponentId) return;
      state.previewOpponentId = oppId;
      el.querySelectorAll('[data-opponent]').forEach(b =>
        b.classList.toggle('selected', b.dataset.opponent === oppId));
      refreshPreview(el, { animate: true });
    });
  });

  // Preset chips — fills color + config from a canonical character.
  el.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = CHARACTER_PRESETS.find(p => p.id === btn.dataset.preset);
      if (!preset) return;
      state.color = preset.color;
      state.config = { ...preset.config };
      state.builderMode = 'simple';
      state.rules = null;
      state.rulesError = null;
      state.startedFromPresetId = preset.id;
      // Don't overwrite a name the user has personalised; only refresh if
      // they're still on the default.
      if (!state.name || state.name === 'Your player' || /^Like /.test(state.name)) {
        state.name = `Like ${preset.name}`;
      }
      buildDOM(el);
      wireEvents(el);
      refreshPreview(el, { animate: true });
    });
  });

  // Mode toggle
  el.querySelectorAll('.bld-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === state.builderMode) return;
      state.builderMode = mode;
      // Re-render the mode buttons' active class
      el.querySelectorAll('.bld-mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === mode));
      renderControls(el);
      refreshPreview(el, { animate: true });
    });
  });

  // Chips + sliders — delegated (only fire in simple mode)
  el.addEventListener('click', e => {
    const chip = e.target.closest('.bld-chip');
    if (!chip) return;
    const { field, value } = chip.dataset;
    handleConfigChange(el, field, value);
  });

  el.addEventListener('input', e => {
    const slider = e.target.closest('.bld-slider');
    if (slider) {
      handleConfigChange(el, slider.dataset.field, parseFloat(slider.value));
      return;
    }
    const editor = e.target.closest('[data-rules-editor]');
    if (editor) handleRulesChange(el, editor.value);
  });

  // Buttons
  el.querySelector('[data-action="save"]').addEventListener('click', () => saveAndExit(el));
  el.querySelector('[data-action="share-link"]').addEventListener('click', () => shareLink(el));
  el.querySelector('[data-action="back"]').addEventListener('click', () => go('evolution'));
}

// ── Share via URL ─────────────────────────────────────────────────────────────

async function shareLink(el) {
  const spec = buildSpec(); // no id — shared link is meta-only until receiver saves
  delete spec.id;
  delete spec.createdAt;
  const encoded = encodeStrategy(spec);
  const url = `${location.origin}${location.pathname}?play=${encoded}`;

  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    // Some browsers / contexts disallow clipboard writes (e.g. http://).
    // Fall back to a prompt the user can copy manually.
    window.prompt('Copy this link:', url);
  }
  toast(el, copied ? 'Link copied to clipboard' : 'Copy the link from the prompt');
}

function toast(el, msg) {
  const t = el.querySelector('[data-toast]');
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 300);
  }, 1800);
}

// Advanced-mode textarea handler. Parses, validates via compileStrategy,
// shows inline error or updates the live preview.
function handleRulesChange(el, raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    state.rulesError = `JSON: ${e.message}`;
    showRulesError(el);
    return;
  }
  if (!Array.isArray(parsed)) {
    state.rulesError = 'Rules must be an array.';
    showRulesError(el);
    return;
  }
  try {
    compileStrategy({ id: 'preview', rules: parsed, version: 1 });
  } catch (e) {
    state.rulesError = e.message;
    showRulesError(el);
    return;
  }
  state.rules = parsed;
  state.rulesError = null;
  showRulesError(el);
  refreshPreview(el);
}

function showRulesError(el) {
  const editor = el.querySelector('[data-rules-editor]');
  editor?.classList.toggle('bld-adv-error', !!state.rulesError);

  let errEl = el.querySelector('[data-rules-error]');
  if (state.rulesError) {
    if (!errEl) {
      errEl = document.createElement('p');
      errEl.className = 'bld-error';
      errEl.dataset.rulesError = '';
      editor.parentNode.insertBefore(errEl, editor.nextSibling);
    }
    errEl.textContent = state.rulesError;
  } else if (errEl) {
    errEl.remove();
  }
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
  // Any simple-mode change invalidates the advanced-mode canvas — next time
  // the user opens Advanced, the rules re-derive from the new config rather
  // than showing stale hand-edited rules from a previous session.
  state.rules = null;

  // Re-render conditional sections (reaction style + forgiveness visibility)
  renderConditionalSections(el);

  // Mark selected chips
  el.querySelectorAll('.bld-chip').forEach(c => {
    c.classList.toggle('selected',
      c.dataset.field in state.config &&
      String(state.config[c.dataset.field]) === c.dataset.value);
  });

  // Update slider percentage + region labels
  el.querySelector('[data-noise-pct]').textContent    = pct(state.config.noise);
  el.querySelector('[data-noise-region]').textContent = noiseRegion(state.config.noise);
  const forgPct = el.querySelector('[data-forg-pct]');
  if (forgPct) {
    forgPct.textContent = pct(state.config.forgiveness);
    el.querySelector('[data-forg-region]').textContent = forgivenessRegion(state.config.forgiveness);
  }

  // Mark the active preset chip as "modified" if config has drifted from it.
  updatePresetChips(el);
  // Repaint slider fills to reflect the new value(s).
  paintSliders(el);

  refreshPreview(el);
}

// Paint a "filled-left" gradient onto every range slider so the portion
// to the left of the thumb is in --bld-color. Reads each slider's
// current value, computes the pct, sets the background. Called after
// every render and on slider input.
function paintSliders(el) {
  el.querySelectorAll('.bld-slider').forEach(s => {
    const min = +s.min, max = +s.max, val = +s.value;
    const pct = ((val - min) / (max - min)) * 100;
    s.style.background = `linear-gradient(to right,
      var(--bld-color) 0%,
      var(--bld-color) ${pct}%,
      rgba(255,255,255,0.08) ${pct}%,
      rgba(255,255,255,0.08) 100%)`;
  });
}

// Brief scale-pulse on the summary card when its content updates —
// signals "the thing you just changed produced this result".
function pulseSummary(el) {
  const card = el.querySelector('.bld-summary-card');
  if (!card) return;
  card.classList.remove('pulse');
  void card.offsetWidth;  // force reflow so the animation re-fires
  card.classList.add('pulse');
}

// Reflect the current preset-vs-config relationship on the preset chips.
// Active chip = the one the user started from; modified = active + edited.
function updatePresetChips(el) {
  el.querySelectorAll('[data-preset]').forEach(btn => {
    const preset = CHARACTER_PRESETS.find(p => p.id === btn.dataset.preset);
    const isActive   = preset.id === state.startedFromPresetId;
    const isModified = isActive && !configsEqual(preset.config, state.config);
    btn.classList.toggle('selected', isActive && !isModified);
    btn.classList.toggle('modified', isModified);
  });
}

// ── Live preview ──────────────────────────────────────────────────────────────

function refreshPreview(el, opts = {}) {
  const animate = opts.animate ?? false;
  _previewGen += 1;
  const gen = _previewGen;

  const summaryEl = el.querySelector('[data-summary]');
  const prev = summaryEl.textContent;
  const next = state.builderMode === 'advanced'
    ? `${(state.rules ?? []).length} rule${(state.rules ?? []).length === 1 ? '' : 's'}, applied top to bottom each round.`
    : behaviorSummary(state.config);
  summaryEl.textContent = next;
  if (next !== prev) pulseSummary(el);

  let compiled;
  try {
    compiled = compileStrategy(specForPreview());
  } catch (err) {
    setPreviewError(el, err.message);
    return;
  }

  const oppMeta  = PREVIEW_OPPONENTS.find(o => o.id === state.previewOpponentId) ?? PREVIEW_OPPONENTS[1];
  const opponent = compileStrategy(REGISTRY[oppMeta.strategyId]);
  const result = runMatch(compiled, opponent, {
    rounds:     PREVIEW_ROUNDS,
    noise:      state.builderMode === 'simple' ? state.config.noise : 0,
    masterSeed: PREVIEW_SEED,
  });

  // Opponent name updates with the picker.
  el.querySelector('[data-name="them"]').textContent = oppMeta.name;

  const meTokens   = el.querySelector('[data-tokens="me"]');
  const themTokens = el.querySelector('[data-tokens="them"]');
  meTokens.innerHTML   = '';
  themTokens.innerHTML = '';

  const aMoves = result.history.map(h => h.aMove);
  const bMoves = result.history.map(h => h.bMove);

  if (animate) {
    // Stagger reveal — one round every ~80ms. Tokens fade-in via CSS.
    aMoves.forEach((_, r) => {
      setTimeout(() => {
        if (gen !== _previewGen) return;  // a newer refresh has started
        meTokens.appendChild(makeToken(aMoves[r]));
        themTokens.appendChild(makeToken(bMoves[r]));
        // Score updates as we go — feels like a live match.
        el.querySelector('[data-score="me"]').textContent   = result.history[r].aCumulative;
        el.querySelector('[data-score="them"]').textContent = result.history[r].bCumulative;
        if (r === aMoves.length - 1) drawChart(el, result, state.color, oppMeta.color);
      }, 80 * (r + 1));
    });
    // Draw chart up-front too so the y-axis range is right even mid-anim
    drawChart(el, result, state.color, oppMeta.color);
  } else {
    aMoves.forEach(m => meTokens.appendChild(makeToken(m, /*instant*/true)));
    bMoves.forEach(m => themTokens.appendChild(makeToken(m, true)));
    el.querySelector('[data-score="me"]').textContent   = result.finalScoreA;
    el.querySelector('[data-score="them"]').textContent = result.finalScoreB;
    drawChart(el, result, state.color, oppMeta.color);
  }
}

function makeToken(move, instant = false) {
  const span = document.createElement('span');
  span.className = `bld-token bld-token-${move}${instant ? ' instant' : ''}`;
  span.title = move === 'C' ? 'Shared' : 'Took';
  return span;
}

// Draw a filled-area cumulative-score chart for both players. The fill
// under each line in the player and opponent colors at low opacity,
// with a crisper line on top and an end-of-line score label.
function drawChart(el, result, myColor, themColor) {
  const canvas = el.querySelector('[data-chart]');
  if (!canvas) return;
  const cssW = canvas.clientWidth  || 320;
  const cssH = canvas.clientHeight || 100;
  const dpr  = window.devicePixelRatio || 1;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const n = result.history.length;
  const maxScore = Math.max(result.finalScoreA, result.finalScoreB, 1);
  const padX = 4, padY = 8, padRight = 38; // extra right padding for score labels
  const xAt = i => padX + (cssW - padX - padRight) * (i / (n - 1 || 1));
  const yAt = s => cssH - padY - (cssH - 2 * padY) * (s / maxScore);

  // Faint horizontal grid lines at quartiles
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let q = 0; q <= 4; q++) {
    const y = padY + (cssH - 2 * padY) * (q / 4);
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(cssW - padRight, y);
    ctx.stroke();
  }

  // Helper to draw a filled area + stroked line.
  const drawSeries = (values, color) => {
    // Filled area below the line
    ctx.fillStyle = hexWithAlpha(color, 0.18);
    ctx.beginPath();
    ctx.moveTo(xAt(0), cssH - padY);
    values.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
    ctx.lineTo(xAt(values.length - 1), cssH - padY);
    ctx.closePath();
    ctx.fill();
    // Line on top
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = xAt(i), y = yAt(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  const aVals = result.history.map(h => h.aCumulative);
  const bVals = result.history.map(h => h.bCumulative);
  drawSeries(aVals, myColor);
  drawSeries(bVals, themColor);

  // End-of-line score labels in the right gutter
  ctx.font = '600 11px "Fraunces", Georgia, serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = myColor;
  ctx.fillText(aVals[aVals.length - 1], cssW - padRight + 4, yAt(aVals[aVals.length - 1]));
  ctx.fillStyle = themColor;
  ctx.fillText(bVals[bVals.length - 1], cssW - padRight + 4, yAt(bVals[bVals.length - 1]));
}

// Convert a hex color (#rrggbb or #rgb) to an rgba string with the
// given alpha. Used by the area-fill draw call above.
function hexWithAlpha(hex, alpha) {
  const c = hex.replace('#', '');
  const r = parseInt(c.length === 3 ? c[0] + c[0] : c.slice(0, 2), 16);
  const g = parseInt(c.length === 3 ? c[1] + c[1] : c.slice(2, 4), 16);
  const b = parseInt(c.length === 3 ? c[2] + c[2] : c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// The compileable spec depends on which mode the user's editing in.
function specForPreview() {
  const base = {
    id: 'preview',
    name: state.name || 'Preview',
    color: state.color,
    version: 1,
  };
  return state.builderMode === 'advanced'
    ? { ...base, rules:  state.rules }
    : { ...base, config: state.config };
}

function setPreviewError(el, msg) {
  el.querySelector('[data-tokens="me"]').innerHTML   = `<span class="bld-error">${msg}</span>`;
  el.querySelector('[data-tokens="them"]').innerHTML = '';
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

// Qualitative regions for the two sliders. Lets the numerical knob read
// as a named concept rather than just a percentage.
function forgivenessRegion(v) {
  if (v < 0.01) return 'Strict';
  if (v < 0.05) return 'Lenient';
  if (v < 0.15) return 'Generous TfT';
  return 'Very forgiving';
}
function noiseRegion(v) {
  if (v < 0.01) return 'Clean';
  if (v < 0.05) return 'Realistic';
  if (v < 0.15) return 'Noisy';
  return 'Chaotic';
}

// Deep-equal for the config object (all primitive fields).
function configsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Save ──────────────────────────────────────────────────────────────────────

// Build a full Strategy spec from the current builder state. Used by both
// Save (assigns an id, persists) and Share (id-less, encoded into URL).
// Carries either config (simple mode) or rules (advanced mode), not both.
function buildSpec() {
  const name = (state.name || '').trim() || 'Untitled';
  const base = {
    id:          `player-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    color:       state.color,
    source:      'player',
    createdAt:   Date.now(),
    version:     1,
  };
  return state.builderMode === 'advanced'
    ? { ...base, rules:  state.rules, description: `${(state.rules ?? []).length} rules` }
    : { ...base, config: { ...state.config }, description: behaviorSummary(state.config) };
}

function saveAndExit(el) {
  const spec = buildSpec();
  saveUserStrategy(spec);

  // Brief confirmation, then back to evolution
  const saveBtn = el.querySelector('[data-action="save"]');
  saveBtn.textContent = 'Saved ✓';
  saveBtn.disabled = true;
  setTimeout(() => go('evolution'), 700);
}
