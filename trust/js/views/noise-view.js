// Noise chapter (idea #2) — why forgiveness beats rigidity under miscommunication.
//
// A scripted, deterministic demonstration. Two pairs play the same game; at one
// round a signal is garbled (a cooperate is received as a defect). The strict
// Tit-for-Tat pair falls into a perpetual out-of-phase retaliation echo; the
// forgiving Tit-for-Two-Tats pair absorbs the slip and returns to cooperation —
// and scores more. Contract: initNoiseView(go) + showNoise().

import * as audio from '../audio.js';
import { flash, isReduced } from '../juice.js';

const PAY = { R: 3, T: 5, P: 1, S: 0 };
const GARBLE = 3;   // 0-based round index where the signal is garbled

// Hand-scripted actual moves (A = "You", B = "Friend"). Textbook dynamics:
// one defection turns two strict mirrors into an out-of-phase alternation;
// Tit-for-Two-Tats needs two in a row, so it forgives the single slip.
const LANES = [
  { key: 'strict', title: 'Strict mirrors', strat: 'Tit-for-Tat',
    a: ['C', 'C', 'C', 'D', 'C', 'D', 'C', 'D'],
    b: ['C', 'C', 'C', 'C', 'D', 'C', 'D', 'C'] },
  { key: 'forgiving', title: 'Forgiving', strat: 'Tit-for-Two-Tats',
    a: ['C', 'C', 'C', 'D', 'C', 'C', 'C', 'C'],
    b: ['C', 'C', 'C', 'C', 'C', 'C', 'C', 'C'] },
];

function payFor(a, b) {
  if (a === 'C' && b === 'C') return PAY.R + PAY.R;
  if (a === 'D' && b === 'D') return PAY.P + PAY.P;
  return PAY.T + PAY.S;                 // one exploits the other
}
function laneScore(lane) { return lane.a.reduce((s, _, i) => s + payFor(lane.a[i], lane.b[i]), 0); }

let go = null;
export function initNoiseView(navigateFn) { go = navigateFn; }

export function showNoise() {
  const el = document.getElementById('view-noise');
  const rounds = LANES[0].a.length;

  el.innerHTML = `
    <div class="noise">
      <header class="noise-head">
        <div class="noise-kicker"><span class="dot"></span>One more thing</div>
        <h1 class="noise-title">The world is <em>noisy</em>.</h1>
        <p class="noise-deck">In real life, signals get crossed — a kind move is read as a slight. Watch what one garbled message does to two ways of playing.</p>
      </header>

      <div class="noise-demo">
        ${LANES.map(lane => `
          <div class="noise-lane" data-lane="${lane.key}">
            <div class="noise-lane-head">
              <span class="noise-lane-title">${lane.title}</span>
              <span class="noise-lane-strat">${lane.strat}</span>
            </div>
            <div class="noise-grid">
              <div class="noise-labels"><span class="nc-num">&nbsp;</span><span class="nl">You</span><span class="nl">Friend</span></div>
              ${lane.a.map((_, i) => `
                <div class="noise-col" data-col="${lane.key}-${i}">
                  <span class="nc-num">${i === GARBLE ? '⚡' : i + 1}</span>
                  <span class="nc-cell ${cellCls(lane.a[i])} ${i === GARBLE ? 'garble' : ''}"></span>
                  <span class="nc-cell ${cellCls(lane.b[i])}"></span>
                </div>`).join('')}
            </div>
            <div class="noise-score"><span class="noise-score-val" data-score="${lane.key}">0</span><span class="noise-score-lbl">points</span></div>
          </div>`).join('')}
      </div>

      <p class="noise-punch" data-punch>A single misread. Two very different endings.</p>

      <div class="noise-actions">
        <button class="wsp-btn wsp-btn-primary" data-action="to-evolution">Now watch them all compete →</button>
      </div>
    </div>
  `;

  el.querySelector('[data-action="to-evolution"]').addEventListener('click', () => go('evolution'));

  const scores = { strict: 0, forgiving: 0 };
  const step = isReduced() ? 0 : 360;

  const revealCol = (li, i) => {
    const lane = LANES[li];
    const col = el.querySelector(`[data-col="${lane.key}-${i}"]`);
    col.classList.add('on');
    scores[lane.key] += payFor(lane.a[i], lane.b[i]);
    el.querySelector(`[data-score="${lane.key}"]`).textContent = scores[lane.key];
    if (i === GARBLE) { audio.play('betrayed'); flash('rgba(210,75,75,0.2)'); }
    else audio.play('coin');
  };

  if (isReduced()) {
    LANES.forEach((lane, li) => lane.a.forEach((_, i) => revealCol(li, i)));
    finish(el);
  } else {
    let t = 200;
    for (let i = 0; i < rounds; i++) {
      LANES.forEach((_, li) => setTimeout(() => revealCol(li, i), t));
      t += step;
    }
    setTimeout(() => finish(el), t + 200);
  }
}

function finish(el) {
  const strict = laneScore(LANES[0]);
  const forgiving = laneScore(LANES[1]);
  const punch = el.querySelector('[data-punch]');
  punch.innerHTML = `One garbled message and the strict mirrors never recovered — they punished each other for the rest of the game (${strict} pts). The forgiving pair let it go, kept cooperating, and scored more (<b>${forgiving} pts</b>). <em>Reciprocate — but leave room for mistakes.</em>`;
  punch.classList.add('resolved');
  el.querySelector('.noise-actions').classList.add('shown');
  audio.play('reveal');
}

function cellCls(move) { return move === 'C' ? 'share' : 'take'; }
