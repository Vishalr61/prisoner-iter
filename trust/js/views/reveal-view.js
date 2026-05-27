import { CHARACTERS } from '../characters.js';

// Timing in ms — adjust these to tune the whole sequence
const T = {
  headerPause:  600,
  charInterval: 350,
  afterCast:    800,
  closing1Gap:  600,
  closing2Gap:  400,
  gridGap:      600,
  bridgeGap:    500,
};

const SEEN_KEY = 'tg_reveal_seen';

let go = null;

export function initRevealView(navigateFn) {
  go = navigateFn;
}

export function showReveal() {
  const el      = document.getElementById('view-reveal');
  const already = hadSeenReveal();

  buildRevealDOM(el);

  if (already) {
    // Skip animation — show everything immediately
    el.classList.add('instant');
  } else {
    el.classList.remove('instant');
    runChoreography(el);
    markRevealSeen();
  }
}

// ── DOM construction ──────────────────────────────────────────────────────────

function buildRevealDOM(el) {
  el.innerHTML = `
    <div class="reveal-header">
      <h1>You just met six strategies in disguise.</h1>
    </div>

    <div class="reveal-cast">
      ${CHARACTERS.map(char => `
        <div class="reveal-cast-row" data-char="${char.id}">
          <div class="reveal-row-pip" style="background:${char.color}"></div>
          <div class="reveal-row-body">
            <span class="reveal-char-label">${char.name}
              <span class="reveal-strategy-label"> — ${char.revealName}</span>
            </span>
            <p class="reveal-explanation">${char.revealExplanation}</p>
          </div>
        </div>`).join('')}
    </div>

    <div class="reveal-closing">
      <p class="reveal-closing-line">
        These are the six classical strategies of iterated prisoner's dilemma.
      </p>
      <p class="reveal-closing-line dim">And this was the game.</p>
    </div>

    ${buildPayoffGrid()}

    <div class="reveal-bridge">
      <p class="reveal-bridge-text">
        You've met the players. Now watch what happens when they all compete at once.
      </p>
      <div class="btn-area" style="padding-bottom:0;">
        <button class="btn btn-primary" data-action="to-evolution">
          Watch them compete →
        </button>
        <button class="btn btn-ghost" data-action="play-again">Play again</button>
      </div>
    </div>
  `;

  el.querySelector('[data-action="to-evolution"]')
    ?.addEventListener('click', () => go('evolution'));

  el.querySelector('[data-action="play-again"]')
    ?.addEventListener('click', () => {
      import('../progress.js').then(({ clearProgress }) => {
        clearProgress();
        go('cold-open');
      });
    });
}

function buildPayoffGrid() {
  return `
    <div class="payoff-grid-wrap">
      <div class="payoff-grid">
        <div></div>
        <div class="pg-col-head">You share</div>
        <div class="pg-col-head">You take</div>

        <div class="pg-row-head">They share</div>
        <div class="pg-cell both-share">
          <span class="pg-cell-scores">3 · 3</span>
          <span class="pg-cell-label">mutual gain</span>
        </div>
        <div class="pg-cell exploit">
          <span class="pg-cell-scores">0 · 5</span>
          <span class="pg-cell-label">you exploit</span>
        </div>

        <div class="pg-row-head">They take</div>
        <div class="pg-cell exploit">
          <span class="pg-cell-scores">5 · 0</span>
          <span class="pg-cell-label">they exploit</span>
        </div>
        <div class="pg-cell both-take">
          <span class="pg-cell-scores">1 · 1</span>
          <span class="pg-cell-label">mutual loss</span>
        </div>
      </div>
    </div>`;
}

// ── Choreography ──────────────────────────────────────────────────────────────

function runChoreography(el) {
  let delay = 100; // small offset so view transition completes first

  // Header
  show(el.querySelector('.reveal-header'), delay);
  delay += T.headerPause;

  // Characters, one by one
  el.querySelectorAll('.reveal-cast-row').forEach(row => {
    show(row, delay);
    delay += T.charInterval;
  });
  delay += T.afterCast;

  // Closing lines
  el.querySelectorAll('.reveal-closing-line').forEach(line => {
    show(line, delay);
    delay += T.closing1Gap;
  });
  delay += T.closing2Gap;

  // Payoff grid
  show(el.querySelector('.payoff-grid-wrap'), delay);
  delay += T.gridGap;

  // Bridge + CTA
  show(el.querySelector('.reveal-bridge'), delay);
}

function show(el, delay) {
  if (!el) return;
  setTimeout(() => el.classList.add('shown'), delay);
}

// ── Progress helpers ──────────────────────────────────────────────────────────

function hadSeenReveal() {
  try { return !!localStorage.getItem(SEEN_KEY); } catch { return false; }
}

function markRevealSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}
