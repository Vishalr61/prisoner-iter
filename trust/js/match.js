import { compileStrategy } from '../../core/strategy.js';
import { getStrategy }     from '../../core/registry.js';
import { makeStrategyRng } from '../../core/rng.js';
import { DEFAULT_PAYOFFS } from '../../core/match.js';

const PAYOFFS = DEFAULT_PAYOFFS;

export function createMatch(strategyId, totalRounds = 0) {
  const strategy = compileStrategy(getStrategy(strategyId));
  // Campaign matches are interactive — human picks each round. Use a wall-clock
  // seed so each playthrough has fresh randomness (matters only for probabilistic
  // strategies like GTfT, which the campaign doesn't currently use, but the API
  // is uniform).
  const rng = makeStrategyRng(Date.now() & 0xFFFFFFFF, strategyId);

  const myMoves    = [];   // human's moves
  const theirMoves = [];   // bot's moves
  let myScore    = 0;
  let theirScore = 0;

  function step(humanMove) {
    const ctx = {
      myMoves:     theirMoves,   // bot's own history
      theirMoves:  myMoves,      // bot sees human's history
      round:       myMoves.length,
      totalRounds,
      rng,
    };
    const botMove = strategy.move(ctx);

    let myPay, theirPay;
    if      (humanMove === 'C' && botMove === 'C') { myPay = PAYOFFS.R; theirPay = PAYOFFS.R; }
    else if (humanMove === 'C' && botMove === 'D') { myPay = PAYOFFS.S; theirPay = PAYOFFS.T; }
    else if (humanMove === 'D' && botMove === 'C') { myPay = PAYOFFS.T; theirPay = PAYOFFS.S; }
    else                                            { myPay = PAYOFFS.P; theirPay = PAYOFFS.P; }

    myMoves.push(humanMove);
    theirMoves.push(botMove);
    myScore    += myPay;
    theirScore += theirPay;

    const outcome = outcomeLabel(humanMove, botMove);

    return { humanMove, botMove, myPay, theirPay, myScore, theirScore, outcome, round: myMoves.length };
  }

  function getHistory() {
    return myMoves.map((m, i) => ({
      humanMove: m,
      botMove:   theirMoves[i],
      outcome:   outcomeLabel(m, theirMoves[i]),
    }));
  }

  return { step, getHistory, get myScore() { return myScore; }, get theirScore() { return theirScore; } };
}

function outcomeLabel(human, bot) {
  if (human === 'C' && bot === 'C') return 'mutual-share';
  if (human === 'D' && bot === 'D') return 'mutual-take';
  if (human === 'C' && bot === 'D') return 'exploited';
  return 'exploiter';
}
