// Match view — entertainment overhaul.
//
// Two expressive faces (you + opponent) react to every outcome; coins drop per
// payoff; a trust meter fills, drains, and shatters (Grim); the "call it"
// prediction runs from round 3; plus coin/shard particles, haptics, a per-
// character audio motif, and an optional timed-decision mode.
//
// The engine contract (createMatch/step/getHistory) is untouched.

import { CHARACTERS } from '../characters.js';
import { createMatch } from '../match.js';
import { saveProgress, markCompleted, getPreferences, addReads, addJournalEntry } from '../progress.js';
import { createFace } from '../face.js';
import * as audio from '../audio.js';
import { flash, shake, burst, pulse, haptic, isReduced } from '../juice.js';

const CRACK_SVG = `<svg viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0,5 18,5 24,1 30,9 37,2 44,8 50,4 57,9 63,2 70,8 76,4 83,9 100,5" fill="none" stroke="var(--take)" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const PLAYER_COLOR = '#6fae8f';
const PLAYER_EMO = { 'mutual-share': 'warm', 'exploited': 'hurt', 'exploiter': 'bright', 'mutual-take': 'wary' };
const TIMED_MS = 6000;

let go        = null;
let el        = null;
let character = null;
let charIndex = 0;
let match     = null;
let faceThem  = null;
let faceYou   = null;
let busy      = false;
let timer     = null;

// per-match state
let trust        = 50;
let shattered    = false;
let grimTriggered = false;
let shareStreak  = 0;
let pendingGuess = null;
let reads        = { correct: 0, total: 0 };

// Replay mode (idea #11) — auto-plays a shared game; saves nothing.
let replaying    = false;
let replayQueue  = [];
let replayIdx    = 0;

export function initMatchView(navigateFn) {
  go = navigateFn;
  el = document.getElementById('view-match');
}

export function startMatch(idx) {
  replaying = false; replayQueue = []; replayIdx = 0;
  begin(idx);
}

// Auto-play a shared game. `moves` is a 'C'/'D' string. Saves no progress.
export function startReplay(idx, moves) {
  replaying = true;
  replayQueue = String(moves).split('');
  replayIdx = 0;
  begin(idx);
}

function begin(idx) {
  charIndex = idx;
  character = CHARACTERS[idx];
  match     = createMatch(character.strategyId, character.rounds);
  busy = false; clearTimer();
  trust = 50; shattered = false; grimTriggered = false; shareStreak = 0;
  pendingGuess = null; reads = { correct: 0, total: 0 };

  el = document.getElementById('view-match');
  el.style.setProperty('--char-color', character.color);
  el.classList.toggle('is-replay', replaying);
  buildDOM();
  audio.playMotif(character.strategyId);
  setupRound();
  go('match');
}

// ── DOM ─────────────────────────────────────────────────────────────────────
function buildDOM() {
  el.innerHTML = `
    <div class="mtch2">
      <div class="m2-replay-banner"><span class="dot"></span>Watching a shared game vs ${esc(character.name)}</div>
      <div class="m2-track" data-progress></div>

      <div class="m2-duo">
        <div class="m2-p you">
          <div class="m2-face" data-face="you"></div>
          <span class="m2-who">You</span>
          <b class="m2-val" data-score="you">0</b>
          <div class="coins-tray you" data-tray="you"></div>
        </div>
        <div class="m2-mid">
          <span class="m2-round">Round <b data-round>1</b> / ${character.rounds}</span>
          <span class="m2-lead" data-lead>even</span>
        </div>
        <div class="m2-p them">
          <div class="m2-face" data-face="them"></div>
          <span class="m2-who them">${esc(character.name)}</span>
          <b class="m2-val" data-score="them">0</b>
          <div class="coins-tray them" data-tray="them"></div>
        </div>
      </div>

      <div class="trust" data-trust>
        <div class="trust-head"><span>distrust</span><b data-trust-label>uneasy</b><span>trust</span></div>
        <div class="trust-track" data-trust-track>
          <div class="trust-fill" data-trust-fill></div>
          <div class="trust-crack" data-trust-crack>${CRACK_SVG}</div>
        </div>
      </div>

      <div class="m2-reveal">
        <div class="m2-moves">
          <span class="coin-move" data-move="you"></span>
          <span class="m2-vs">vs</span>
          <span class="coin-move" data-move="them"></span>
        </div>
        <p class="m2-outcome" data-outcome></p>
      </div>

      <div class="m2-foot">
        <div class="predict" data-predict hidden>
          <p class="predict-q">Call it — will <b>${esc(character.name)}</b> share or take?</p>
          <div class="predict-btns">
            <button class="predict-btn guess-share" data-guess="C">They'll share</button>
            <button class="predict-btn guess-take"  data-guess="D">They'll take</button>
          </div>
          <p class="predict-result" data-predict-result></p>
        </div>
        <div class="m2-choices" data-choices>
          <button class="mtch-choice share" data-action="share"><span class="verb">Share</span><span class="pay">+3 if they share · 0 if not</span></button>
          <button class="mtch-choice take"  data-action="take"><span class="verb">Take</span><span class="pay">+5 if they share · +1 if not</span></button>
        </div>
        <div class="m2-timerbar" data-timerbar hidden><span></span></div>
      </div>
    </div>
  `;

  faceYou  = createFace(PLAYER_COLOR, { size: 72 });
  faceThem = createFace(character.color, { size: 72 });
  el.querySelector('[data-face="you"]').appendChild(faceYou.el);
  el.querySelector('[data-face="them"]').appendChild(faceThem.el);
  if (!isReduced()) { faceYou.startIdle(); faceThem.startIdle(); }

  el.querySelector('[data-action="share"]').addEventListener('click', () => handleMove('C'));
  el.querySelector('[data-action="take"]').addEventListener('click', () => handleMove('D'));
  el.querySelectorAll('[data-guess]').forEach(b =>
    b.addEventListener('click', () => onGuess(b.dataset.guess)));

  renderProgress([]);
  updateTrust(false);
}

// ── Round setup ─────────────────────────────────────────────────────────────
function setupRound() {
  const history = match.getHistory();
  const roundIndex = history.length;

  q('[data-round]').textContent = Math.min(roundIndex + 1, character.rounds);
  q('[data-tray="you"]').innerHTML = '';
  q('[data-tray="them"]').innerHTML = '';
  q('[data-move="you"]').className = 'coin-move';
  q('[data-move="them"]').className = 'coin-move';
  q('[data-move="you"]').textContent = '';
  q('[data-move="them"]').textContent = '';
  q('[data-outcome]').textContent = '';
  renderProgress(history);

  const predictEl = q('[data-predict]');
  const choicesEl = q('[data-choices]');
  pendingGuess = null;

  // Replay: no input — auto-feed the shared move sequence.
  if (replaying) {
    predictEl.hidden = true;
    choicesEl.style.display = 'none';
    if (replayIdx < replayQueue.length) {
      setTimeout(() => { if (!busy) handleMove(replayQueue[replayIdx++]); }, isReduced() ? 320 : 750);
    }
    return;
  }

  if (roundIndex >= 2 && !shattered) {
    predictEl.hidden = false;
    predictEl.querySelector('[data-predict-result]').className = 'predict-result';
    predictEl.querySelector('[data-predict-result]').textContent = '';
    predictEl.querySelectorAll('.predict-btn').forEach(b => { b.disabled = false; b.classList.remove('locked'); });
    choicesEl.style.display = 'none';
  } else {
    predictEl.hidden = true;
    choicesEl.style.display = '';
    setChoices(true);
    startTimer();
  }
}

function onGuess(move) {
  if (pendingGuess) return;
  pendingGuess = move;
  audio.play('choose');
  const predictEl = q('[data-predict]');
  predictEl.querySelectorAll('.predict-btn').forEach(b => {
    b.disabled = true;
    if (b.dataset.guess === move) b.classList.add('locked');
  });
  q('[data-choices]').style.display = '';
  setChoices(true);
  startTimer();
}

// ── The round ────────────────────────────────────────────────────────────────
function handleMove(humanMove) {
  if (busy) return;
  busy = true;
  clearTimer();
  setChoices(false);
  audio.play('choose');

  const result = match.step(humanMove);
  const { botMove, outcome } = result;

  showMove('you', humanMove);
  faceYou.set('neutral');

  faceThem.set('thinking');
  setTimeout(() => {
    showMove('them', botMove);

    const grimNow = character.strategyId === 'grim' && botMove === 'D' && !grimTriggered;
    if (grimNow) grimTriggered = true;

    faceThem.reactTo(outcome);
    faceYou.set(PLAYER_EMO[outcome] || 'neutral');
    resolveOutcome(result, grimNow);
  }, isReduced() ? 160 : 480);
}

function resolveOutcome(result, grimNow) {
  const { humanMove, botMove, myPay, theirPay, myScore, theirScore, outcome } = result;

  dropCoins('you', myPay);
  dropCoins('them', theirPay);

  setTimeout(() => {
    bumpScore('you', myScore);
    bumpScore('them', theirScore);
    setLead(myScore, theirScore);
  }, 260);

  shareStreak = outcome === 'mutual-share' ? shareStreak + 1 : 0;
  applyTrust(outcome, grimNow);
  updateTrust(true);

  if (grimNow) {
    audio.play('shatter');
    audio.bumpTension(0.5);
    flash('rgba(210,75,75,0.4)');
    shake(el.querySelector('.mtch2'));
    burst(q('[data-trust-track]'), { color: ['#d24b4b', '#8a2f2f'], count: 16, shape: 'shard' });
    haptic([0, 30, 40, 30, 40, 90]);
  } else {
    audio.playOutcome(outcome);
    tensionFor(outcome);
    juiceFor(outcome);
    if (shareStreak >= 3) {
      audio.play('streak');
      burst(faceYou.el, { color: ['#5fb878', '#f0c674'], count: 12, shape: 'coin' });
    }
  }

  scorePrediction(botMove);

  const outcomeEl = q('[data-outcome]');
  outcomeEl.innerHTML = outcomeLine(humanMove, botMove);
  outcomeEl.className = 'm2-outcome ' + outcomeClass(outcome);

  if (!replaying) saveProgress(charIndex, match.getHistory());
  renderProgress(match.getHistory());

  const done = result.round >= character.rounds;
  if (done) {
    const history = match.getHistory();
    const coopRate = history.filter(r => r.humanMove === 'C').length / history.length;
    match.reads = reads;
    match.trustEnd = trust;
    match.replay = replaying;
    if (!replaying) {
      markCompleted(character.id, coopRate, history);
      addReads(reads.correct, reads.total);
      const jv = character.strategyId === 'grim'
        ? (history.some(r => r.humanMove === 'D') ? 'summaryD' : 'summaryC')
        : (history.filter(r => r.humanMove === 'C').length > history.length / 2 ? 'summaryC' : 'summaryD');
      addJournalEntry(character.id, character[jv][0]);
    }
    setTimeout(() => { faceThem.stopIdle(); faceYou.stopIdle(); go('summary', { charIndex, match }); }, 1250);
  } else {
    setTimeout(() => { busy = false; setupRound(); }, 1400);
  }
}

// ── Prediction ────────────────────────────────────────────────────────────────
function scorePrediction(botMove) {
  if (pendingGuess === null) return;
  reads.total++;
  const right = pendingGuess === botMove;
  if (right) reads.correct++;
  const r = q('[data-predict-result]');
  r.textContent = right ? 'You read them.' : 'They surprised you.';
  r.className = 'predict-result shown ' + (right ? 'correct' : 'wrong');
  audio.play(right ? 'correct' : 'wrong');
}

// ── Timed-decision mode (optional) ──────────────────────────────────────────
function startTimer() {
  clearTimer();
  if (!getPreferences().timedMode || isReduced()) return;
  const bar = q('[data-timerbar]');
  const fill = bar.querySelector('span');
  bar.hidden = false;
  fill.style.transition = 'none';
  fill.style.width = '100%';
  requestAnimationFrame(() => {
    fill.style.transition = `width ${TIMED_MS}ms linear`;
    fill.style.width = '0%';
  });
  timer = setTimeout(() => {
    // Froze — hesitation reads as grabbing.
    timer = null;
    if (!busy) handleMove('D');
  }, TIMED_MS);
}

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
  const bar = el && el.querySelector('[data-timerbar]');
  if (bar) { bar.hidden = true; }
}

// ── Trust meter ───────────────────────────────────────────────────────────────
function applyTrust(outcome, grimNow) {
  if (grimNow) { trust = 0; shattered = true; return; }
  if (shattered) { trust = Math.max(0, trust - 4); return; }
  let d = 0;
  if      (outcome === 'mutual-share') d = 14 + Math.min(6, shareStreak * 2);
  else if (outcome === 'exploiter')    d = -7;
  else if (outcome === 'exploited')    d = -13;
  else                                 d = -6;
  trust = Math.max(0, Math.min(100, trust + d));
}

function updateTrust(animate) {
  const track = q('[data-trust-track]');
  const fill  = q('[data-trust-fill]');
  const label = q('[data-trust-label]');
  const trustEl = q('[data-trust]');
  fill.style.width = `${trust}%`;
  track.classList.toggle('low', trust < 40);
  track.classList.toggle('mid', trust >= 40 && trust < 66);
  trustEl.classList.toggle('shattered', shattered);
  label.textContent = shattered ? 'broken' : trustWord(trust);
}

function trustWord(v) {
  if (v < 18) return 'broken';
  if (v < 38) return 'wary';
  if (v < 58) return 'uneasy';
  if (v < 78) return 'warming';
  return 'trusting';
}

// ── Audio tension + juice ──────────────────────────────────────────────────────
function tensionFor(outcome) {
  const map = { 'mutual-share': -0.14, 'exploited': 0.2, 'exploiter': 0.1, 'mutual-take': 0.12 };
  audio.bumpTension(map[outcome] ?? 0);
}

function juiceFor(outcome) {
  const arena = el.querySelector('.mtch2');
  if (outcome === 'mutual-share') {
    burst(faceThem.el, { color: ['#5fb878', '#7fd39a'], count: 9, shape: 'coin' });
    pulse(faceThem.el); pulse(faceYou.el);
    haptic([0, 12, 40, 12]);
  } else if (outcome === 'exploited') {
    flash('rgba(210,75,75,0.32)'); shake(arena);
    burst(faceYou.el, { color: ['#d24b4b', '#8a2f2f'], count: 8, shape: 'shard' });
    haptic(70);
  } else if (outcome === 'exploiter') {
    flash('rgba(240,198,116,0.22)');
    burst(faceYou.el, { color: ['#f0c674', '#ffe9ab'], count: 7, shape: 'coin' });
    haptic(25);
  } else {
    haptic(30);
  }
}

// ── Small render helpers ───────────────────────────────────────────────────────
function showMove(who, move) {
  const chip = q(`[data-move="${who}"]`);
  chip.textContent = move === 'C' ? 'Shared' : 'Took';
  chip.className = `coin-move ${move === 'C' ? 'share' : 'take'} shown`;
}

function dropCoins(who, n) {
  const tray = q(`[data-tray="${who}"]`);
  tray.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const c = document.createElement('span');
    c.className = 'coin';
    tray.appendChild(c);
    const delay = 240 + i * (isReduced() ? 0 : 90);
    setTimeout(() => {
      c.classList.add('drop');
      if (i < 3) { audio.play('coin'); haptic(5); }
    }, delay);
  }
}

function bumpScore(who, value) {
  const node = q(`[data-score="${who}"]`);
  const cur = parseInt(node.textContent, 10) || 0;
  node.textContent = value;
  if (cur === value) return;
  node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump');
}

function setLead(you, them) {
  const d = you - them;
  q('[data-lead]').textContent = d === 0 ? 'even' : d > 0 ? `you +${d}` : `${character.name} +${-d}`;
}

function setChoices(enabled) {
  el.querySelectorAll('[data-action]').forEach(b => { b.disabled = !enabled; });
}

function renderProgress(history) {
  const row = q('[data-progress]');
  row.innerHTML = '';
  const triggerRound = character.strategyId === 'grim'
    ? history.findIndex(r => r.humanMove === 'D') : -1;
  for (let i = 0; i < character.rounds; i++) {
    const seg = document.createElement('span');
    seg.className = 'mtch-seg';
    if (i < history.length) {
      seg.classList.add(history[i].outcome);
      if (i === triggerRound) seg.classList.add('trigger');
    } else if (i === history.length) {
      seg.classList.add('active');
    }
    row.appendChild(seg);
  }
}

function outcomeLine(human, bot) {
  if (human === 'C' && bot === 'C') return 'You both <b>shared</b>.';
  if (human === 'C' && bot === 'D') return 'They <b>took</b> while you shared.';
  if (human === 'D' && bot === 'C') return 'You <b>took</b> while they shared.';
  return 'You both <b>took</b>.';
}

function outcomeClass(outcome) {
  if (outcome === 'mutual-share') return 'share';
  if (outcome === 'exploited')    return 'take';
  return '';
}

function q(sel) { return el.querySelector(sel); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
