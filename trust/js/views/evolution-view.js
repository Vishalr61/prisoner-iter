import { CHARACTERS } from '../characters.js';
import { STRATEGIES } from '../strategies.js';

// Extra strategies not in the campaign — added to stress-test the reciprocators
const EXTRA = [
  { id: 'gtft', name: 'Generous TfT',   revealName: 'Forgives mistakes',  color: '#2dd4bf', strategyId: 'gtft' },
  { id: 'stft', name: 'Suspicious TfT', revealName: 'Defects first',       color: '#f43f5e', strategyId: 'stft' },
  { id: 'rand', name: 'Random',         revealName: '50/50 coin flip',     color: '#94a3b8', strategyId: 'rand' },
];

const ALL = [...CHARACTERS, ...EXTRA];
const MATCH_COUNT = ALL.length * (ALL.length - 1) / 2;

const ROUNDS = 50;
// Slow first 6 rounds (Marcus leads briefly) then fast — total ~2.1s
const ROUND_DELAYS = (() => {
  const delays = [];
  let t = 0;
  for (let r = 0; r < ROUNDS; r++) {
    delays.push(t);
    t += r < 6 ? 120 : 28;
  }
  return delays;
})();
const SIM_DURATION = ROUND_DELAYS[ROUNDS - 1] + (ROUNDS < 6 ? 120 : 28);
const PAYOFFS      = { R: 3, T: 5, P: 1, S: 0 };

const INSIGHTS = [
  { text: "Generous TfT won. It plays like Maya — cooperate first, mirror back — but occasionally forgives a defection. In a noisy world, that grace outperformed strict accounting." },
  { text: "Theo came fifth. One random defection triggered permanent retaliation. Grim Trigger can't tell a mistake from a betrayal. The pool was noisy enough to punish that." },
  { text: "Marcus came last. The only strategy that never cooperated with anyone, not once." },
  { thesis: true,
    text: "The lesson isn't 'reciprocate.' It's 'reciprocate, but leave room for mistakes. The real world is noisier than any of your six matches.'" },
];

let go = null;

export function initEvolutionView(navigateFn) {
  go = navigateFn;
}

export function showEvolution() {
  const el       = document.getElementById('view-evolution');
  const timeline = buildTimeline(computeHistories());
  buildDOM(el);
  runSimulation(el, timeline);
}

// ── Tournament engine ─────────────────────────────────────────────────────────

function computeHistories() {
  const matches = [];
  for (let i = 0; i < ALL.length; i++) {
    for (let j = i + 1; j < ALL.length; j++) {
      const { histA, histB } = playMatch(ALL[i].strategyId, ALL[j].strategyId);
      matches.push({ i, j, histA, histB });
    }
  }
  return matches;
}

function playMatch(idA, idB) {
  const mA = [], mB = [], histA = [], histB = [];
  let sa = 0, sb = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const a = STRATEGIES[idA].move(mA, mB);
    const b = STRATEGIES[idB].move(mB, mA);
    mA.push(a); mB.push(b);
    const [pa, pb] = score(a, b);
    sa += pa; sb += pb;
    histA.push(sa); histB.push(sb);
  }
  return { histA, histB };
}

function buildTimeline(matches) {
  return Array.from({ length: ROUNDS }, (_, r) => {
    const s = {};
    ALL.forEach(c => { s[c.id] = 0; });
    matches.forEach(({ i, j, histA, histB }) => {
      s[ALL[i].id] += histA[r];
      s[ALL[j].id] += histB[r];
    });
    return s;
  });
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
      <p class="evo-subtitle">
        <span>${MATCH_COUNT} matches · 50 rounds each</span>
        <span class="evo-round-counter"> · Round <span class="evo-round-num">0</span></span>
      </p>
    </div>

    <div class="evo-board">
      ${ALL.map(c => `
        <div class="evo-row" data-id="${c.id}" style="--char-color:${c.color}">
          <div class="evo-row-meta">
            <span class="evo-rank"></span>
            <span class="evo-pip" style="background:${c.color}"></span>
            <div class="evo-names">
              <span class="evo-name">${c.name}</span>
              <span class="evo-strategy">${c.revealName}</span>
            </div>
            <span class="evo-score">0</span>
          </div>
          <div class="evo-bar-wrap">
            <div class="evo-bar" style="background:${c.color}"></div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="evo-insight">
      ${INSIGHTS.map((ins, i) => `
        <p class="evo-insight-line${ins.thesis ? ' evo-thesis' : ''}" data-index="${i}">${ins.text}</p>
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

// ── Simulation ────────────────────────────────────────────────────────────────

function runSimulation(el, timeline) {
  const rows       = [...el.querySelectorAll('.evo-row')];
  const roundNumEl = el.querySelector('.evo-round-num');

  // Stagger rows in
  rows.forEach((row, i) => {
    setTimeout(() => row.classList.add('shown'), 80 + i * 80);
  });

  const simStart = 80 + rows.length * 80 + 150;

  // Tick through rounds — variable speed: slow early (Marcus leads), fast later
  for (let r = 0; r < ROUNDS; r++) {
    setTimeout(() => {
      const s    = timeline[r];
      const maxS = Math.max(...Object.values(s));
      roundNumEl.textContent = r + 1;
      rows.forEach(row => {
        const val = s[row.dataset.id];
        row.querySelector('.evo-score').textContent = val;
        row.querySelector('.evo-bar').style.width =
          maxS > 0 ? (val / maxS * 100) + '%' : '0%';
      });
    }, simStart + ROUND_DELAYS[r]);
  }

  // Sort after simulation — FLIP animation so rows visibly slide
  const sortAt = simStart + SIM_DURATION + 350;
  setTimeout(() => {
    el.querySelector('.evo-round-counter').style.opacity = '0';
    sortBoardFlip(el, timeline[ROUNDS - 1]);
    setTimeout(() => {
      el.querySelector('.evo-insight').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 650);
  }, sortAt);

  // Stagger insight lines (two-step: display then opacity, so transition fires)
  const insightStart = sortAt + 1100;
  el.querySelectorAll('.evo-insight-line').forEach((line, i) => {
    const extraPause = line.classList.contains('evo-thesis') ? 400 : 0;
    setTimeout(() => {
      line.style.display = 'block';
      requestAnimationFrame(() => requestAnimationFrame(() => line.classList.add('shown')));
    }, insightStart + i * 700 + extraPause);
  });

  // Play again
  const actionsAt = insightStart + INSIGHTS.length * 700 + 700;
  setTimeout(() => {
    el.querySelector('.evo-actions').classList.add('shown');
  }, actionsAt);
}

function sortBoardFlip(el, scores) {
  const board = el.querySelector('.evo-board');
  const rows  = [...board.querySelectorAll('.evo-row')];

  // 1. Record positions before sort
  const first = new Map(rows.map(r => [r.dataset.id, r.getBoundingClientRect().top]));

  // 2. Sort DOM and assign ranks
  rows.sort((a, b) => scores[b.dataset.id] - scores[a.dataset.id]);
  rows.forEach((row, i) => {
    row.querySelector('.evo-rank').textContent = i + 1;
    if (i === 0) row.classList.add('evo-winner');
    board.appendChild(row);
  });

  // 3. Record positions after sort (getBoundingClientRect forces reflow)
  const last = new Map(rows.map(r => [r.dataset.id, r.getBoundingClientRect().top]));

  // 4. Snap rows back to their original visual positions
  rows.forEach(row => {
    const delta = first.get(row.dataset.id) - last.get(row.dataset.id);
    if (delta !== 0) {
      row.style.transition = 'none';
      row.style.transform  = `translateY(${delta}px)`;
    }
  });

  // 5. Animate to final positions
  requestAnimationFrame(() => requestAnimationFrame(() => {
    rows.forEach(row => {
      row.style.transition = 'transform 0.55s cubic-bezier(0.25, 1, 0.5, 1)';
      row.style.transform  = 'translateY(0)';
    });
  }));

  // 6. Clean up inline styles after animation completes
  setTimeout(() => {
    rows.forEach(row => { row.style.transition = ''; row.style.transform = ''; });
  }, 700);
}
