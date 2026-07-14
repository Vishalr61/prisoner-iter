import { CHARACTERS } from '../characters.js';
import { REGISTRY, CANONICAL_TOURNAMENT_SEED } from '../../../core/registry.js';
import { compileStrategy } from '../../../core/strategy.js';
import { runMatch }    from '../../../core/match.js';
import { classify }    from '../../../core/classify.js';
import { getSavedProgress, getUserStrategies, deleteUserStrategy } from '../progress.js';
import { createFace } from '../face.js';

let evoFaces = {};

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
  { id: 'gtft', name: 'Generous TfT', revealName: 'Forgives mistakes',
    desc: 'Plays like Maya — cooperate first, mirror back — but one time in ten, forgives a defection instead of retaliating.',
    color: '#2dd4bf', strategyId: 'gtft' },
  { id: 'stft', name: 'Suspicious TfT', revealName: 'Defects first',
    desc: 'Plays like Maya — but opens with a betrayal to test the waters, then mirrors whatever comes back.',
    color: '#f43f5e', strategyId: 'stft' },
  { id: 'rand', name: 'Random', revealName: '50/50 coin flip',
    desc: 'No memory. No strategy. Pure coin flip every single round.',
    color: '#94a3b8', strategyId: 'rand' },
];

const CANONICAL = [
  ...CHARACTERS.map(c => ({ id: c.id, name: c.name, color: c.color, label: c.revealName, spec: REGISTRY[c.strategyId], isUser: false })),
  ...EXTRA.map(e => ({ id: e.id, name: e.name, color: e.color, label: e.revealName, spec: REGISTRY[e.strategyId], isUser: false })),
];

let ALL = CANONICAL;

const ROUNDS = 50;
// Slow first 6 rounds (Marcus leads briefly) then fast — total ~2.1s
const ROUND_DELAYS = (() => {
  const delays = []; let t = 0;
  for (let r = 0; r < ROUNDS; r++) { delays.push(t); t += r < 6 ? 120 : 28; }
  return delays;
})();
const SIM_DURATION = ROUND_DELAYS[ROUNDS - 1] + (ROUNDS < 6 ? 120 : 28);

const INSIGHTS = [
  { text: "Among the cast, the strategies that scored best were all the same kind. Cooperate first. Mirror back. Forgive small slights. When unpredictable players entered the field, that grace beat strict accounting." },
  { text: "Theo finished behind every cast member that knew how to forgive. Against Random's occasional defections, his permanent retaliation locked him into losing. Grim Trigger can't tell a mistake from a betrayal." },
  { text: "Marcus never cooperated with anyone, not once. That's how he ends up at the bottom of any pool that knows how to build." },
  { thesis: true, text: "The lesson isn't 'reciprocate.' It's 'reciprocate, but leave room for mistakes. The real world is noisier than any of your six matches.'" },
];

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

const nameById = id => (ALL.find(c => c.id === id)?.name ?? '');

let go = null;
export function initEvolutionView(navigateFn) { go = navigateFn; }

export function showEvolution() {
  const el = document.getElementById('view-evolution');
  ALL = [
    ...CANONICAL,
    ...getUserStrategies().map(spec => ({ id: spec.id, name: spec.name, color: spec.color, label: 'Your build', spec, isUser: true })),
  ];
  const timeline = buildTimeline(computeHistories());
  buildDOM(el);
  mountEvoFaces(el);
  runSimulation(el, timeline);
}

function mountEvoFaces(el) {
  evoFaces = {};
  ALL.forEach(c => {
    const slot = el.querySelector(`[data-face-id="${c.id}"]`);
    if (!slot) return;
    const face = createFace(c.color, { size: 30 });
    slot.appendChild(face.el);
    evoFaces[c.id] = face;
  });
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
  const result = runMatch(compileStrategy(specA), compileStrategy(specB), { rounds: ROUNDS, masterSeed: CANONICAL_TOURNAMENT_SEED });
  return { histA: result.history.map(h => h.aCumulative), histB: result.history.map(h => h.bCumulative) };
}

function buildTimeline(matches) {
  return Array.from({ length: ROUNDS }, (_, r) => {
    const s = {};
    ALL.forEach(c => { s[c.id] = 0; });
    matches.forEach(({ i, j, histA, histB }) => { s[ALL[i].id] += histA[r]; s[ALL[j].id] += histB[r]; });
    return s;
  });
}

// ── DOM ───────────────────────────────────────────────────────────────────────
function buildDOM(el) {
  const matchCount = ALL.length * (ALL.length - 1) / 2;
  el.innerHTML = `
    <div class="wsp cmp" style="--bld-color:#2dd4bf">
      <header class="wsp-masthead">
        <div class="wsp-kicker"><span class="dot"></span>The Trust Game · The Tournament</div>
        <h1 class="wsp-title">Now they <em>compete</em>.</h1>
        <p class="wsp-deck">The stories are over. Every pair plays 50 rounds — ${matchCount} matches in all — and the only thing that counts now is points.</p>
      </header>

      <section class="cmp-challengers">
        <span class="eyebrow">Three challengers enter the pool</span>
        <div class="cmp-chal-grid">
          ${EXTRA.map(c => `
            <div class="cmp-chal" style="--char-color:${c.color}">
              <span class="cmp-chal-name"><span class="pip" style="background:${c.color}"></span>${c.name}</span>
              <span class="cmp-chal-desc">${c.desc}</span>
            </div>`).join('')}
        </div>
      </section>

      <section class="cmp-arena">
        <div class="cmp-board-head">
          <span class="arena-eyebrow">Standings</span>
          <span class="cmp-ticker">
            <span class="cmp-ticker-lead" data-leader></span>
            <span class="cmp-round">Round <b data-round>0</b> / ${ROUNDS}</span>
          </span>
        </div>
        <div class="cmp-board">
          ${ALL.map(c => `
            <div class="cmp-row${c.isUser ? ' cmp-row-user' : ''}" data-id="${c.id}" style="--char-color:${c.color}">
              <span class="cmp-rank" data-rank></span>
              <span class="cmp-face" data-face-id="${c.id}"></span>
              <div class="cmp-names">
                <span class="cmp-name">${c.name}</span>
                <span class="cmp-label">${c.label}</span>
              </div>
              <div class="cmp-bar-track"><div class="cmp-bar" style="background:${c.color}"></div></div>
              <span class="cmp-score" data-score>0</span>
              ${c.isUser ? `<button class="cmp-delete" data-delete-id="${c.id}" title="Delete this player" aria-label="Delete ${c.name}">×</button>` : `<span></span>`}
            </div>`).join('')}
        </div>
      </section>

      <section class="cmp-insights">
        ${INSIGHTS.map((ins, i) => `<p class="cmp-line${ins.thesis ? ' cmp-thesis' : ''}" data-index="${i}">${ins.text}</p>`).join('')}
        <p class="cmp-line cmp-mirror" data-index="${INSIGHTS.length}">${buildMirrorLine()}</p>
      </section>

      <div class="cmp-actions">
        <button class="wsp-btn wsp-btn-primary" data-action="evolve">Watch them evolve →</button>
        <button class="wsp-btn wsp-btn-ghost"   data-action="build">Build a player</button>
        <button class="wsp-btn wsp-btn-ghost"   data-action="lab">Open the lab</button>
        <button class="wsp-btn wsp-btn-ghost"   data-action="play-again">Play again</button>
      </div>
    </div>
  `;

  el.querySelector('[data-action="evolve"]')?.addEventListener('click', () => go('replicator'));
  el.querySelector('[data-action="build"]')?.addEventListener('click', () => go('builder'));
  el.querySelector('[data-action="lab"]')?.addEventListener('click', () => go('lab'));

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

  el.querySelector('[data-action="play-again"]')?.addEventListener('click', () => {
    import('../progress.js').then(({ clearProgress }) => { clearProgress(); go('cold-open'); });
  });
}

// ── Simulation ────────────────────────────────────────────────────────────────
function runSimulation(el, timeline) {
  const rows     = [...el.querySelectorAll('.cmp-row')];
  const roundEl  = el.querySelector('[data-round]');
  const leaderEl = el.querySelector('[data-leader]');
  const chals    = [...el.querySelectorAll('.cmp-chal')];

  // Challengers stagger in first
  chals.forEach((c, i) => setTimeout(() => c.classList.add('shown'), 200 + i * 220));

  // Board rows stagger in after challengers settle
  const boardStart = 200 + chals.length * 220 + 300;
  rows.forEach((row, i) => setTimeout(() => row.classList.add('shown'), boardStart + i * 60));

  const simStart = boardStart + rows.length * 60 + 200;

  // Tick through rounds — variable speed
  for (let r = 0; r < ROUNDS; r++) {
    setTimeout(() => {
      const s = timeline[r];
      const maxS = Math.max(...Object.values(s));
      roundEl.textContent = r + 1;
      let leadId = null, leadVal = -1;
      rows.forEach(row => {
        const val = s[row.dataset.id];
        row.querySelector('[data-score]').textContent = val;
        row.querySelector('.cmp-bar').style.width = maxS > 0 ? (val / maxS * 100) + '%' : '0%';
        if (val > leadVal) { leadVal = val; leadId = row.dataset.id; }
      });
      if (leadId) leaderEl.innerHTML = `<b>${nameById(leadId)}</b> leads`;
    }, simStart + ROUND_DELAYS[r]);
  }

  // Sort after simulation — FLIP animation
  const sortAt = simStart + SIM_DURATION + 350;
  setTimeout(() => {
    leaderEl.style.opacity = '0';
    el.querySelector('.cmp-round').style.opacity = '0';
    sortBoardFlip(el, timeline[ROUNDS - 1]);
    setTimeout(() => el.querySelector('.cmp-insights').scrollIntoView({ behavior: 'smooth', block: 'start' }), 650);
  }, sortAt);

  // Stagger insight lines
  const insightStart = sortAt + 1100;
  const lines = el.querySelectorAll('.cmp-line');
  lines.forEach((line, i) => {
    const extra = line.classList.contains('cmp-mirror') ? 700 : line.classList.contains('cmp-thesis') ? 400 : 0;
    setTimeout(() => {
      line.style.display = 'block';
      setTimeout(() => line.classList.add('shown'), 20);
    }, insightStart + i * 700 + extra);
  });

  // Actions
  const actionsAt = insightStart + lines.length * 700 + 1100;
  setTimeout(() => el.querySelector('.cmp-actions').classList.add('shown'), actionsAt);
}

function sortBoardFlip(el, scores) {
  const board = el.querySelector('.cmp-board');
  const rows  = [...board.querySelectorAll('.cmp-row')];

  const first = new Map(rows.map(r => [r.dataset.id, r.getBoundingClientRect().top]));

  rows.sort((a, b) => scores[b.dataset.id] - scores[a.dataset.id]);
  rows.forEach((row, i) => {
    row.querySelector('[data-rank]').textContent = i + 1;
    if (i === 0) row.classList.add('win');
    if (i < 3) row.classList.add('podium');
    board.appendChild(row);
    // Faces react to their finish: the winner beams, the cellar-dweller sours.
    const face = evoFaces[row.dataset.id];
    if (face) face.set(i === 0 ? 'warm' : i === rows.length - 1 ? 'wary' : i < 3 ? 'neutral' : 'neutral');
  });

  const last = new Map(rows.map(r => [r.dataset.id, r.getBoundingClientRect().top]));

  rows.forEach(row => {
    const delta = first.get(row.dataset.id) - last.get(row.dataset.id);
    if (delta !== 0) { row.style.transition = 'none'; row.style.transform = `translateY(${delta}px)`; }
  });

  requestAnimationFrame(() => requestAnimationFrame(() => {
    rows.forEach(row => { row.style.transition = 'transform 0.55s cubic-bezier(0.25, 1, 0.5, 1)'; row.style.transform = 'translateY(0)'; });
  }));

  setTimeout(() => { rows.forEach(row => { row.style.transition = ''; row.style.transform = ''; }); }, 700);
}
