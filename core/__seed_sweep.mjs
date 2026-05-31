// Verify campaign tournament ranking is stable across seeds.
// If a copy line depends on an ordinal (4th, 5th), that ordinal must hold
// under reasonable randomness — otherwise the copy is cherry-picked.

import { REGISTRY } from './registry.js';
import { compileStrategy } from './strategy.js';
import { runMatch } from './match.js';

const ORDER = ['allC', 'allD', 'tft', 'grim', 'tf2t', 'pavlov', 'gtft', 'stft', 'rand'];
const SEEDS = [1, 7, 42, 100, 12345, 99991];
const ROUNDS = 50;

function tournament(seed) {
  const compiled = ORDER.map(id => compileStrategy(REGISTRY[id]));
  const scores = Object.fromEntries(ORDER.map(id => [id, 0]));
  for (let i = 0; i < compiled.length; i++) {
    for (let j = i + 1; j < compiled.length; j++) {
      const r = runMatch(compiled[i], compiled[j], { rounds: ROUNDS, masterSeed: seed });
      scores[ORDER[i]] += r.finalScoreA;
      scores[ORDER[j]] += r.finalScoreB;
    }
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1]);
}

const ranks = {};  // ranks[id] = [r1, r2, ...] across seeds
const scoresBySeed = {};

for (const seed of SEEDS) {
  const ranked = tournament(seed);
  scoresBySeed[seed] = ranked;
  ranked.forEach(([id, _], i) => {
    if (!ranks[id]) ranks[id] = [];
    ranks[id].push(i + 1);
  });
}

console.log('Ranks across seeds:', SEEDS.join(', '));
console.log('─'.repeat(78));
for (const id of ORDER) {
  const rs = ranks[id];
  const min = Math.min(...rs), max = Math.max(...rs);
  const stability = min === max ? 'STABLE' : `±${max - min}`;
  console.log(`  ${REGISTRY[id].name.padEnd(24)}  ranks: [${rs.join(', ')}]  ${stability}`);
}

console.log('\nFinal scores per seed:');
for (const seed of SEEDS) {
  const top = scoresBySeed[seed].slice(0, 1)[0];
  const bot = scoresBySeed[seed].slice(-1)[0];
  const spread = top[1] - bot[1];
  console.log(`  seed=${String(seed).padStart(6)}  top: ${top[0].padEnd(7)} (${top[1]})   bottom: ${bot[0].padEnd(7)} (${bot[1]})   spread: ${spread}`);
}

console.log('\nFull rankings per seed:');
for (const seed of SEEDS) {
  console.log(`\n  seed=${seed}:`);
  scoresBySeed[seed].forEach(([id, s], i) =>
    console.log(`    ${i + 1}. ${REGISTRY[id].name.padEnd(24)} ${s}`));
}
