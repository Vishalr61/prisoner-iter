// Match summary view — post-match recap overhaul.
// Builds its own DOM (matching the other view modules). Same contract:
// initSummaryView(go) + showSummary(charIndex, match). main.js is untouched.

import { CHARACTERS } from '../characters.js';

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

  // Adaptive summary variant. Grim is binary — any defection gets summaryD.
  let variant;
  if (char.strategyId === 'grim') {
    variant = history.some(r => r.humanMove === 'D') ? 'summaryD' : 'summaryC';
  } else {
    const coopCount = history.filter(r => r.humanMove === 'C').length;
    variant = coopCount > history.length / 2 ? 'summaryC' : 'summaryD';
  }

  const triggerRound = char.strategyId === 'grim' ? history.findIndex(r => r.humanMove === 'D') : -1;
  const track = history.map((r, i) =>
    `<span class="smry-seg ${r.outcome}${i === triggerRound ? ' trigger' : ''}"></span>`).join('');

  el.innerHTML = `
    <div class="smry">
      <div class="smry-kicker"><span class="dot"></span>You &amp; ${escapeHtml(char.name)} · ${history.length} round${history.length === 1 ? '' : 's'}</div>

      <div class="smry-scores">
        <div class="smry-side you">
          <span class="smry-who">You</span>
          <span class="smry-val you">${match.myScore}</span>
        </div>
        <span class="smry-lead">${lead}</span>
        <div class="smry-side them">
          <span class="smry-who them">${escapeHtml(char.name)}</span>
          <span class="smry-val them">${match.theirScore}</span>
        </div>
      </div>

      <div class="smry-track">${track}</div>

      <div class="smry-text">${char[variant].map(p => `<p>${escapeHtml(p)}</p>`).join('')}</div>

      <button class="smry-continue" data-action="continue">Continue <span class="arr">&rarr;</span></button>
    </div>
  `;

  el.querySelector('[data-action="continue"]').addEventListener('click', onContinue);

  go('summary');

  // Stagger in after the view transition settles.
  const parts = ['.smry-scores', '.smry-track', '.smry-text', '.smry-continue'];
  parts.forEach((sel, i) => {
    const node = el.querySelector(sel);
    if (node) setTimeout(() => node.classList.add('shown'), 140 + i * 260);
  });
}

function onContinue() {
  const charIndex = +el.dataset.charIndex;
  const next = charIndex + 1;
  if (next < CHARACTERS.length) go('intro-card', { characterIndex: next });
  else go('campaign-end');
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
