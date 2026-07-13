// Match view — entertainment overhaul.
//
// Same public contract as before (initMatchView(navigate) + startMatch(idx)),
// but the round loop now drives:
//   • an expressive opponent face that reacts to every outcome        (face.js)
//   • coin payoffs that physically drop into each side's tray
//   • a trust meter that fills, drains, and shatters (Grim)
//   • the "call it" prediction hook from round 3 on
//   • screen juice + procedural audio
//
// The engine contract (createMatch/step/getHistory) is untouched.

import { CHARACTERS } from '../characters.js';
import { createMatch } from '../match.js';
import { saveProgress, markCompleted } from '../progress.js';
import { createFace } from '../face.js';
import * as audio from '../audio.js';
import { flash, shake, burst, pulse, isReduced } from '../juice.js';

const CRACK_SVG = `<svg viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0,5 18,5 24,1 30,9 37,2 44,8 50,4 57,9 63,2 70,8 76,4 83,9 100,5" fill="none" stroke="var(--take)" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

let go        = null;
let el        = null;
let character = null;
let charIndex = 0;
let match     = null;
let face      = null;
let busy      = false;

// per-match state
let trust        = 50;
let shattered    = false;
let grimTriggered = false;
let shareStreak  = 0;
let pendingGuess = null;
let reads        = { correct: 0, total: 0 };

export function initMatchView(navigateFn) {
  go = navigateFn;
  el = document.getElementById('view-match');
}

export function startMatch(idx) {
  charIndex = idx;
  character = CHARACTERS[idx];
  match     = createMatch(character.strategyId, character.rounds);
  busy = false;
  trust = 50; shattered = false; grimTriggered = false; shareStreak = 0;
  pendingGuess = null; reads = { correct: 0, total: 0 };

  el = document.getElementById('view-match');
  el.style.setProperty('--char-color', character.color);
  buildDOM();
  setupRound();
  go('match');
}

// ── DOM ─────────────────────────────────────────────────────────────────────
function buildDOM() {
  el.innerHTML = `
    <div class="mtch2">
      <div class="m2-track" data-progress></div>

      <div class="m2-hero">
        <div class="m2-facewrap" data-face></div>
        <div class="m2-caption">
          <span class="m2-name">${esc(character.name)}</span>
          <span class="m2-round">Round <b data-round>1</b> / ${character.rounds}</span>
        </div>
      </div>

      <div class="trust" data-trust>
        <div class="trust-head"><span>distrust</span><b data-trust-label>uneasy</b><span>trust</span></div>
        <div class="trust-track" data-trust-track>
          <div class="trust-fill" data-trust-fill></div>
          <div class="trust-crack" data-trust-crack>${CRACK_SVG}</div>
        </div>
      </div>

      <div class="m2-board">
        <div class="m2-side you">
          <span class="m2-who">You</span>
          <b class="m2-val" data-score="you">0</b>
          <div class="coins-tray you" data-tray="you"></div>
        </div>
        <span class="m2-lead" data-lead>even</span>
        <div class="m2-side them">
          <span class="m2-who them">${esc(character.name)}</span>
          <b class="m2-val" data-score="them">0</b>
          <div class="coins-tray them" data-tray="them"></div>
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
          <button class="mtch-choice share" data-action="share"><span class="verb">Share</span><span class="sub">cooperate</span></button>
          <button class="mtch-choice take"  data-action="take"><span class="verb">Take</span><span class="sub">defect</span></button>
        </div>
      </div>
    </div>
  `;

  // Opponent face
  face = createFace(character.color, { size: 116 });
  el.querySelector('[data-face]').appendChild(face.el);
  if (!isReduced()) face.startIdle();

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
  const roundIndex = history.length;          // 0-based index of the upcoming round

  q('[data-round]').textContent = Math.min(roundIndex + 1, character.rounds);
  q('[data-tray="you"]').innerHTML = '';
  q('[data-tray="them"]').innerHTML = '';
  q('[data-move="you"]').className = 'coin-move';
  q('[data-move="them"]').className = 'coin-move';
  q('[data-move="you"]').textContent = '';
  q('[data-move="them"]').textContent = '';
  q('[data-outcome]').textContent = '';
  renderProgress(history);

  // Prediction hook from round 3 onward (needs a couple of rounds of read).
  const predictEl = q('[data-predict]');
  const choicesEl = q('[data-choices]');
  pendingGuess = null;
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
}

// ── The round ────────────────────────────────────────────────────────────────
function handleMove(humanMove) {
  if (busy) return;
  busy = true;
  setChoices(false);
  audio.play('choose');

  const result = match.step(humanMove);
  const { botMove, myPay, theirPay, outcome } = result;

  // 1 — your move chip appears immediately.
  showMove('you', humanMove);

  // 2 — opponent "thinks", then reveals + the face reacts.
  face.set('thinking');
  setTimeout(() => {
    showMove('them', botMove);

    const grimNow = character.strategyId === 'grim' && botMove === 'D' && !grimTriggered;
    if (grimNow) grimTriggered = true;

    face.reactTo(outcome);
    resolveOutcome(result, grimNow);
  }, isReduced() ? 160 : 480);
}

function resolveOutcome(result, grimNow) {
  const { humanMove, botMove, myPay, theirPay, myScore, theirScore, outcome } = result;

  // Coins drop into each tray.
  dropCoins('you', myPay);
  dropCoins('them', theirPay);

  // Scores + lead.
  setTimeout(() => {
    bumpScore('you', myScore);
    bumpScore('them', theirScore);
    setLead(myScore, theirScore);
  }, 260);

  // Trust + sound + juice.
  shareStreak = outcome === 'mutual-share' ? shareStreak + 1 : 0;
  applyTrust(outcome, grimNow);
  updateTrust(true);

  if (grimNow) {
    audio.play('shatter');
    audio.bumpTension(0.5);
    flash('rgba(210,75,75,0.4)');
    shake(el.querySelector('.mtch2'));
    burst(q('[data-trust-track]'), { color: ['#d24b4b', '#8a2f2f'], count: 14 });
  } else {
    audio.playOutcome(outcome);
    tensionFor(outcome);
    juiceFor(outcome);
    if (shareStreak >= 3) {
      audio.play('streak');
      burst(face.el, { color: ['#5fb878', '#f0c674'], count: 12 });
    }
  }

  // Prediction scoring.
  scorePrediction(botMove);

  // Outcome line.
  const outcomeEl = q('[data-outcome]');
  outcomeEl.innerHTML = outcomeLine(humanMove, botMove);
  outcomeEl.className = 'm2-outcome ' + outcomeClass(outcome);

  saveProgress(charIndex, match.getHistory());
  renderProgress(match.getHistory());

  const done = result.round >= character.rounds;
  if (done) {
    const history = match.getHistory();
    const coopRate = history.filter(r => r.humanMove === 'C').length / history.length;
    match.reads = reads;
    match.trustEnd = trust;
    markCompleted(character.id, coopRate, history);
    setTimeout(() => { face.stopIdle(); go('summary', { charIndex, match }); }, 1250);
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

// ── Trust meter ───────────────────────────────────────────────────────────────
function applyTrust(outcome, grimNow) {
  if (grimNow) { trust = 0; shattered = true; return; }
  if (shattered) { trust = Math.max(0, trust - 4); return; }
  let d = 0;
  if      (outcome === 'mutual-share') d = 14 + Math.min(6, shareStreak * 2);
  else if (outcome === 'exploiter')    d = -7;    // you took from a sharer
  else if (outcome === 'exploited')    d = -13;   // they took your trust
  else                                 d = -6;     // mutual take
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
  if (outcome === 'mutual-share') { burst(face.el, { color: ['#5fb878', '#7fd39a'], count: 9 }); pulse(face.el); }
  else if (outcome === 'exploited') { flash('rgba(210,75,75,0.32)'); shake(arena); }
  else if (outcome === 'exploiter') { flash('rgba(240,198,116,0.22)'); }
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
      if (i < 3) audio.play('coin');
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
