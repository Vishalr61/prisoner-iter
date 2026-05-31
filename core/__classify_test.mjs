// Verify the classifier: for each canonical archetype, simulate a player
// who follows that strategy through all 6 campaign matches, then check
// that the classifier identifies them correctly.

import { REGISTRY } from './registry.js';
import { compileStrategy } from './strategy.js';
import { classify } from './classify.js';

// Campaign characters in order, with rounds per character.
const CAMPAIGN = [
  { id: 'sam',    strategyId: 'allC',   rounds: 3 },
  { id: 'marcus', strategyId: 'allD',   rounds: 3 },
  { id: 'maya',   strategyId: 'tft',    rounds: 8 },
  { id: 'theo',   strategyId: 'grim',   rounds: 5 },
  { id: 'naomi',  strategyId: 'tf2t',   rounds: 5 },
  { id: 'ren',    strategyId: 'pavlov', rounds: 8 },
];

const _rng = { float: () => 0.5 };

// Simulate a "player" (using stratId) playing through the campaign.
// Returns playerHistory: { [charId]: { myMoves, theirMoves } }
function simulateCampaign(playerStratId) {
  const playerHistory = {};
  for (const char of CAMPAIGN) {
    const playerStrat = compileStrategy(REGISTRY[playerStratId]);
    const botStrat    = compileStrategy(REGISTRY[char.strategyId]);
    const myMoves = [], theirMoves = [];
    for (let r = 0; r < char.rounds; r++) {
      const ctxP = { myMoves: [...myMoves],    theirMoves: [...theirMoves], round: r, totalRounds: char.rounds, rng: _rng };
      const ctxB = { myMoves: [...theirMoves], theirMoves: [...myMoves],    round: r, totalRounds: char.rounds, rng: _rng };
      myMoves.push(playerStrat.move(ctxP));
      theirMoves.push(botStrat.move(ctxB));
    }
    playerHistory[char.id] = { myMoves, theirMoves };
  }
  return playerHistory;
}

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else      { fail++; console.log(`  FAIL ${name}${detail ? '  →  ' + detail : ''}`); }
}

console.log('── Self-classification ──');
console.log('  Each archetype should classify as itself when played consistently.\n');

// Note: Grim and TfT produce identical move sequences in this campaign —
// no character escalates beyond a single defection trigger, so the data
// can't distinguish them. Grim player classifies as TfT (Maya) by design.
const EXPECTED = { allC: 'allC', allD: 'allD', tft: 'tft', grim: 'tft', tf2t: 'tf2t', pavlov: 'pavlov' };

for (const stratId of ['allC', 'allD', 'tft', 'grim', 'tf2t', 'pavlov']) {
  const history = simulateCampaign(stratId);
  const result = classify(history);
  const expected = EXPECTED[stratId];
  const matched = result.character === expected;
  const note = expected !== stratId ? ` (Grim→TfT is the documented tie default)` : '';
  t(`${stratId} → classified as ${expected}${note}`, matched,
    `got ${result.character} (top conf ${result.confidence.toFixed(3)}, runnerUp ${result.runnerUp} ${result.runnerUpConfidence.toFixed(3)})`);
  if (!matched) {
    console.log(`        all scores: ${JSON.stringify(result.allScores, null, 2)}`);
  }
}

console.log('\n── Edge cases ──');

// Empty history → fallback (null)
{
  const result = classify({});
  t('empty history → null (fallback)', result.character === null);
}

// Mixed/chaotic player → expect fallback when no clear match
{
  // Player plays C, D, C, D... alternating regardless of context
  const history = {};
  for (const char of CAMPAIGN) {
    const myMoves = [];
    const theirMoves = [];
    const botStrat = compileStrategy(REGISTRY[char.strategyId]);
    for (let r = 0; r < char.rounds; r++) {
      const playerMove = r % 2 === 0 ? 'C' : 'D';
      const ctxB = { myMoves: [...theirMoves], theirMoves: [...myMoves], round: r, totalRounds: char.rounds, rng: _rng };
      myMoves.push(playerMove);
      theirMoves.push(botStrat.move(ctxB));
    }
    history[char.id] = { myMoves, theirMoves };
  }
  const result = classify(history);
  console.log(`  alternating C/D → ${result.character ?? 'null (fallback)'} (top conf ${result.confidence.toFixed(3)})`);
  console.log(`        all scores: ${JSON.stringify(result.allScores)}`);
  // Pure alternation has TfT-shape (sometimes mirrors). The classifier
  // calls them Maya at low confidence — that's an honest read.
  t('chaotic alternator → some classification or fallback (not crash)',
    result.character === null || typeof result.character === 'string');
}

// "Mostly cooperative but defected against Marcus" — should be TfT-ish (Maya)
{
  const history = {};
  for (const char of CAMPAIGN) {
    const myMoves = [];
    const theirMoves = [];
    const botStrat = compileStrategy(REGISTRY[char.strategyId]);
    for (let r = 0; r < char.rounds; r++) {
      // TfT-style: cooperate first, then mirror
      const playerMove = r === 0 ? 'C' : theirMoves[theirMoves.length - 1];
      const ctxB = { myMoves: [...theirMoves], theirMoves: [...myMoves], round: r, totalRounds: char.rounds, rng: _rng };
      myMoves.push(playerMove);
      theirMoves.push(botStrat.move(ctxB));
    }
    history[char.id] = { myMoves, theirMoves };
  }
  const result = classify(history);
  console.log(`  TfT-pattern (cooperate-then-mirror) → ${result.character ?? 'null'} (top conf ${result.confidence.toFixed(3)})`);
  t('TfT pattern → classified as tft', result.character === 'tft');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
