// Unified match engine. Single source of truth for two-strategy IPD play.
//
// Inputs:
//   stratA, stratB — compiled strategies (from compileStrategy)
//   environment    — { rounds, noise, payoffs, masterSeed }
//
// Output (MatchResult):
//   {
//     history: [{ aMove, bMove, aScore, bScore, aCumulative, bCumulative }, ...],
//     finalScoreA, finalScoreB, masterSeed,
//   }
//
// Deterministic given environment.masterSeed. Pure. No DOM, no animation.

import { makeStrategyRng, makeRng, deriveSeed } from './rng.js';

export const DEFAULT_PAYOFFS = { R: 3, T: 5, P: 1, S: 0 };

export function runMatch(stratA, stratB, environment = {}) {
  const rounds     = environment.rounds     ?? 50;
  const noise      = environment.noise      ?? 0;
  const payoffs    = environment.payoffs    ?? DEFAULT_PAYOFFS;
  const masterSeed = environment.masterSeed ?? 1;

  // Each strategy gets its own RNG stream so a strategy's personality is
  // consistent across opponents. Environment (noise) gets its own stream so
  // it doesn't drain from strategy RNGs.
  const rngA   = makeStrategyRng(masterSeed, stratA.id);
  const rngB   = makeStrategyRng(masterSeed, stratB.id);
  const rngEnv = makeRng(deriveSeed(masterSeed, '__env__'));

  const aMoves = [];
  const bMoves = [];
  const history = [];
  let aCum = 0, bCum = 0;

  for (let r = 0; r < rounds; r++) {
    const ctxA = { myMoves: aMoves, theirMoves: bMoves, round: r, totalRounds: rounds, rng: rngA };
    const ctxB = { myMoves: bMoves, theirMoves: aMoves, round: r, totalRounds: rounds, rng: rngB };

    let aMove = stratA.move(ctxA);
    let bMove = stratB.move(ctxB);

    // Action noise: chosen move may flip before being played. Each side's
    // noise coin is drawn independently from the env stream.
    if (noise > 0) {
      if (rngEnv.float() < noise) aMove = flip(aMove);
      if (rngEnv.float() < noise) bMove = flip(bMove);
    }

    const [aScore, bScore] = scoreRound(aMove, bMove, payoffs);
    aCum += aScore;
    bCum += bScore;

    aMoves.push(aMove);
    bMoves.push(bMove);
    history.push({ aMove, bMove, aScore, bScore, aCumulative: aCum, bCumulative: bCum });
  }

  return { history, finalScoreA: aCum, finalScoreB: bCum, masterSeed };
}

function flip(m) { return m === 'C' ? 'D' : 'C'; }

function scoreRound(a, b, p) {
  if (a === 'C' && b === 'C') return [p.R, p.R];
  if (a === 'C' && b === 'D') return [p.S, p.T];
  if (a === 'D' && b === 'C') return [p.T, p.S];
  return [p.P, p.P];
}
