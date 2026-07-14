import { CHARACTERS } from './characters.js';
import { createFace } from './face.js';
import { initColdOpen, initDilemma } from './views/intro.js';
import { initMatchView, startMatch, startReplay } from './views/match-view.js';
import { decodeMatch } from './match.js';
import { initSummaryView, showSummary } from './views/summary-view.js';
import { initRevealView, showReveal } from './views/reveal-view.js';
import { initNoiseView, showNoise } from './views/noise-view.js';
import { initEvolutionView, showEvolution } from './views/evolution-view.js';
import { initBuilderView, showBuilder } from './views/builder-view.js';
import { initLabView, showLab } from './views/lab-view.js';
import { initReplicatorView, showReplicator } from './views/replicator-view.js';
import { getSavedProgress, clearProgress, markCampaignDone, getPreferences, setPreference, getJournal } from './progress.js';
import { decodeStrategy } from '../../core/strategy.js';
import * as audio from './audio.js';
import { initMapView, showMap } from './views/map-view.js';
import { initDevMenu } from './dev-menu.js'; // DEV ONLY

// ── Router ────────────────────────────────────────────────────────────────────

const VIEWS = [
  'cold-open', 'dilemma', 'intro-card', 'match', 'map',
  'summary', 'campaign-end', 'reveal', 'noise', 'evolution', 'builder', 'lab', 'replicator',
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
    renderCampaignEnd();
  }

  if (viewName === 'reveal') {
    showReveal();
  }

  if (viewName === 'noise') {
    showNoise();
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

  // Reputation callback: how you've treated the people before this one leaks
  // into how this meeting feels. (Narrative only — the bot still can't see you.)
  const rep = reputationFor();
  const cardv = el.querySelector('.cardv');
  let repEl = el.querySelector('.char-rep');
  if (rep) {
    if (!repEl) {
      repEl = document.createElement('p');
      repEl.className = 'char-rep';
      cardv.insertBefore(repEl, el.querySelector('.cardv-foot'));
    }
    repEl.textContent = rep.line(char.name);
    face.set(rep.emotion);
  } else if (repEl) {
    repEl.remove();
  }

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

// Reputation from how you've played so far (needs a couple of games).
function reputationFor() {
  const ph = getSavedProgress()?.campaign?.playerHistory || {};
  const played = Object.values(ph);
  if (played.length < 2) return null;
  let c = 0, n = 0;
  played.forEach(h => { c += (h.myMoves || []).filter(m => m === 'C').length; n += (h.myMoves || []).length; });
  const rate = n ? c / n : 1;
  if (rate < 0.4)  return { emotion: 'wary',    line: name => `Word gets around. ${name} may already be watching their back with you.` };
  if (rate > 0.78) return { emotion: 'neutral', line: name => `You've dealt fairly so far. ${name} has no reason to expect otherwise — yet.` };
  return null;
}

// Trust journal shown on the campaign-end screen (idea #13).
function renderCampaignEnd() {
  const host = document.querySelector('#view-campaign-end [data-journal]');
  if (!host) return;
  const entries = getJournal();
  host.innerHTML = '';
  if (!entries.length) return;
  entries.forEach((e, i) => {
    const char = CHARACTERS.find(c => c.id === e.charId);
    if (!char) return;
    const row = document.createElement('div');
    row.className = 'cend-entry';
    row.style.setProperty('--char-color', char.color);
    const faceSlot = document.createElement('div');
    faceSlot.className = 'cend-entry-face';
    const face = createFace(char.color, { size: 44 });
    faceSlot.appendChild(face.el);
    const body = document.createElement('div');
    body.className = 'cend-entry-body';
    body.innerHTML = `<span class="cend-entry-name">${char.name}</span><p class="cend-entry-note">${escapeHtml(e.note)}</p>`;
    row.appendChild(faceSlot); row.appendChild(body);
    host.appendChild(row);
    setTimeout(() => row.classList.add('shown'), 200 + i * 140);
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ── Boot & resume ─────────────────────────────────────────────────────────────

function boot() {
  initColdOpen(navigate);
  initDilemma(navigate);
  initMatchView(navigate);
  initSummaryView(navigate);
  initRevealView(navigate);
  initNoiseView(navigate);
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

  // ?replay=<token> — drop straight into an auto-playing shared game.
  const replayParam = new URLSearchParams(location.search).get('replay');
  if (replayParam) {
    try {
      const { charIndex, moves } = decodeMatch(replayParam);
      if (charIndex >= 0 && charIndex < CHARACTERS.length && moves.length === CHARACTERS[charIndex].rounds) {
        history.replaceState({}, '', location.pathname);
        startReplay(charIndex, moves);
        return;
      }
    } catch (e) {
      console.warn('Ignoring malformed ?replay= URL:', e);
    }
    history.replaceState({}, '', location.pathname);
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
