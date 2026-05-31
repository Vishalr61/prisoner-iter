import { CHARACTERS } from './characters.js';
import { buildSilhouette } from './silhouette.js';
import { initColdOpen, initDilemma } from './views/intro.js';
import { initMatchView, startMatch } from './views/match-view.js';
import { initSummaryView, showSummary } from './views/summary-view.js';
import { initRevealView, showReveal } from './views/reveal-view.js';
import { initEvolutionView, showEvolution } from './views/evolution-view.js';
import { initBuilderView, showBuilder } from './views/builder-view.js';
import { getSavedProgress, clearProgress, markCampaignDone } from './progress.js';
import { initDevMenu } from './dev-menu.js'; // DEV ONLY

// ── Router ────────────────────────────────────────────────────────────────────

const VIEWS = [
  'cold-open', 'dilemma', 'intro-card', 'match',
  'summary', 'campaign-end', 'reveal', 'evolution', 'builder',
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
    showBuilder();
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
  initDevMenu(); // DEV ONLY

  // Campaign-end buttons
  const campaignEnd = document.getElementById('view-campaign-end');
  campaignEnd?.querySelector('[data-action="reveal"]')
    ?.addEventListener('click', () => navigate('reveal'));
  campaignEnd?.querySelector('[data-action="play-again"]')
    ?.addEventListener('click', () => { clearProgress(); navigate('cold-open'); });

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
