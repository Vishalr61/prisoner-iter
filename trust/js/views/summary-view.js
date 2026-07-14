// Match summary — replay-strip overhaul.
// Same contract: initSummaryView(go) + showSummary(charIndex, match).
//
// The old dot track + prose is replaced by:
//   • the opponent's face, frozen in its final expression
//   • a scrubbable two-row replay strip (You / Them) that makes the strategy's
//     pattern legible at a glance — TfT's mirror, Grim's cliff — and lets the
//     player tap any round to relive it
//   • a "reads" tally when the player used the prediction hook
//   • one short takeaway line (kept tight, not a paragraph)

import { CHARACTERS } from '../characters.js';
import { createFace } from '../face.js';
import { replayAgainst } from '../match.js';
import * as audio from '../audio.js';

let go = null;
let el = null;

export function initSummaryView(navigateFn) {
  go = navigateFn;
  el = document.getElementById('view-summary');
}

export function showSummary(charIndex, match) {
  const char    = CHARACTERS[charIndex];
  const history = match.getHistory();
  el = document.getElementById('view-summary');
  el.style.setProperty('--char-color', char.color);
  el.dataset.charIndex = charIndex;

  const margin = match.myScore - match.theirScore;
  const lead = margin === 0 ? 'even' : margin > 0 ? `you +${margin}` : `${char.name} +${-margin}`;

  // Adaptive takeaway variant. Grim is binary — any defection gets summaryD.
  let variant;
  if (char.strategyId === 'grim') {
    variant = history.some(r => r.humanMove === 'D') ? 'summaryD' : 'summaryC';
  } else {
    const coopCount = history.filter(r => r.humanMove === 'C').length;
    variant = coopCount > history.length / 2 ? 'summaryC' : 'summaryD';
  }

  const triggerRound = char.strategyId === 'grim' ? history.findIndex(r => r.humanMove === 'D') : -1;

  const cols = history.map((r, i) => `
    <button class="replay-col" data-round="${i}" aria-label="Round ${i + 1}">
      <span class="rc-head">${i + 1}</span>
      <span class="rc-cell ${r.humanMove === 'C' ? 'share' : 'take'}"></span>
      <span class="rc-cell ${r.botMove === 'C' ? 'share' : 'take'}${i === triggerRound ? ' trigger' : ''}"></span>
    </button>`).join('');

  const reads = match.reads && match.reads.total > 0
    ? `<p class="replay-reads">You read them <b>${match.reads.correct}/${match.reads.total}</b></p>` : '';

  // Counterfactual — what the two extreme lines would have scored you.
  const n = history.length;
  const allC = replayAgainst(char.strategyId, Array(n).fill('C'));
  const allD = replayAgainst(char.strategyId, Array(n).fill('D'));
  const you  = match.myScore;
  const whatif = whatIfHTML(allC, you, allD);

  el.innerHTML = `
    <div class="smry">
      <div class="smry-kicker"><span class="dot"></span>You &amp; ${esc(char.name)} · ${history.length} round${history.length === 1 ? '' : 's'}</div>

      <div class="smry-face" data-face></div>

      <div class="smry-scores">
        <div class="smry-side you">
          <span class="smry-who">You</span>
          <span class="smry-val you">${match.myScore}</span>
        </div>
        <span class="smry-lead">${lead}</span>
        <div class="smry-side them">
          <span class="smry-who them">${esc(char.name)}</span>
          <span class="smry-val them">${match.theirScore}</span>
        </div>
      </div>

      <div class="replay">
        <div class="replay-strip">
          <div class="replay-labels">
            <span class="rc-head"></span>
            <span class="rl">You</span>
            <span class="rl them">${esc(char.name)}</span>
          </div>
          ${cols}
        </div>
        <p class="replay-cap" data-cap>Tap a round to relive it.</p>
        ${reads}
      </div>

      ${whatif}

      <div class="smry-text">${char[variant].map(p => `<p>${esc(p)}</p>`).join('')}</div>

      <button class="smry-continue" data-action="continue">Continue <span class="arr">&rarr;</span></button>
    </div>
  `;

  // Opponent face in its final emotion.
  const emotion = finalEmotion(char, history, match);
  const face = createFace(char.color, { size: 92, emotion });
  el.querySelector('[data-face]').appendChild(face.el);

  // Scrub: tap a round to relive it.
  const cap = el.querySelector('[data-cap]');
  el.querySelectorAll('.replay-col').forEach(col => {
    col.addEventListener('click', () => {
      el.querySelectorAll('.replay-col').forEach(c => c.classList.remove('sel'));
      col.classList.add('sel');
      const i = +col.dataset.round;
      const r = history[i];
      cap.textContent = `Round ${i + 1} — you ${r.humanMove === 'C' ? 'shared' : 'took'}, ${char.name} ${r.botMove === 'C' ? 'shared' : 'took'}.`;
      audio.play('click');
    });
  });

  el.querySelector('[data-action="continue"]').addEventListener('click', onContinue);

  go('summary');
  audio.play('reveal');

  // Stagger in.
  const parts = ['.smry-face', '.smry-scores', '.replay', '.smry-whatif', '.smry-text', '.smry-continue'];
  parts.forEach((sel, i) => {
    const node = el.querySelector(sel);
    if (node) setTimeout(() => node.classList.add('shown'), 120 + i * 200);
  });
}

function whatIfHTML(allC, you, allD) {
  const max = Math.max(allC, you, allD, 1);
  const best = Math.max(allC, you, allD);
  const rows = [
    { label: 'Always share', val: allC, you: false },
    { label: 'Your game',    val: you,  you: true },
    { label: 'Always take',  val: allD, you: false },
  ].map(r => `
    <div class="whatif-row ${r.you ? 'is-you' : ''} ${r.val === best ? 'is-best' : ''}">
      <span class="whatif-label">${r.label}</span>
      <span class="whatif-bar"><span style="width:${Math.round((r.val / max) * 100)}%"></span></span>
      <span class="whatif-val">${r.val}</span>
    </div>`).join('');

  let caption;
  if (you >= best)        caption = 'You found the best line here.';
  else if (best === allC) caption = 'Sharing more would have paid off.';
  else                    caption = 'Taking more would have scored higher — but trust is worth something too.';

  return `
    <div class="smry-whatif">
      <span class="whatif-title">The road not taken</span>
      <div class="whatif-rows">${rows}</div>
      <p class="whatif-caption">${caption}</p>
    </div>`;
}

function finalEmotion(char, history, match) {
  if (char.strategyId === 'grim' && history.some(r => r.humanMove === 'D')) return 'cold';
  const t = typeof match.trustEnd === 'number' ? match.trustEnd : 50;
  if (t >= 66) return 'warm';
  if (t < 26) return 'cold';
  if (t < 45) return 'wary';
  return 'neutral';
}

function onContinue() {
  const charIndex = +el.dataset.charIndex;
  const next = charIndex + 1;
  if (next < CHARACTERS.length) go('map', { next });
  else go('campaign-end');
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
