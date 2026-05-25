import { STRATEGIES } from './strategies.js';

export const GRID_W = 160;
export const GRID_H = 120;
export const GRID_N = GRID_W * GRID_H;

export const grid   = new Uint8Array(GRID_N);
export const scores = new Float32Array(GRID_N);
const _next          = new Uint8Array(GRID_N);

let _gen = 0;
export const getGeneration = () => _gen;
export const resetGeneration = () => { _gen = 0; };

// Moore neighbourhood offsets
const NB_DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const NB_DY = [-1, -1, -1,  0, 0,  1, 1, 1];

// Pre-allocated match history (avoids GC churn)
const _mA = [];
const _mB = [];

function scoreAvsB(a, b, rounds, pay) {
  _mA.length = 0;
  _mB.length = 0;
  let s = 0;
  const sa = STRATEGIES[a], sb = STRATEGIES[b];
  for (let r = 0; r < rounds; r++) {
    const ma = sa.move(_mA, _mB);
    const mb = sb.move(_mB, _mA);
    if      (ma === 'C' && mb === 'C') s += pay.R;
    else if (ma === 'C' && mb === 'D') s += pay.S;
    else if (ma === 'D' && mb === 'C') s += pay.T;
    else                               s += pay.P;
    _mA.push(ma);
    _mB.push(mb);
  }
  return s;
}

export function initRandom() {
  const n = STRATEGIES.length;
  for (let i = 0; i < GRID_N; i++) grid[i] = Math.floor(Math.random() * n);
  scores.fill(0);
  _gen = 0;
}

export function step(pay, matchRounds) {
  // Phase 1: accumulate score from all 8 neighbours
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const ci = y * GRID_W + x;
      const cs = grid[ci];
      let sc = 0;
      for (let n = 0; n < 8; n++) {
        const nx = (x + NB_DX[n] + GRID_W) % GRID_W;
        const ny = (y + NB_DY[n] + GRID_H) % GRID_H;
        sc += scoreAvsB(cs, grid[ny * GRID_W + nx], matchRounds, pay);
      }
      scores[ci] = sc;
    }
  }

  // Phase 2: adopt strategy of highest-scoring neighbour (or stay)
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const ci = y * GRID_W + x;
      let bestSc = scores[ci];
      let bestSt = grid[ci];
      for (let n = 0; n < 8; n++) {
        const nx = (x + NB_DX[n] + GRID_W) % GRID_W;
        const ny = (y + NB_DY[n] + GRID_H) % GRID_H;
        const ni = ny * GRID_W + nx;
        if (scores[ni] > bestSc) { bestSc = scores[ni]; bestSt = grid[ni]; }
      }
      _next[ci] = bestSt;
    }
  }

  grid.set(_next);
  _gen++;
}

export function paintCircle(cx, cy, stratIdx, radius) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) {
        const x = (cx + dx + GRID_W) % GRID_W;
        const y = (cy + dy + GRID_H) % GRID_H;
        grid[y * GRID_W + x] = stratIdx;
      }
    }
  }
}

export function getNeighbourStrategies(cx, cy) {
  return Array.from({ length: 8 }, (_, n) => {
    const nx = (cx + NB_DX[n] + GRID_W) % GRID_W;
    const ny = (cy + NB_DY[n] + GRID_H) % GRID_H;
    return grid[ny * GRID_W + nx];
  });
}
