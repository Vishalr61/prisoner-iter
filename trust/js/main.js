import { CHARACTERS } from './characters.js';
import { buildSilhouette } from './silhouette.js';
import { initColdOpen, initDilemma } from './views/intro.js';
import { initMatchView, startMatch } from './views/match-view.js';
import { initSummaryView, showSummary } from './views/summary-view.js';
import { initRevealView, showReveal } from './views/reveal-view.js';
import { initEvolutionView, showEvolution } from './views/evolution-view.js';
import { initBuilderView, showBuilder } from './views/builder-view.js';
import { initLabView, showLab } from './views/lab-view.js';
import { initReplicatorView, showReplicator } from './views/replicator-view.js';
import { getSavedProgress, clearProgress, markCampaignDone } from './progress.js';
import { decodeStrategy } from '../../core/strategy.js';
import { initDevMenu } from './dev-menu.js'; // DEV ONLY

// ── Router ────────────────────────────────────────────────────────────────────

const VIEWS = [
  'cold-open', 'dilemma', 'intro-card', 'match',
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
  el.querySelector('.char-silhouette-wrap').innerHTML = buildSilhouette(char.id, char.color);
  el.querySelector('.char-name').textContent          = char.name;
  el.querySelector('.char-name').style.color          = char.color;
  el.querySelector('.char-intro-text').textContent    = char.intro;
  el.querySelector('[data-action="begin-match"]').onclick = () => startMatch(charIndex);
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
  initDevMenu(); // DEV ONLY

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
