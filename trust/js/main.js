import { CHARACTERS } from './characters.js';
import { createFace } from './face.js';
import { initColdOpen, initDilemma } from './views/intro.js';
import { initMatchView, startMatch } from './views/match-view.js';
import { initSummaryView, showSummary } from './views/summary-view.js';
import { initRevealView, showReveal } from './views/reveal-view.js';
import { initEvolutionView, showEvolution } from './views/evolution-view.js';
import { initBuilderView, showBuilder } from './views/builder-view.js';
import { initLabView, showLab } from './views/lab-view.js';
import { initReplicatorView, showReplicator } from './views/replicator-view.js';
import { getSavedProgress, clearProgress, markCampaignDone, getPreferences, setPreference } from './progress.js';
import { decodeStrategy } from '../../core/strategy.js';
import * as audio from './audio.js';
import { initMapView, showMap } from './views/map-view.js';
import { initDevMenu } from './dev-menu.js'; // DEV ONLY

// ── Router ────────────────────────────────────────────────────────────────────

const VIEWS = [
  'cold-open', 'dilemma', 'intro-card', 'match', 'map',
  'summary', 'campaign-end', 'reveal', 'evolution', 'builder', 'lab', 'replicator',
];

export function navigate(viewName, params = {}) {
  VIEWS.forEach(v => document.getElementById(`view-${v}`)?.classList.remove('active'));

  const target = document.getElementById(`view-${viewName}`);
  if (!target) { console.warn('Unknown view:', viewName); return; }

  target.classList.add('active', 'view-enter');
  target.addEventListener('animationend', () => target.classList.remove('view-enter'), { once: true });

  if (viewName === 'intro-card' && params.characterIndex !== undefined) {
    renderIntroCard(params.characterIndex);
  }

  if (viewName === 'summary' && params.match) {
    showSummary(params.charIndex, params.match);
  }

  if (viewName === 'campaign-end') {
    markCampaignDone();
  }

  if (viewName === 'reveal') {
    showReveal();
  }

  if (viewName === 'map') {
    showMap(params);
  }

  if (viewName === 'evolution') {
    showEvolution();
  }

  if (viewName === 'builder') {
    showBuilder(params);
  }

  if (viewName === 'lab') {
    showLab();
  }

  if (viewName === 'replicator') {
    showReplicator();
  }
}

// ── Intro card ────────────────────────────────────────────────────────────────

function renderIntroCard(charIndex) {
  const char = CHARACTERS[charIndex];
  const el   = document.getElementById('view-intro-card');

  el.style.setProperty('--char-color', char.color);
  const faceWrap = el.querySelector('.char-silhouette-wrap');
  faceWrap.innerHTML = '';
  const face = createFace(char.color, { size: 132 });
  faceWrap.appendChild(face.el);
  face.startIdle();
  el.querySelector('.char-name').textContent          = char.name;
  el.querySelector('.char-name').style.color          = char.color;
  el.querySelector('.char-intro-text').textContent    = char.intro;
  el.querySelector('[data-action="begin-match"]').onclick = () => startMatch(charIndex);
}

// ── Sound toggle ──────────────────────────────────────────────────────────────

function mountSoundToggle() {
  if (document.getElementById('tg-sound')) return;
  const btn = document.createElement('button');
  btn.id = 'tg-sound';
  btn.className = 'tg-sound';
  const on = getPreferences().soundEnabled !== false;
  btn.dataset.on = String(on);
  btn.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
  btn.innerHTML = `
    <svg class="icon-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.8 6a9 9 0 0 1 0 12"/></svg>
    <svg class="icon-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
  `;
  btn.addEventListener('click', () => {
    const nowOn = audio.toggle();
    btn.dataset.on = String(nowOn);
    btn.setAttribute('aria-label', nowOn ? 'Mute sound' : 'Unmute sound');
    if (nowOn) audio.play('click');
  });
  document.body.appendChild(btn);
}

// Optional "timed decision" mode — off by default, opt-in for pressure.
function mountTimedToggle() {
  if (document.getElementById('tg-timed')) return;
  const btn = document.createElement('button');
  btn.id = 'tg-timed';
  btn.className = 'tg-timed';
  const on = getPreferences().timedMode === true;
  btn.dataset.on = String(on);
  btn.setAttribute('aria-label', on ? 'Turn off timed decisions' : 'Turn on timed decisions');
  btn.title = 'Timed decisions';
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9.5V13l2.2 2.2"/><path d="M9 2h6"/></svg>`;
  btn.addEventListener('click', () => {
    const next = !(getPreferences().timedMode === true);
    setPreference('timedMode', next);
    btn.dataset.on = String(next);
    btn.setAttribute('aria-label', next ? 'Turn off timed decisions' : 'Turn on timed decisions');
    audio.play('click');
  });
  document.body.appendChild(btn);
}

// ── Boot & resume ─────────────────────────────────────────────────────────────

function boot() {
  initColdOpen(navigate);
  initDilemma(navigate);
  initMatchView(navigate);
  initSummaryView(navigate);
  initRevealView(navigate);
  initEvolutionView(navigate);
  initBuilderView(navigate);
  initLabView(navigate);
  initReplicatorView(navigate);
  initMapView(navigate);

  // Audio wakes up on the first user gesture (browsers block autoplay). The
  // ambient pad and stings only start once the player has interacted.
  window.addEventListener('pointerdown', () => audio.arm(), { once: true });
  mountSoundToggle();
  mountTimedToggle();

  // DEV ONLY — page-jump menu. Shown on localhost, or anywhere with ?dev in
  // the URL. Never appears on the deployed site unless explicitly opted in.
  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    || location.protocol === 'file:'
    || new URLSearchParams(location.search).has('dev');
  if (DEV) initDevMenu();

  // Campaign-end buttons
  const campaignEnd = document.getElementById('view-campaign-end');
  campaignEnd?.querySelector('[data-action="reveal"]')
    ?.addEventListener('click', () => navigate('reveal'));
  campaignEnd?.querySelector('[data-action="play-again"]')
    ?.addEventListener('click', () => { clearProgress(); navigate('cold-open'); });

  // ?play=<encoded> overrides resume — drop a friend straight into the builder
  // with the shared strategy pre-populated. Strip the param so a refresh
  // doesn't keep re-prefilling.
  const playParam = new URLSearchParams(location.search).get('play');
  if (playParam) {
    try {
      const spec = decodeStrategy(playParam);
      history.replaceState({}, '', location.pathname);
      navigate('builder', { prefill: spec });
      return;
    } catch (e) {
      console.warn('Ignoring malformed ?play= URL:', e);
      history.replaceState({}, '', location.pathname);
      // fall through to normal resume
    }
  }

  // Resume from saved progress
  const saved = getSavedProgress();
  if (saved?.done) {
    navigate('campaign-end');
  } else if (saved?.charIndex !== undefined) {
    navigate('intro-card', { characterIndex: saved.charIndex });
  } else {
    navigate('cold-open');
  }
}

boot();
