import { CHARACTERS } from '../characters.js';
import { STRATEGIES } from '../strategies.js';

const ROUNDS       = 50;
const MS_PER_ROUND = 40; // 50 × 40ms = 2s simulation
const PAYOFFS      = { R: 3, T: 5, P: 1, S: 0 };

const INSIGHTS = [
  { charId: 'maya',
    text: "Maya wasn't the nicest player here — Sam was. She wasn't the harshest — Theo was. She just matched whoever she was playing. That's all it took." },
  { charId: 'sam',
    text: "Sam came fifth. He shared every round, with everyone, no matter what. That's a gift to anyone willing to take it. Marcus took it." },
  { charId: 'marcus',
    text: "Marcus came last. The only player he beat was Sam." },
  { thesis: true,
    text: "The lesson isn't 'trust people.' It's 'cooperate with people who cooperate back — and stop when they don't.'" },
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
  for (let i = 0; i < CHARACTERS.length; i++) {
    for (let j = i + 1; j < CHARACTERS.length; j++) {
      const { histA, histB } = playMatch(
        CHARACTERS[i].strategyId,
        CHARACTERS[j].strategyId,
      );
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
    CHARACTERS.forEach(c => { s[c.id] = 0; });
    matches.forEach(({ i, j, histA, histB }) => {
      s[CHARACTERS[i].id] += histA[r];
      s[CHARACTERS[j].id] += histB[r];
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
        <span>15 matches · 50 rounds each</span>
        <span class="evo-round-counter"> · Round <span class="evo-round-num">0</span></span>
      </p>
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

  // Tick through rounds
  for (let r = 0; r < ROUNDS; r++) {
    setTimeout(() => {
      const s       = timeline[r];
      const maxS    = Math.max(...Object.values(s));
      roundNumEl.textContent = r + 1;
      rows.forEach(row => {
        const val = s[row.dataset.id];
        row.querySelector('.evo-score').textContent = val;
        row.querySelector('.evo-bar').style.width =
          maxS > 0 ? (val / maxS * 100) + '%' : '0%';
      });
    }, simStart + r * MS_PER_ROUND);
  }

  // Sort after simulation
  const sortAt = simStart + ROUNDS * MS_PER_ROUND + 350;
  setTimeout(() => {
    el.querySelector('.evo-round-counter').style.opacity = '0';
    const final = timeline[ROUNDS - 1];
    sortBoard(el, final);

    // Auto-scroll to insight block
    setTimeout(() => {
      el.querySelector('.evo-insight').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 500);
  }, sortAt);

  // Stagger insight lines (two-step: display then opacity, so transition fires)
  const insightStart = sortAt + 900;
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

function sortBoard(el, scores) {
  const board = el.querySelector('.evo-board');
  const rows  = [...board.querySelectorAll('.evo-row')];
  rows.sort((a, b) => scores[b.dataset.id] - scores[a.dataset.id]);
  rows.forEach((row, i) => {
    row.querySelector('.evo-rank').textContent = i + 1;
    if (i === 0) row.classList.add('evo-winner');
    board.appendChild(row);
  });
}
