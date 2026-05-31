// Builder view — Phase 2 (Session A).
// Five-control simplified-config UI + live preview vs Maya (TfT).
// Saves to localStorage.userStrategies[].
// Advanced rule editor, URL encoding, and the test-in-tournament sidebar
// come in Session B.

import { compileStrategy, configToRules, encodeStrategy } from '../../../core/strategy.js';
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
});

const COLOR_SWATCHES = [
  '#2dd4bf', '#f43f5e', '#f0c674', '#5e8ca8', '#c87635',
  '#a085bd', '#4c9c6a', '#94a3b8', '#a23b3b',
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
  refreshPreview(el);
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
        <h1 class="bld-title">Build a player</h1>
        <p class="bld-subtitle">Make their choices. Watch them play Maya.</p>
      </header>

      <section class="bld-presets">
        <p class="bld-presets-label">Start from someone you know</p>
        <div class="bld-preset-chips">
          ${CHARACTER_PRESETS.map(c => `
            <button class="bld-preset-chip" data-preset="${c.id}" style="--preset-color:${c.color}">
              <span class="bld-preset-pip"></span>${c.name}
            </button>
          `).join('')}
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
        <p class="bld-summary-label">This player will</p>
        <p class="bld-summary" data-summary></p>
      </section>

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
      <h2 class="bld-label">Execution noise <span class="bld-pct" data-noise-pct>${pct(state.config.noise)}</span></h2>
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
      <h2 class="bld-label">Forgiveness <span class="bld-pct" data-forg-pct>${pct(forgiveness)}</span></h2>
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
      // Don't overwrite a name the user has personalised; only refresh if
      // they're still on the default.
      if (!state.name || state.name === 'Your player' || /^Like /.test(state.name)) {
        state.name = `Like ${preset.name}`;
      }
      buildDOM(el);
      wireEvents(el);
      refreshPreview(el);
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
      refreshPreview(el);
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

  // Update slider percentage labels
  el.querySelector('[data-noise-pct]').textContent = pct(state.config.noise);
  const forgPct = el.querySelector('[data-forg-pct]');
  if (forgPct) forgPct.textContent = pct(state.config.forgiveness);

  refreshPreview(el);
}

// ── Live preview ──────────────────────────────────────────────────────────────

function refreshPreview(el) {
  const summaryEl = el.querySelector('[data-summary]');
  // In advanced mode the summary is unreliable (rules can be anything),
  // so show a generic line. In simple mode use the plain-English summary.
  summaryEl.textContent = state.builderMode === 'advanced'
    ? `${(state.rules ?? []).length} rule${(state.rules ?? []).length === 1 ? '' : 's'}, applied top to bottom each round.`
    : behaviorSummary(state.config);

  let compiled;
  try {
    compiled = compileStrategy(specForPreview());
  } catch (err) {
    setPreviewError(el, err.message);
    return;
  }

  const opponent = compileStrategy(REGISTRY[PREVIEW_OPPONENT_ID]);
  const result = runMatch(compiled, opponent, {
    rounds:     PREVIEW_ROUNDS,
    noise:      state.builderMode === 'simple' ? state.config.noise : 0,
    masterSeed: PREVIEW_SEED,
  });

  renderDots(el.querySelector('[data-dots="me"]'),   result.history.map(h => h.aMove), state.color);
  renderDots(el.querySelector('[data-dots="them"]'), result.history.map(h => h.bMove), REGISTRY.tft.color);
  el.querySelector('[data-score="me"]').textContent   = result.finalScoreA;
  el.querySelector('[data-score="them"]').textContent = result.finalScoreB;
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
