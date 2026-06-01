// Match view — gameplay overhaul.
// Builds its own DOM (matching the builder/intro/evolution pattern) and runs
// the interactive round loop against the real engine. Public contract is
// unchanged: initMatchView(navigate) + startMatch(idx). main.js is untouched.

import { CHARACTERS } from '../characters.js';
import { createMatch } from '../match.js';
import { saveProgress, markCompleted } from '../progress.js';

let go        = null;
let match     = null;
let character = null;
let charIndex = 0;
let busy      = false;
let el        = null;

export function initMatchView(navigateFn) {
  go = navigateFn;
  el = document.getElementById('view-match');
}

export function startMatch(idx) {
  charIndex = idx;
  character = CHARACTERS[idx];
  match     = createMatch(character.strategyId, character.rounds);
  busy      = false;

  el = document.getElementById('view-match');
  el.style.setProperty('--char-color', character.color);
  buildDOM();
  go('match');
}

function buildDOM() {
  el.innerHTML = `
    <div class="mtch">
      <div class="mtch-head">
        <div class="mtch-head-row">
          <span class="mtch-pip"></span>
          <span class="mtch-name">${escapeHtml(character.name)}</span>
          <span class="mtch-round">Round <b data-round>1</b> / ${character.rounds}</span>
        </div>
        <div class="mtch-progress" data-progress></div>
      </div>

      <div class="mtch-card">
        <div class="mtch-scores">
          <div class="mtch-sside you">
            <span class="mtch-swho">You</span>
            <span class="mtch-sval you" data-score="you">0</span>
          </div>
          <span class="mtch-slead" data-lead></span>
          <div class="mtch-sside them">
            <span class="mtch-swho them">${escapeHtml(character.name)}</span>
            <span class="mtch-sval them" data-score="them">0</span>
          </div>
        </div>

        <div class="mtch-reveal">
          <div class="mtch-versus">
            <div class="mtch-vcell you">
              <span class="mtch-vlabel">You</span>
              <div class="mtch-token empty" data-token="you" aria-live="polite"></div>
            </div>
            <span class="mtch-vs">vs</span>
            <div class="mtch-vcell them">
              <span class="mtch-vlabel">${escapeHtml(character.name)}</span>
              <div class="mtch-token empty" data-token="them" aria-live="polite"></div>
            </div>
          </div>
          <p class="mtch-outcome" data-outcome aria-live="polite"></p>
        </div>
      </div>

      <div class="mtch-choices">
        <button class="mtch-choice share" data-action="share"><span class="verb">Share</span><span class="sub">cooperate</span></button>
        <button class="mtch-choice take"  data-action="take"><span class="verb">Take</span><span class="sub">defect</span></button>
      </div>
    </div>
  `;

  el.querySelector('.mtch-pip').style.background = character.color;
  el.querySelector('[data-action="share"]').addEventListener('click', () => handleMove('C'));
  el.querySelector('[data-action="take"]').addEventListener('click', () => handleMove('D'));

  renderProgress([]);
  updateRoundLabel(0);
  setButtons(true);
}

function handleMove(humanMove) {
  if (busy) return;
  busy = true;
  setButtons(false);

  const result = match.step(humanMove);

  // Stage 1 — your move appears immediately.
  showToken('you', humanMove);

  // Stage 2 — opponent "thinks", then reveals after 400ms.
  const botToken = el.querySelector('[data-token="them"]');
  botToken.classList.add('thinking');
  setTimeout(() => {
    botToken.classList.remove('thinking');
    showToken('them', result.botMove);
  }, 400);

  // Stage 3 — scores, outcome, progress at 820ms.
  setTimeout(() => {
    bumpScore('you', result.myScore);
    bumpScore('them', result.theirScore);
    setLead(result.myScore, result.theirScore);

    const outcomeEl = el.querySelector('[data-outcome]');
    outcomeEl.innerHTML = outcomeHTML(humanMove, result.botMove);
    outcomeEl.className = 'mtch-outcome ' + (humanMove === 'C' && result.botMove === 'C' ? 'share' : humanMove === 'D' && result.botMove === 'D' ? 'take' : '');

    const history = match.getHistory();
    renderProgress(history);
    updateRoundLabel(history.length);
    saveProgress(charIndex, history);

    // Fade tokens so the reset at 1200ms is invisible.
    el.querySelectorAll('.mtch-token').forEach(t => t.classList.add('fade'));

    if (result.round >= character.rounds) {
      const coopRate = history.filter(r => r.humanMove === 'C').length / history.length;
      markCompleted(character.id, coopRate, history);
      setTimeout(() => go('summary', { charIndex, match }), 900);
    } else {
      setTimeout(() => {
        resetMoveTokens();
        el.querySelector('[data-outcome]').textContent = '';
        busy = false;
        setButtons(true);
      }, 1200);
    }
  }, 820);
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function bumpScore(who, value) {
  const node = el.querySelector(`[data-score="${who}"]`);
  const current = parseInt(node.textContent) || 0;
  node.textContent = value;
  if (current === value) return;
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

function setLead(you, them) {
  const lead = el.querySelector('[data-lead]');
  const d = you - them;
  lead.textContent = d === 0 ? 'even' : d > 0 ? `you +${d}` : `${character.name} +${-d}`;
}

function showToken(who, move) {
  const token = el.querySelector(`[data-token="${who}"]`);
  token.textContent = move === 'C' ? 'Share' : 'Take';
  token.className = `mtch-token ${move === 'C' ? 'share' : 'take'}`;
  requestAnimationFrame(() => requestAnimationFrame(() => token.classList.add('shown')));
}

function resetMoveTokens() {
  el.querySelectorAll('.mtch-token').forEach(t => { t.className = 'mtch-token empty'; t.textContent = ''; });
}

function setButtons(enabled) {
  ['share', 'take'].forEach(a => { el.querySelector(`[data-action="${a}"]`).disabled = !enabled; });
}

function updateRoundLabel(done) {
  const current = Math.min(done + 1, character.rounds);
  el.querySelector('[data-round]').textContent = current;
}

function renderProgress(history) {
  const row = el.querySelector('[data-progress]');
  row.innerHTML = '';
  const triggerRound = character.strategyId === 'grim'
    ? history.findIndex(r => r.humanMove === 'D')
    : -1;
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

function outcomeHTML(human, bot) {
  if (human === 'C' && bot === 'C') return 'You both <b>shared</b>.';
  if (human === 'C' && bot === 'D') return 'They <b>took</b> while you shared.';
  if (human === 'D' && bot === 'C') return 'You <b>took</b> while they shared.';
  return 'You both <b>took</b>.';
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
