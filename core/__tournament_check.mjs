// Replicate the trust evolution view's tournament loop to verify rankings.
// Same params as evolution-view.js: 9 strategies, 50 rounds, masterSeed=1.

import { REGISTRY } from './registry.js';
import { compileStrategy } from './strategy.js';
import { runMatch } from './match.js';

const ORDER = ['allC', 'allD', 'tft', 'grim', 'tf2t', 'pavlov', 'gtft', 'stft', 'rand'];
const compiled = ORDER.map(id => compileStrategy(REGISTRY[id]));

const scores = Object.fromEntries(ORDER.map(id => [id, 0]));

for (let i = 0; i < compiled.length; i++) {
  for (let j = i + 1; j < compiled.length; j++) {
    const r = runMatch(compiled[i], compiled[j], { rounds: 50, masterSeed: 1 });
    scores[ORDER[i]] += r.finalScoreA;
    scores[ORDER[j]] += r.finalScoreB;
  }
}

const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
console.log('Tournament ranking (50 rounds, seed=1, deterministic):');
ranked.forEach(([id, s], i) => {
  console.log(`  ${i + 1}. ${REGISTRY[id].name.padEnd(24)}  ${s}`);
});
