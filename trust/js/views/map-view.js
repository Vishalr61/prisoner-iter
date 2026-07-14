// Campaign map — the journey you traverse.
//
// A vertical path of the six people. Each node is one of:
//   • locked   — not yet met: a muted "?" disc (keeps the mystery)
//   • next     — your next game: a pulsing, tappable portrait with their name
//   • done     — already played: their face frozen in its final emotion, with
//                your result. (The strategy reveal is saved for the reveal
//                screen, so a done node shows the *person*, not the rule.)
//
// Shown between characters (summary → map → next intro card) and as the
// opening beat after the dilemma.

import { CHARACTERS } from '../characters.js';
import { createFace } from '../face.js';
import { getSavedProgress } from '../progress.js';
import { compileStrategy } from '../../../core/strategy.js';
import { getStrategy } from '../../../core/registry.js';
import { makeStrategyRng } from '../../../core/rng.js';
import * as audio from '../audio.js';

const PAY = { R: 3, T: 5, P: 1, S: 0 };

let go = null;
let el = null;

export function initMapView(navigateFn) {
  go = navigateFn;
  el = document.getElementById('view-map');
}

export function showMap(params = {}) {
  el = document.getElementById('view-map');
  const saved = getSavedProgress();
  const completed = new Set(saved?.campaign?.completedCharacters ?? []);
  const history = saved?.campaign?.playerHistory ?? {};

  // Finale: the journey map reshapes into an all-vs-all relationship web.
  if (params.finale || completed.size >= CHARACTERS.length) {
    renderWeb();
    audio.play('whoosh');
    return;
  }

  let current = CHARACTERS.findIndex(c => !completed.has(c.id));
  if (typeof params.next === 'number') current = params.next;
  const allDone = current === -1 || completed.size >= CHARACTERS.length;

  const doneCount = completed.size;
  const title = allDone ? 'You&rsquo;ve met everyone.'
    : doneCount === 0 ? 'Six people to meet.'
    : 'Your journey so far.';

  el.innerHTML = `
    <div class="map">
      <div class="map-head">
        <div class="map-kicker"><span class="dot"></span>The campaign</div>
        <h1 class="map-title">${title}</h1>
        <p class="map-progress">${doneCount} of ${CHARACTERS.length} played</p>
      </div>
      <div class="map-list">
        ${CHARACTERS.map((c, i) => nodeHTML(c, i, { completed, current, history })).join('')}
      </div>
      ${allDone ? `<button class="map-cta wsp-btn wsp-btn-primary" data-action="finish">See what they were &rarr;</button>` : ''}
    </div>
  `;

  // Mount faces for done + next nodes.
  CHARACTERS.forEach((c, i) => {
    const slot = el.querySelector(`[data-face="${i}"]`);
    if (!slot) return;
    const isDone = completed.has(c.id);
    const emotion = isDone ? doneEmotion(c, history[c.id]) : 'neutral';
    const face = createFace(c.color, { size: isDone ? 52 : 60, emotion });
    slot.appendChild(face.el);
    if (i === current && !allDone) face.startIdle();
  });

  // Wire the next node + finish CTA.
  const nextNode = el.querySelector('.map-node.next');
  if (nextNode) nextNode.addEventListener('click', () => {
    audio.play('choose');
    go('intro-card', { characterIndex: current });
  });
  el.querySelector('[data-action="finish"]')?.addEventListener('click', () => go('campaign-end'));

  // NOTE: navigate() already activated #view-map before calling showMap, so we
  // must NOT call go('map') here — that would re-enter navigate → showMap and
  // recurse forever.
  audio.play('whoosh');

  // Stagger nodes in.
  el.querySelectorAll('.map-node').forEach((n, i) => setTimeout(() => n.classList.add('shown'), 120 + i * 110));
  const cta = el.querySelector('.map-cta');
  if (cta) setTimeout(() => cta.classList.add('shown'), 120 + CHARACTERS.length * 110);
}

// ── Relationship web (idea #15) ────────────────────────────────────────────
const EDGE_COLOR = { coop: 'var(--share)', exploit: 'var(--sam)', defect: 'var(--take)' };

function renderWeb() {
  const N = CHARACTERS.length;
  const nodes = CHARACTERS.map((c, i) => {
    const a = (-90 + i * (360 / N)) * Math.PI / 180;
    return { c, i, x: 50 + 40 * Math.cos(a), y: 50 + 40 * Math.sin(a) };
  });

  const edges = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const rel = pairRelation(CHARACTERS[i].strategyId, CHARACTERS[j].strategyId);
      edges.push(`<line x1="${nodes[i].x}" y1="${nodes[i].y}" x2="${nodes[j].x}" y2="${nodes[j].y}"
        stroke="${EDGE_COLOR[rel]}" stroke-width="${rel === 'coop' ? 2.4 : 1.6}" stroke-linecap="round"
        vector-effect="non-scaling-stroke" opacity="${rel === 'defect' ? 0.35 : 0.6}" />`);
    }
  }

  el.innerHTML = `
    <div class="map web">
      <div class="map-head">
        <div class="map-kicker"><span class="dot"></span>The whole cast</div>
        <h1 class="map-title">How they'd treat <em>each other</em>.</h1>
        <p class="map-progress">Every pair, at once</p>
      </div>
      <div class="web-stage">
        <svg class="web-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${edges.join('')}</svg>
        ${nodes.map(n => `
          <div class="web-node" style="left:${n.x}%; top:${n.y}%">
            <div class="web-node-face" data-web-face="${n.i}"></div>
            <span class="web-node-name" style="color:${n.c.color}">${n.c.name}</span>
          </div>`).join('')}
      </div>
      <div class="web-legend">
        <span class="web-key"><span class="web-dot" style="background:var(--share)"></span>cooperate</span>
        <span class="web-key"><span class="web-dot" style="background:var(--sam)"></span>one exploits</span>
        <span class="web-key"><span class="web-dot" style="background:var(--take)"></span>mutual ruin</span>
      </div>
      <p class="web-line">Cooperation clusters together. Defection isolates itself. That shape is what decides the tournament.</p>
      <button class="map-cta wsp-btn wsp-btn-primary" data-action="finish">How it ends &rarr;</button>
    </div>
  `;

  nodes.forEach(n => {
    const slot = el.querySelector(`[data-web-face="${n.i}"]`);
    if (slot) slot.appendChild(createFace(n.c.color, { size: 46 }).el);
  });
  el.querySelector('[data-action="finish"]').addEventListener('click', () => go('campaign-end'));

  el.querySelectorAll('.web-node, .web-legend, .web-line, .map-cta').forEach((n, i) =>
    setTimeout(() => n.classList.add('shown'), 200 + i * 90));
  setTimeout(() => el.querySelector('.web-svg')?.classList.add('shown'), 400);
}

// Run two campaign strategies against each other and classify the relationship.
function pairRelation(idA, idB) {
  const A = compileStrategy(getStrategy(idA));
  const B = compileStrategy(getStrategy(idB));
  const rngA = makeStrategyRng(1, idA), rngB = makeStrategyRng(1, idB);
  const aM = [], bM = [];
  for (let i = 0; i < 20; i++) {
    const a = A.move({ myMoves: aM, theirMoves: bM, round: i, totalRounds: 20, rng: rngA });
    const b = B.move({ myMoves: bM, theirMoves: aM, round: i, totalRounds: 20, rng: rngB });
    aM.push(a); bM.push(b);
  }
  const rA = aM.filter(m => m === 'C').length / aM.length;
  const rB = bM.filter(m => m === 'C').length / bM.length;
  if (rA > 0.6 && rB > 0.6) return 'coop';
  if (rA < 0.4 && rB < 0.4) return 'defect';
  return 'exploit';
}

function nodeHTML(char, i, { completed, current, history }) {
  const isDone = completed.has(char.id);
  const isNext = i === current && !isDone;
  const state  = isDone ? 'done' : isNext ? 'next' : 'locked';
  const Tag = isNext ? 'button' : 'div';

  let name = '?';
  let sub  = 'Not yet met';
  if (isDone) { name = char.name; sub = resultLabel(char, history[char.id]); }
  else if (isNext) { name = char.name; sub = 'Your next game &rarr;'; }

  const faceOrLock = (isDone || isNext)
    ? `<span class="map-node-face" data-face="${i}"></span>`
    : `<span class="map-node-lock">?</span>`;

  return `
    <${Tag} class="map-node ${state}" style="--char-color:${char.color}" data-index="${i}"${isNext ? ' aria-label="Play your next game"' : ''}>
      ${faceOrLock}
      <span class="map-node-info">
        <span class="map-node-name">${name}</span>
        <span class="map-node-sub">${sub}</span>
      </span>
      ${isDone ? '<span class="map-node-check">&#10003;</span>' : ''}
    </${Tag}>`;
}

function resultLabel(char, ph) {
  if (!ph) return 'Played';
  const { my, their } = scoreMoves(ph.myMoves, ph.theirMoves);
  const d = my - their;
  if (d === 0) return `Even · ${my}–${their}`;
  if (d > 0)   return `You led · +${d}`;
  return `${char.name} led · +${-d}`;
}

function doneEmotion(char, ph) {
  if (!ph) return 'neutral';
  if (char.strategyId === 'grim' && ph.myMoves.some(m => m === 'D')) return 'cold';
  const coop = ph.myMoves.filter(m => m === 'C').length / ph.myMoves.length;
  if (coop >= 0.66) return 'warm';
  if (coop < 0.34) return 'wary';
  return 'neutral';
}

function scoreMoves(my, their) {
  let a = 0, b = 0;
  for (let i = 0; i < my.length; i++) {
    const h = my[i], t = their[i];
    if      (h === 'C' && t === 'C') { a += PAY.R; b += PAY.R; }
    else if (h === 'C' && t === 'D') { a += PAY.S; b += PAY.T; }
    else if (h === 'D' && t === 'C') { a += PAY.T; b += PAY.S; }
    else                             { a += PAY.P; b += PAY.P; }
  }
  return { my: a, their: b };
}
