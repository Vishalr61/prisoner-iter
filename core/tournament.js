// Round-robin tournament runner. Pure logic — no DOM, no animation.
// Phase 3 lab + Phase 4 evolution + (eventually) the trust evolution
// view all consume this.
//
// Input:  an array of Strategy specs (anything compileStrategy accepts)
//         plus an environment ({ rounds, noise, payoffs, masterSeed }).
// Output: total score per strategy + sorted ranking + the underlying
//         pairwise matrix in case the caller wants it.

import { compileStrategy }    from './strategy.js';
import { runMatch, DEFAULT_PAYOFFS } from './match.js';

export function runRoundRobin(specs, environment = {}) {
  const env = {
    rounds:     environment.rounds     ?? 50,
    noise:      environment.noise      ?? 0,
    payoffs:    environment.payoffs    ?? DEFAULT_PAYOFFS,
    masterSeed: environment.masterSeed ?? 1,
  };

  const compiled = specs.map(s => ({ spec: s, strat: compileStrategy(s) }));
  const totals   = Object.fromEntries(compiled.map(c => [c.spec.id, 0]));
  const matrix   = {};   // matrix[idA][idB] = scoreA in that match

  for (let i = 0; i < compiled.length; i++) {
    matrix[compiled[i].spec.id] = {};
  }

  for (let i = 0; i < compiled.length; i++) {
    for (let j = i + 1; j < compiled.length; j++) {
      const a = compiled[i], b = compiled[j];
      const r = runMatch(a.strat, b.strat, env);
      totals[a.spec.id] += r.finalScoreA;
      totals[b.spec.id] += r.finalScoreB;
      matrix[a.spec.id][b.spec.id] = r.finalScoreA;
      matrix[b.spec.id][a.spec.id] = r.finalScoreB;
    }
  }

  const ranked = Object.entries(totals)
    .map(([id, score]) => ({ id, score, spec: compiled.find(c => c.spec.id === id).spec }))
    .sort((a, b) => b.score - a.score);

  return { ranked, totals, matrix, env, n: specs.length };
}
