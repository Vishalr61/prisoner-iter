import { CHARACTERS } from '../characters.js';
import { STRATEGIES } from '../strategies.js';

const ROUNDS = 50;
const PAYOFFS = { R: 3, T: 5, P: 1, S: 0 };

let go = null;

export function initEvolutionView(navigateFn) {
  go = navigateFn;
}

export function showEvolution() {
  const el = document.getElementById('view-evolution');
  buildDOM(el);
  animate(el, computeScores());
}

// ── Tournament engine ─────────────────────────────────────────────────────────

function computeScores() {
  const scores = {};
  CHARACTERS.forEach(c => { scores[c.id] = 0; });

  for (let i = 0; i < CHARACTERS.length; i++) {
    for (let j = i + 1; j < CHARACTERS.length; j++) {
      const a = CHARACTERS[i];
      const b = CHARACTERS[j];
      const { sa, sb } = playMatch(a.strategyId, b.strategyId);
      scores[a.id] += sa;
      scores[b.id] += sb;
    }
  }
  return scores;
}

function playMatch(idA, idB) {
  const mA = [], mB = [];
  let sa = 0, sb = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const a = STRATEGIES[idA].move(mA, mB);
    const b = STRATEGIES[idB].move(mB, mA);
    mA.push(a); mB.push(b);
    const [pa, pb] = score(a, b);
    sa += pa; sb += pb;
  }
  return { sa, sb };
}

function score(a, b) {
  if (a === 'C' && b === 'C') return [PAYOFFS.R, PAYOFFS.R];
  if (a === 'C' && b === 'D') return [PAYOFFS.S, PAYOFFS.T];
  if (a === 'D' && b === 'C') return [PAYOFFS.T, PAYOFFS.S];
  return [PAYOFFS.P, PAYOFFS.P];
}

// ── DOM ───────────────────────────────────────────────────────────────────────

function buildDOM(el) {
  el.innerHTML = `
    <div class="evo-header">
      <h1 class="evo-title">Now they compete.</h1>
      <p class="evo-subtitle">${CHARACTERS.length - 1} opponents each &nbsp;·&nbsp; ${ROUNDS} rounds per match</p>
    </div>

    <div class="evo-board">
      ${CHARACTERS.map(c => `
        <div class="evo-row" data-id="${c.id}" style="--char-color:${c.color}">
          <div class="evo-row-meta">
            <span class="evo-rank"></span>
            <span class="evo-pip" style="background:${c.color}"></span>
            <div class="evo-names">
              <span class="evo-name">${c.name}</span>
              <span class="evo-strategy">${c.revealName}</span>
            </div>
            <span class="evo-score">—</span>
          </div>
          <div class="evo-bar-wrap">
            <div class="evo-bar" style="background:${c.color}"></div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="evo-actions">
      <button class="btn btn-ghost" data-action="play-again">Play again</button>
    </div>
  `;

  el.querySelector('[data-action="play-again"]')
    ?.addEventListener('click', () => {
      import('../progress.js').then(({ clearProgress }) => {
        clearProgress();
        go('cold-open');
      });
    });
}

// ── Animation ─────────────────────────────────────────────────────────────────

function animate(el, scores) {
  const maxScore = Math.max(...Object.values(scores));
  const rows = [...el.querySelectorAll('.evo-row')];

  // Stagger rows in
  rows.forEach((row, i) => {
    setTimeout(() => {
      row.classList.add('shown');
      const scoreEl = row.querySelector('.evo-score');
      const barEl   = row.querySelector('.evo-bar');
      const pct     = maxScore > 0 ? (scores[row.dataset.id] / maxScore) * 100 : 0;

      countUp(scoreEl, scores[row.dataset.id], 700);
      setTimeout(() => {
        barEl.style.width = pct + '%';
      }, 80);
    }, 200 + i * 130);
  });

  // Sort and rank after all rows have animated in
  const totalDelay = 200 + rows.length * 130 + 900;
  setTimeout(() => {
    sortBoard(el, scores);
    el.querySelector('.evo-actions').classList.add('shown');
  }, totalDelay);
}

function sortBoard(el, scores) {
  const board = el.querySelector('.evo-board');
  const rows  = [...board.querySelectorAll('.evo-row')];
  rows.sort((a, b) => scores[b.dataset.id] - scores[a.dataset.id]);

  rows.forEach((row, i) => {
    row.querySelector('.evo-rank').textContent = i + 1;
    if (i === 0) row.classList.add('evo-winner');
    board.appendChild(row); // re-order in DOM
  });
}

function countUp(el, target, duration) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * easeOut(t));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}
