import { CHARACTERS } from '../characters.js';
import { createMatch } from '../match.js';
import { saveProgress, markCompleted } from '../progress.js';

let go        = null;
let match     = null;
let character = null;
let charIndex = 0;
let busy      = false;

export function initMatchView(navigateFn) {
  go = navigateFn;
  const el = document.getElementById('view-match');
  el.querySelector('[data-action="share"]').addEventListener('click', () => handleMove('C'));
  el.querySelector('[data-action="take"]').addEventListener('click',  () => handleMove('D'));
}

export function startMatch(idx) {
  charIndex = idx;
  character = CHARACTERS[idx];
  match     = createMatch(character.strategyId, character.rounds);
  busy      = false;

  const el = document.getElementById('view-match');
  el.style.setProperty('--char-color', character.color);
  el.querySelector('.match-char-pip').style.background  = character.color;
  el.querySelector('.match-char-name').textContent      = character.name;
  el.querySelector('.score-who.them').textContent       = character.name;
  el.querySelector('.score-value.you').textContent      = '0';
  el.querySelector('.score-value.them').textContent     = '0';

  setButtons(true);
  resetMoveTokens();
  el.querySelector('.round-outcome').textContent = '';
  renderDots([]);
  updateRoundLabel(0);

  go('match');
}

function handleMove(humanMove) {
  if (busy) return;
  busy = true;
  setButtons(false);

  const result = match.step(humanMove);

  // Stage 1: your move appears immediately
  showToken('you', humanMove);

  // Stage 2: thinking indicator on bot token, then their move after 400ms
  const botToken = document.querySelector('#view-match .move-token[data-side="them"]');
  botToken.classList.add('thinking');
  setTimeout(() => {
    botToken.classList.remove('thinking');
    showToken('them', result.botMove);
  }, 400);

  // Stage 3: scores + outcome after both shown
  setTimeout(() => {
    const el = document.getElementById('view-match');
    bumpScore('#view-match .score-value.you',  result.myScore);
    bumpScore('#view-match .score-value.them', result.theirScore);
    el.querySelector('.round-outcome').textContent = outcomeText(humanMove, result.botMove);

    const history = match.getHistory();
    renderDots(history);
    updateRoundLabel(history.length);

    saveProgress(charIndex, history);

    // Begin fading tokens out so reset at 1200ms is invisible
    document.querySelectorAll('#view-match .move-token').forEach(t => t.classList.add('token-fade'));

    if (result.round >= character.rounds) {
      const coopRate = history.filter(r => r.humanMove === 'C').length / history.length;
      markCompleted(character.id, coopRate, history);
      setTimeout(() => go('summary', { charIndex, match }), 900);
    } else {
      setTimeout(() => {
        resetMoveTokens();
        el.querySelector('.round-outcome').textContent = '';
        busy = false;
        setButtons(true);
      }, 1200);
    }
  }, 820);
}

function bumpScore(selector, newValue) {
  const el = document.querySelector(selector);
  const current = parseInt(el.textContent) || 0;
  el.textContent = newValue;
  if (current === newValue) return;
  el.classList.remove('bump');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('bump');
}

function showToken(who, move) {
  const token = document.querySelector(`#view-match .move-token[data-side="${who}"]`);
  token.textContent  = move === 'C' ? 'Share' : 'Take';
  token.className    = `move-token ${move === 'C' ? 'share' : 'take'}`;
  token.dataset.side = who;
  requestAnimationFrame(() => requestAnimationFrame(() => token.classList.add('shown')));
}

function resetMoveTokens() {
  document.querySelectorAll('#view-match .move-token').forEach(t => {
    t.className   = 'move-token empty';
    t.textContent = '';
  });
}

function setButtons(enabled) {
  ['share', 'take'].forEach(a => {
    document.querySelector(`#view-match [data-action="${a}"]`).disabled = !enabled;
  });
}

function updateRoundLabel(done) {
  const current = Math.min(done + 1, character.rounds);
  document.querySelector('#view-match .match-round-label').textContent =
    `Round ${current} / ${character.rounds}`;
}

function renderDots(history) {
  const row    = document.querySelector('#view-match .dots-row');
  row.innerHTML = '';

  // For Grim, find the first player defection — that dot gets the trigger class
  const triggerRound = character.strategyId === 'grim'
    ? history.findIndex(r => r.humanMove === 'D')
    : -1;

  for (let i = 0; i < character.rounds; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (i < history.length) {
      dot.classList.add(history[i].outcome);
      if (i === triggerRound) dot.classList.add('trigger');
      if (i === history.length - 1) dot.classList.add('new'); // pop animation on latest dot
    } else if (i === history.length) {
      dot.classList.add('active');
    }
    row.appendChild(dot);
  }
}

function outcomeText(human, bot) {
  if (human === 'C' && bot === 'C') return 'You both shared.';
  if (human === 'C' && bot === 'D') return 'They took while you shared.';
  if (human === 'D' && bot === 'C') return 'You took while they shared.';
  return 'You both took.';
}
