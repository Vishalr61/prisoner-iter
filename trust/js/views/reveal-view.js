// Reveal view — the unmasking.
//
// Instead of six paragraphs, each person's face is shown and then morphs into
// its abstract "true form" as the classical strategy name and a one-line punch
// land. The closing lines, payoff matrix, and bridge to the tournament are
// kept. Same contract: initRevealView(go) + showReveal(). Preserves the
// skip-on-repeat ("instant") behavior via localStorage.

import { CHARACTERS } from '../characters.js';
import { createFace } from '../face.js';
import { silhouetteShape } from '../silhouette.js';
import { getCampaignReads } from '../progress.js';
import * as audio from '../audio.js';

// Short presentation punches (the canonical explanations live in characters.js
// / copy.md; these are the tight one-liners for the unmasking).
const PUNCH = {
  sam:    'Shared every round, no matter what. The most generous rule — and the easiest to exploit.',
  marcus: 'Took every round. It can’t be betrayed, but it can’t build anything either.',
  maya:   'Did whatever you did last. Cooperate first, then mirror. Simple, fair, hard to beat.',
  theo:   'Warm until your first betrayal — then the door never reopened.',
  naomi:  'Forgave one slip, sometimes two. Slower to anger, harder to lose.',
  ren:    'Kept what worked, dropped what didn’t. Watching outcomes, not you.',
};

const SEEN_KEY = 'tg_reveal_seen';
const faces = [];

let go = null;
export function initRevealView(navigateFn) { go = navigateFn; }

export function showReveal() {
  const el = document.getElementById('view-reveal');
  const already = hadSeenReveal();

  buildDOM(el);
  mountFaces(el);

  if (already) {
    faces.forEach(f => f.revealTrueForm(f.glyph));
    el.classList.remove('instant');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('instant')));
    setTimeout(() => el.classList.add('instant'), 60);
  } else {
    el.classList.remove('instant');
    runChoreography(el);
    markRevealSeen();
  }
}

function buildDOM(el) {
  el.innerHTML = `
    <div class="rvl">
      <header class="rvl-head">
        <div class="rvl-kicker"><span class="dot"></span>The Reveal</div>
        <h1 class="rvl-title">Six people, <em>six strategies</em>.</h1>
        <p class="rvl-deck">No one you met was improvising. Each was playing a classical rule of the iterated prisoner's dilemma. Here's who they really were.</p>
      </header>

      <div class="rvl-unmask">
        ${CHARACTERS.map((c, i) => `
          <div class="rvl-card" style="--row-color:${c.color}">
            <div class="rvl-card-face" data-face="${i}"></div>
            <div class="rvl-card-body">
              <div class="rvl-card-head">
                <span class="rvl-card-name">${c.name}</span>
                <span class="rvl-card-arrow" aria-hidden="true">→</span>
                <span class="rvl-card-strat">${c.revealName}</span>
              </div>
              <p class="rvl-card-punch">${PUNCH[c.id] || ''}</p>
            </div>
          </div>`).join('')}
      </div>

      <div class="rvl-closing">
        <p class="rvl-line">These are the six classical strategies of the iterated prisoner's dilemma.</p>
        <p class="rvl-line dim">And this was the game.</p>
      </div>

      ${readsHTML()}

      <div class="rvl-matrix-block">
        <span class="rvl-matrix-label">The payoffs · you / them</span>
        <div class="rvl-matrix">
          <div class="rvl-cell rvl-corner"></div>
          <div class="rvl-cell"><span class="rvl-col-head">They<br>share</span></div>
          <div class="rvl-cell"><span class="rvl-col-head">They<br>take</span></div>
          <div class="rvl-cell"><span class="rvl-row-label">You<br>share</span></div>
          <div class="rvl-cell coop"><span class="rvl-pay"><span class="mine">3</span><span class="sep">/</span><span class="theirs">3</span></span><span class="rvl-cell-note">Mutual gain</span></div>
          <div class="rvl-cell"><span class="rvl-pay"><span class="mine">0</span><span class="sep">/</span><span class="theirs">5</span></span><span class="rvl-cell-note">They exploit</span></div>
          <div class="rvl-cell"><span class="rvl-row-label">You<br>take</span></div>
          <div class="rvl-cell tempt"><span class="rvl-pay"><span class="mine">5</span><span class="sep">/</span><span class="theirs">0</span></span><span class="rvl-cell-note">You exploit</span></div>
          <div class="rvl-cell both-take"><span class="rvl-pay"><span class="mine">1</span><span class="sep">/</span><span class="theirs">1</span></span><span class="rvl-cell-note">Mutual loss</span></div>
        </div>
      </div>

      <div class="rvl-bridge">
        <p class="rvl-bridge-text">You've met the players. Now watch what happens when they all compete at once.</p>
        <div class="rvl-actions">
          <button class="wsp-btn wsp-btn-primary" data-action="to-evolution">Watch them compete →</button>
          <button class="wsp-btn wsp-btn-ghost" data-action="play-again">Play again</button>
        </div>
      </div>
    </div>
  `;

  el.querySelector('[data-action="to-evolution"]')?.addEventListener('click', () => go('evolution'));
  el.querySelector('[data-action="play-again"]')?.addEventListener('click', () => {
    import('../progress.js').then(({ clearProgress }) => { clearProgress(); go('cold-open'); });
  });
}

function readsHTML() {
  const r = getCampaignReads();
  if (!r.total) return '';
  const pct = Math.round((r.correct / r.total) * 100);
  return `
    <div class="rvl-reads">
      <span class="rvl-reads-num">${r.correct}<span class="rvl-reads-slash">/</span>${r.total}</span>
      <p class="rvl-reads-text">Across the campaign you called their move <b>${r.correct} of ${r.total} times</b> (${pct}%). Reading someone <em>is</em> modeling the strategy behind them — which is exactly what you just learned to do.</p>
    </div>`;
}

function mountFaces(el) {
  faces.length = 0;
  CHARACTERS.forEach((c, i) => {
    const slot = el.querySelector(`[data-face="${i}"]`);
    if (!slot) return;
    const face = createFace(c.color, { size: 68 });
    face.glyph = silhouetteShape(c.id, c.color);
    slot.appendChild(face.el);
    faces.push(face);
  });
}

function runChoreography(el) {
  let delay = 120;
  show(el.querySelector('.rvl-head'), delay);
  delay += 700;

  el.querySelectorAll('.rvl-card').forEach((card, i) => {
    show(card, delay);
    setTimeout(() => { faces[i]?.revealTrueForm(faces[i].glyph); audio.play('reveal'); }, delay + 520);
    delay += 900;
  });
  delay += 300;

  el.querySelectorAll('.rvl-line').forEach(line => { show(line, delay); delay += 600; });
  delay += 200;
  const reads = el.querySelector('.rvl-reads');
  if (reads) { show(reads, delay); delay += 700; }
  show(el.querySelector('.rvl-matrix-block'), delay);
  delay += 600;
  show(el.querySelector('.rvl-bridge'), delay);
}

function show(node, delay) { if (node) setTimeout(() => node.classList.add('shown'), delay); }

function hadSeenReveal() { try { return !!localStorage.getItem(SEEN_KEY); } catch { return false; } }
function markRevealSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch {} }
