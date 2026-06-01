import { CHARACTERS } from '../characters.js';
import { REGISTRY, CANONICAL_TOURNAMENT_SEED } from '../../../core/registry.js';
import { compileStrategy } from '../../../core/strategy.js';
import { runMatch }    from '../../../core/match.js';
import { classify }    from '../../../core/classify.js';
import { getSavedProgress, getUserStrategies, deleteUserStrategy } from '../progress.js';

// The INSIGHTS array below was written for tournament seed=1, which produces
// a specific ranking (Theo always 4th, Marcus always last, top three rotating
// among TfT/Tf2T/GTfT). If this assert trips, re-run core/__seed_sweep.mjs,
// re-verify every INSIGHTS line, then update this expected value.
const COPY_EXPECTS_SEED = 1;
if (CANONICAL_TOURNAMENT_SEED !== COPY_EXPECTS_SEED) {
  throw new Error(
    `Evolution INSIGHTS copy was written for tournament seed=${COPY_EXPECTS_SEED}, ` +
    `but core/registry now exports CANONICAL_TOURNAMENT_SEED=${CANONICAL_TOURNAMENT_SEED}. ` +
    `Re-verify each insight line in evolution-view.js, then update COPY_EXPECTS_SEED.`
  );
}

// Extra strategies not in the campaign — added to stress-test the reciprocators
const EXTRA = [
  {
    id: 'gtft', name: 'Generous TfT', revealName: 'Forgives mistakes',
    desc: 'Plays like Maya — cooperate first, mirror back — but one time in ten, forgives a defection instead of retaliating.',
    color: '#2dd4bf', strategyId: 'gtft',
  },
  {
    id: 'stft', name: 'Suspicious TfT', revealName: 'Defects first',
    desc: 'Plays like Maya — but opens with a betrayal to test the waters, then mirrors whatever comes back.',
    color: '#f43f5e', strategyId: 'stft',
  },
  {
    id: 'rand', name: 'Random', revealName: '50/50 coin flip',
    desc: 'No memory. No strategy. Pure coin flip every single round.',
    color: '#94a3b8', strategyId: 'rand',
  },
];

// Canonical cast — fixed. User-built strategies are picked up at view-show
// time and slot in alongside these. The INSIGHTS copy below talks about the
// canonical 9-strategy tournament; user strategies appear in the board (so
// the player sees their build compete) but don't shift the lesson.
const CANONICAL = [
  ...CHARACTERS.map(c => ({
    id: c.id, name: c.name, color: c.color,
    label: c.revealName,
    spec: REGISTRY[c.strategyId],
    isUser: false,
  })),
  ...EXTRA.map(e => ({
    id: e.id, name: e.name, color: e.color,
    label: e.revealName,
    spec: REGISTRY[e.strategyId],
    isUser: false,
  })),
];

// Loaded fresh each showEvolution() — includes any user strategies the
// player has saved.
let ALL = CANONICAL;

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

// Insights describe the canonical 9-strategy tournament. They're worded to
// stay true even when user strategies enter the board — the lesson is about
// the cast, not the ranking of any one round.
const INSIGHTS = [
  { text: "Among the cast, the strategies that scored best were all the same kind. Cooperate first. Mirror back. Forgive small slights. When unpredictable players entered the field, that grace beat strict accounting." },
  { text: "Theo finished behind every cast member that knew how to forgive. Against Random's occasional defections, his permanent retaliation locked him into losing. Grim Trigger can't tell a mistake from a betrayal." },
  { text: "Marcus never cooperated with anyone, not once. That's how he ends up at the bottom of any pool that knows how to build." },
  { thesis: true,
    text: "The lesson isn't 'reciprocate.' It's 'reciprocate, but leave room for mistakes. The real world is noisier than any of your six matches.'" },
];

// Mirror lines, keyed by the strategy id the classifier returns.
// Fallback fires when the player's moves don't match any character cleanly.
const MIRROR_LINES = {
  allC:   "You played like Sam. You shared every time, even when it cost you.",
  allD:   "You played like Marcus. You took every round. You walked away with more, but you built nothing.",
  tft:    "You played like Maya. You mirrored what came at you. That's how she won.",
  grim:   "You played like Theo. One betrayal was enough for you, too.",
  tf2t:   "You played like Naomi. You let small things go. Twice, if needed.",
  pavlov: "You played like Ren. You stayed with what worked. Switched when it didn't. You weren't watching them, you were watching what happened.",
};
const MIRROR_FALLBACK = "Your moves didn't match any of them cleanly. Maybe that's the lesson.";

function buildMirrorLine() {
  const saved = getSavedProgress();
  const result = classify(saved?.campaign?.playerHistory);
  return result.character ? MIRROR_LINES[result.character] : MIRROR_FALLBACK;
}

let go = null;

export function initEvolutionView(navigateFn) {
  go = navigateFn;
}

export function showEvolution() {
  const el = document.getElementById('view-evolution');
  ALL = [
    ...CANONICAL,
    ...getUserStrategies().map(spec => ({
      id: spec.id, name: spec.name, color: spec.color,
      label: 'Your build',
      spec,
      isUser: true,
    })),
  ];
  const timeline = buildTimeline(computeHistories());
  buildDOM(el);
  runSimulation(el, timeline);
}

// ── Tournament engine ─────────────────────────────────────────────────────────

function computeHistories() {
  const matches = [];
  for (let i = 0; i < ALL.length; i++) {
    for (let j = i + 1; j < ALL.length; j++) {
      const { histA, histB } = playMatch(ALL[i].spec, ALL[j].spec);
      matches.push({ i, j, histA, histB });
    }
  }
  return matches;
}

function playMatch(specA, specB) {
  const stratA = compileStrategy(specA);
  const stratB = compileStrategy(specB);
  const result = runMatch(stratA, stratB, { rounds: ROUNDS, masterSeed: CANONICAL_TOURNAMENT_SEED });
  return {
    histA: result.history.map(h => h.aCumulative),
    histB: result.history.map(h => h.bCumulative),
  };
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

// ── DOM ───────────────────────────────────────────────────────────────────────

function buildDOM(el) {
  el.innerHTML = `
    <div class="evo-header">
      <h1 class="evo-title">Now they compete.</h1>
      <p class="evo-subtitle">
        <span>Every pair plays 50 rounds — ${ALL.length * (ALL.length - 1) / 2} matches total</span>
        <span class="evo-round-counter"> · Round <span class="evo-round-num">0</span></span>
      </p>
    </div>

    <div class="evo-newcomers">
      <p class="evo-newcomers-intro">Three new challengers join your six characters:</p>
      ${EXTRA.map(c => `
        <div class="evo-newcomer">
          <span class="evo-pip" style="background:${c.color}; margin-top:3px"></span>
          <div class="evo-newcomer-text">
            <span class="evo-newcomer-name" style="color:${c.color}">${c.name}</span>
            <span class="evo-newcomer-desc">${c.desc}</span>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="evo-board">
      ${ALL.map(c => `
        <div class="evo-row${c.isUser ? ' evo-row-user' : ''}" data-id="${c.id}" style="--char-color:${c.color}">
          <div class="evo-row-meta">
            <span class="evo-rank"></span>
            <span class="evo-pip" style="background:${c.color}"></span>
            <div class="evo-names">
              <span class="evo-name">${c.name}</span>
              <span class="evo-strategy">${c.label}</span>
            </div>
            <span class="evo-score">0</span>
            ${c.isUser ? `<button class="evo-delete" data-delete-id="${c.id}" title="Delete this player" aria-label="Delete ${c.name}">×</button>` : ''}
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
      <p class="evo-insight-line evo-mirror" data-index="${INSIGHTS.length}">${buildMirrorLine()}</p>
    </div>

    <div class="evo-actions">
      <button class="btn btn-primary" data-action="build">Now build one →</button>
      <button class="btn btn-ghost"   data-action="lab">Open the lab</button>
      <button class="btn btn-ghost"   data-action="play-again">Play again</button>
    </div>
  `;

  el.querySelector('[data-action="build"]')
    ?.addEventListener('click', () => go('builder'));

  el.querySelector('[data-action="lab"]')
    ?.addEventListener('click', () => go('lab'));

  // Delete-user-strategy buttons. Re-show the view after deletion so the
  // board reflects the new roster from scratch.
  el.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      const name = btn.getAttribute('aria-label')?.replace('Delete ', '') ?? 'this player';
      if (!confirm(`Delete "${name}"? They'll be removed from the tournament.`)) return;
      deleteUserStrategy(id);
      showEvolution();
    });
  });

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
  const rows           = [...el.querySelectorAll('.evo-row')];
  const roundNumEl     = el.querySelector('.evo-round-num');
  const newcomerIntro  = el.querySelector('.evo-newcomers-intro');
  const newcomerRows   = [...el.querySelectorAll('.evo-newcomer')];

  // Stagger newcomers in first so users understand who's joining
  setTimeout(() => newcomerIntro.classList.add('shown'), 150);
  newcomerRows.forEach((row, i) => {
    setTimeout(() => row.classList.add('shown'), 350 + i * 280);
  });

  // Board rows stagger in after newcomers settle
  const boardStart = 350 + newcomerRows.length * 280 + 350;
  rows.forEach((row, i) => {
    setTimeout(() => row.classList.add('shown'), boardStart + i * 70);
  });

  const simStart = boardStart + rows.length * 70 + 200;

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
  const insightLines = el.querySelectorAll('.evo-insight-line');
  insightLines.forEach((line, i) => {
    const extraPause = line.classList.contains('evo-mirror') ? 700
                     : line.classList.contains('evo-thesis') ? 400
                     : 0;
    setTimeout(() => {
      line.style.display = 'block';
      requestAnimationFrame(() => requestAnimationFrame(() => line.classList.add('shown')));
    }, insightStart + i * 700 + extraPause);
  });

  // Play again
  const actionsAt = insightStart + insightLines.length * 700 + 1100;
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
