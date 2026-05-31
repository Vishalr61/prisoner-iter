// Cross-character single-stream classifier.
//
// Given the player's full move history across all campaign characters,
// returns the canonical strategy whose move predictions best match what
// the player actually did. Single output (one mirror line), but the
// metric is context-aware: for each player move we ask "what would this
// strategy have played, given the histories at that point?" and count
// matches across all 32 moves.
//
// Threshold logic:
//   - Top score must be ≥ 0.6 (absolute — player must genuinely match,
//     not just slightly less badly than alternatives). Otherwise fallback.
//   - Among strategies within TIE_EPSILON of the top, the TIEBREAKER
//     priority decides. This handles the natural ambiguity in this
//     campaign: TfT and Grim are indistinguishable for a player who
//     only retaliates against Marcus (no character escalates beyond
//     a single defection trigger), so we default to Maya — more
//     narratively central, historically dominant reciprocator.
//
// Limitations of the data, named honestly:
// The campaign is only ~32 moves and only Marcus tests "will you defect
// back?" That's a thin differentiation surface. The cooperative cluster
// (AllC, TfT, Tf2T, Grim, Pavlov) typically scores within ~3 percentage
// points of each other for any cooperative-ish player. The TIE_EPSILON
// reflects this: anything within ~1 move of the top is functionally
// tied, and we use priority to break.

import { REGISTRY }        from './registry.js';
import { compileStrategy } from './strategy.js';

const CAMPAIGN_STRATEGIES = ['allC', 'allD', 'tft', 'grim', 'tf2t', 'pavlov'];

const ABSOLUTE_THRESHOLD = 0.60;
const TIE_EPSILON        = 0.001;  // tiebreaker only fires on essentially-exact ties

// Tiebreaker priority. Prefer reciprocators over extremes. TfT (Maya) wins
// ties with Grim (Theo) — same prediction in the campaign, but Maya is
// the better default mirror.
const TIEBREAKER_PRIORITY = ['tft', 'tf2t', 'pavlov', 'grim', 'allC', 'allD'];

const _stubRng = { float: () => 0.5 };  // campaign strategies are deterministic

export function classify(playerHistory) {
  if (!playerHistory || Object.keys(playerHistory).length === 0) return empty();

  const compiled = Object.fromEntries(
    CAMPAIGN_STRATEGIES.map(id => [id, compileStrategy(REGISTRY[id])])
  );

  const matches = Object.fromEntries(CAMPAIGN_STRATEGIES.map(id => [id, 0]));
  let totalMoves = 0;

  for (const charId of Object.keys(playerHistory)) {
    const { myMoves, theirMoves } = playerHistory[charId];
    if (!myMoves || !theirMoves) continue;
    const n = myMoves.length;

    for (let r = 0; r < n; r++) {
      const ctx = {
        myMoves:     myMoves.slice(0, r),
        theirMoves:  theirMoves.slice(0, r),
        round:       r,
        totalRounds: n,
        rng:         _stubRng,
      };
      const actual = myMoves[r];
      for (const id of CAMPAIGN_STRATEGIES) {
        if (compiled[id].move(ctx) === actual) matches[id]++;
      }
      totalMoves++;
    }
  }

  if (totalMoves === 0) return empty();

  const allScores = Object.fromEntries(
    CAMPAIGN_STRATEGIES.map(id => [id, matches[id] / totalMoves])
  );

  const ranked = Object.entries(allScores).sort((a, b) => b[1] - a[1]);
  const topScore = ranked[0][1];

  if (topScore < ABSOLUTE_THRESHOLD) {
    return {
      character: null,
      confidence: topScore,
      runnerUp: ranked[1]?.[0] ?? null,
      runnerUpConfidence: ranked[1]?.[1] ?? 0,
      allScores,
      totalMoves,
    };
  }

  // Apply tiebreaker among all strategies within TIE_EPSILON of top.
  const tied = ranked.filter(([, s]) => topScore - s <= TIE_EPSILON).map(([id]) => id);
  const winner = TIEBREAKER_PRIORITY.find(id => tied.includes(id)) ?? ranked[0][0];
  const runnerUp = ranked.find(([id]) => id !== winner) ?? [null, 0];

  return {
    character: winner,
    confidence: allScores[winner],
    runnerUp: runnerUp[0],
    runnerUpConfidence: runnerUp[1],
    allScores,
    totalMoves,
  };
}

function empty() {
  return {
    character: null, confidence: 0,
    runnerUp: null, runnerUpConfidence: 0,
    allScores: {}, totalMoves: 0,
  };
}
