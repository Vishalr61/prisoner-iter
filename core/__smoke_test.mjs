// Smoke tests for the Phase 0 core. Run: node core/__smoke_test.mjs
// Not shipped — kept in the tree as a quick verification tool during refactors.

import { REGISTRY, getStrategy } from './registry.js';
import { compileStrategy, encodeStrategy, decodeStrategy } from './strategy.js';
import { runMatch } from './match.js';
import { makeStrategyRng } from './rng.js';

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else      { fail++; console.log(`  FAIL ${name}${detail ? '  →  ' + detail : ''}`); }
}

console.log('\n── Cast test (all 9 canonical strategies compile and play) ──');
const all = Object.values(REGISTRY).map(compileStrategy);
t('9 strategies in registry', all.length === 9);
for (const s of all) {
  const env = { rounds: 10, masterSeed: 42 };
  const result = runMatch(s, compileStrategy(REGISTRY.tft), env);
  t(`${s.id} plays 10 rounds vs TfT`, result.history.length === 10 && Number.isFinite(result.finalScoreA));
}

console.log('\n── Cast-specific behavior ──');
{
  const sam = compileStrategy(REGISTRY.allC);
  const marcus = compileStrategy(REGISTRY.allD);
  const r = runMatch(sam, marcus, { rounds: 10, masterSeed: 1 });
  t('Sam vs Marcus: Sam scores 0', r.finalScoreA === 0);
  t('Sam vs Marcus: Marcus scores 50', r.finalScoreB === 50);
  t('All Sam moves are C', r.history.every(h => h.aMove === 'C'));
  t('All Marcus moves are D', r.history.every(h => h.bMove === 'D'));
}
{
  const maya = compileStrategy(REGISTRY.tft);
  const marcus = compileStrategy(REGISTRY.allD);
  const r = runMatch(maya, marcus, { rounds: 5, masterSeed: 1 });
  t('TfT first move is C', r.history[0].aMove === 'C');
  t('TfT subsequent moves all D', r.history.slice(1).every(h => h.aMove === 'D'));
}
{
  const theo = compileStrategy(REGISTRY.grim);
  // Custom opponent: cooperate, defect once, then cooperate
  const opp = compileStrategy({
    id: 'opp-test',
    rules: [
      { if: 'round-equals 1', then: 'defect' },
      { if: 'always',         then: 'cooperate' },
    ],
    version: 1,
  });
  const r = runMatch(theo, opp, { rounds: 5, masterSeed: 1 });
  t('Grim round 0: C', r.history[0].aMove === 'C');
  t('Grim round 1: C (opp defects this round)', r.history[1].aMove === 'C');
  t('Grim rounds 2-4 all D after seeing defection', r.history.slice(2).every(h => h.aMove === 'D'));
}
{
  const naomi = compileStrategy(REGISTRY.tf2t);
  const opp = compileStrategy({
    id: 'opp-test2',
    rules: [
      { if: 'round-equals 0', then: 'defect' },
      { if: 'round-equals 2', then: 'defect' },
      { if: 'round-equals 3', then: 'defect' },
      { if: 'always',         then: 'cooperate' },
    ],
    version: 1,
  });
  const r = runMatch(naomi, opp, { rounds: 6, masterSeed: 1 });
  // Naomi sees a single D (round 0) — should NOT retaliate yet
  t('Tf2T round 1: C (one isolated D seen)', r.history[1].aMove === 'C');
  // Round 4: opp defected in rounds 2 and 3 (two in a row) — Naomi should retaliate
  t('Tf2T round 4: D (two D in a row)', r.history[4].aMove === 'D');
}
{
  const ren = compileStrategy(REGISTRY.pavlov);
  const sam = compileStrategy(REGISTRY.allC);
  const r = runMatch(ren, sam, { rounds: 5, masterSeed: 1 });
  // Pavlov + AllC: every round is CC (good), so Pavlov keeps cooperating
  t('Pavlov vs AllC: stays at C', r.history.every(h => h.aMove === 'C'));
}

console.log('\n── Verification Test 2: encode/decode round-trip ──');
{
  const maya = REGISTRY.tft;
  const encoded = encodeStrategy(maya);
  const decoded = decodeStrategy(encoded);
  t('round-trip preserves id', decoded.id === maya.id);
  t('round-trip preserves rules', JSON.stringify(decoded.rules) === JSON.stringify(maya.rules));

  // Run before/after with same seed → byte-identical
  const cMaya  = compileStrategy(maya);
  const cMaya2 = compileStrategy(decoded);
  const marcus = compileStrategy(REGISTRY.allD);
  const r1 = runMatch(cMaya, marcus, { rounds: 20, masterSeed: 42 });
  const r2 = runMatch(cMaya2, marcus, { rounds: 20, masterSeed: 42 });
  t('encode→decode produces byte-identical match', JSON.stringify(r1) === JSON.stringify(r2));
}

console.log('\n── Verification Test 4: RNG determinism across runs ──');
{
  const gtft = compileStrategy(REGISTRY.gtft);
  const marcus = compileStrategy(REGISTRY.allD);
  const r1 = runMatch(gtft, marcus, { rounds: 50, masterSeed: 42 });
  const r2 = runMatch(gtft, marcus, { rounds: 50, masterSeed: 42 });
  t('GTfT vs Marcus, seed 42, twice → identical', JSON.stringify(r1) === JSON.stringify(r2));

  // Different seed → different (probabilistic strategy)
  const r3 = runMatch(gtft, marcus, { rounds: 50, masterSeed: 43 });
  t('GTfT vs Marcus, seed 43 → different from seed 42', JSON.stringify(r1) !== JSON.stringify(r3));
}

console.log('\n── Verification Test 5: RNG independence across opponents ──');
{
  // GTfT's RNG sequence should be the same regardless of opponent (same master seed).
  // We can verify this by checking that, with a fixed master seed, GTfT's
  // probabilistic decisions (when its forgiveness rule fires) are based on
  // the same underlying RNG stream in both matchups.
  const rngA = makeStrategyRng(42, 'gtft');
  const rngB = makeStrategyRng(42, 'gtft');
  const seqA = Array.from({ length: 10 }, () => rngA.float());
  const seqB = Array.from({ length: 10 }, () => rngB.float());
  t('Same (seed, id) → identical RNG stream', JSON.stringify(seqA) === JSON.stringify(seqB));

  const rngOther = makeStrategyRng(42, 'marcus');
  const seqOther = Array.from({ length: 10 }, () => rngOther.float());
  t('Different id → different stream', JSON.stringify(seqA) !== JSON.stringify(seqOther));
}

console.log('\n── Configs compile to expected rules ──');
{
  // Build TfT via the simplified config
  const fromConfig = compileStrategy({
    id: 'tft-from-config',
    config: { opener: 'C', mode: 'opponent-reactive', reaction: 'mirror' },
    version: 1,
  });
  const fromRules  = compileStrategy(REGISTRY.tft);
  const opp = compileStrategy(REGISTRY.allD);
  const r1 = runMatch(fromConfig, opp, { rounds: 10, masterSeed: 1 });
  const r2 = runMatch(fromRules,  opp, { rounds: 10, masterSeed: 1 });
  // Cannot use full JSON compare because the two strategies have different IDs
  // (so their RNG streams differ). But for deterministic strategies (no randomness),
  // moves and scores should be identical.
  t('TfT-from-config produces same moves as TfT-from-rules',
    JSON.stringify(r1.history.map(h => [h.aMove, h.bMove])) ===
    JSON.stringify(r2.history.map(h => [h.aMove, h.bMove])));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
