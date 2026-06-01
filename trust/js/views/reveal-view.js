// Reveal view — "what they really were" overhaul.
// Editorial restage of the cast reveal: kicker + title, a cast list pairing each
// character with their classical strategy, closing lines, the payoff matrix, and
// the bridge to the tournament. Same contract: initRevealView(go) + showReveal().
// Preserves the skip-on-repeat ("instant") behavior via localStorage.

import { CHARACTERS } from '../characters.js';

const T = {
  headerPause:  600,
  charInterval: 350,
  afterCast:    800,
  closingGap:   600,
  closing2Gap:  400,
  gridGap:      600,
};

const SEEN_KEY = 'tg_reveal_seen';

let go = null;
export function initRevealView(navigateFn) { go = navigateFn; }

export function showReveal() {
  const el = document.getElementById('view-reveal');
  const already = hadSeenReveal();

  buildRevealDOM(el);

  if (already) {
    el.classList.remove('instant');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('instant')));
    setTimeout(() => el.classList.add('instant'), 60); // fallback if rAF is throttled
  } else {
    el.classList.remove('instant');
    runChoreography(el);
    markRevealSeen();
  }
}

function buildRevealDOM(el) {
  el.innerHTML = `
    <div class="rvl">
      <header class="rvl-head">
        <div class="rvl-kicker"><span class="dot"></span>The Reveal</div>
        <h1 class="rvl-title">Six strategies, <em>in disguise</em>.</h1>
        <p class="rvl-deck">Every person you met was playing a classical rule of the iterated prisoner's dilemma. Here's who they really were.</p>
      </header>

      <div class="rvl-cast">
        ${CHARACTERS.map(char => `
          <div class="rvl-row" style="--row-color:${char.color}">
            <span class="rvl-pip" style="background:${char.color}"></span>
            <div class="rvl-row-body">
              <div class="rvl-row-head">
                <span class="rvl-name">${char.name}</span>
                <span class="rvl-strategy">${char.revealName}</span>
              </div>
              <p class="rvl-explain">${char.revealExplanation}</p>
            </div>
          </div>`).join('')}
      </div>

      <div class="rvl-closing">
        <p class="rvl-line">These are the six classical strategies of the iterated prisoner's dilemma.</p>
        <p class="rvl-line dim">And this was the game.</p>
      </div>

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

function runChoreography(el) {
  let delay = 100;
  show(el.querySelector('.rvl-head'), delay);
  delay += T.headerPause;

  el.querySelectorAll('.rvl-row').forEach(row => { show(row, delay); delay += T.charInterval; });
  delay += T.afterCast;

  el.querySelectorAll('.rvl-line').forEach(line => { show(line, delay); delay += T.closingGap; });
  delay += T.closing2Gap;

  show(el.querySelector('.rvl-matrix-block'), delay);
  delay += T.gridGap;

  show(el.querySelector('.rvl-bridge'), delay);
}

function show(node, delay) { if (node) setTimeout(() => node.classList.add('shown'), delay); }

function hadSeenReveal() { try { return !!localStorage.getItem(SEEN_KEY); } catch { return false; } }
function markRevealSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch {} }
