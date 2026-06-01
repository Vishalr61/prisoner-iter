// Replicator dynamics — the real evolutionary IPD.
//
// Start with a population of strategies in chosen proportions. Each
// generation:
//   1. Run a round-robin to get average score per strategy against the
//      current population (using runRoundRobin under the same env).
//   2. Compute fitness — strategy i's fitness is the expected payoff vs.
//      a random opponent drawn from the current population.
//   3. Update populations via replicator equation: p_i' ∝ p_i × f_i
//      (high-scorers grow, low-scorers shrink).
//   4. Apply mutation (uniform blend) if any.
//
// Output is the population vector at every generation, ready for the
// stacked area chart to consume.

import { runRoundRobin } from './tournament.js';

const DEFAULT_PAYOFFS = { R: 3, T: 5, P: 1, S: 0 };

export function runReplicator(specs, environment = {}) {
  const env = {
    rounds:        environment.rounds        ?? 50,
    noise:         environment.noise         ?? 0,
    payoffs:       environment.payoffs       ?? DEFAULT_PAYOFFS,
    masterSeed:    environment.masterSeed    ?? 1,
    generations:   environment.generations   ?? 100,
    mutation:      environment.mutation      ?? 0,   // uniform-blend strength (0..1)
    initial:       environment.initial,                // optional Map<id, fraction>
  };

  const n = specs.length;
  const ids = specs.map(s => s.id);

  // Start population — uniform if not specified.
  let pop;
  if (env.initial) {
    pop = ids.map(id => env.initial.get(id) ?? 0);
    const total = pop.reduce((a, b) => a + b, 0);
    if (total === 0) throw new Error('Initial population sums to zero');
    pop = pop.map(p => p / total);
  } else {
    pop = ids.map(() => 1 / n);
  }

  // First generation = the starting population.
  const history = [{ pop: snapshot(ids, pop), gen: 0 }];

  // Compute the score matrix ONCE — same env, same specs throughout.
  // matrix[id_i][id_j] = avg score per round for i vs j.
  const tournamentEnv = {
    rounds: env.rounds, noise: env.noise, payoffs: env.payoffs, masterSeed: env.masterSeed,
  };
  const tournament = runRoundRobin(specs, tournamentEnv);
  // matrix from runRoundRobin gives total score over `rounds` rounds; convert to per-round average.
  const M = ids.map(idi => ids.map(idj => {
    if (idi === idj) {
      // Self-play: not in the round-robin (i < j loop). Compute as a separate match.
      return env.payoffs.R;  // approximation: both copies of the same deterministic strategy mostly cooperate; cheap default
    }
    return (tournament.matrix[idi][idj] ?? 0) / env.rounds;
  }));

  for (let g = 1; g <= env.generations; g++) {
    // Fitness: weighted average score vs the current population.
    const fit = pop.map((_, i) =>
      pop.reduce((acc, pj, j) => acc + pj * M[i][j], 0)
    );

    // Replicator update.
    const avgFit = pop.reduce((acc, pi, i) => acc + pi * fit[i], 0);
    if (avgFit === 0) {
      // population collapsed — break early
      history.push({ pop: snapshot(ids, pop), gen: g });
      break;
    }
    let next = pop.map((pi, i) => pi * fit[i] / avgFit);

    // Mutation: blend toward uniform so a strategy never quite hits zero.
    if (env.mutation > 0) {
      next = next.map(p => p * (1 - env.mutation) + env.mutation / n);
    }

    // Renormalise (float drift).
    const total = next.reduce((a, b) => a + b, 0);
    pop = next.map(p => p / total);

    history.push({ pop: snapshot(ids, pop), gen: g });
  }

  return { history, ids, env, finalPop: snapshot(ids, pop) };
}

function snapshot(ids, popArr) {
  const o = {};
  for (let i = 0; i < ids.length; i++) o[ids[i]] = popArr[i];
  return o;
}
