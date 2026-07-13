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
