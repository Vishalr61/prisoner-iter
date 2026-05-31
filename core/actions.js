// Action execution. Returns 'C' or 'D'.
// Context: { myMoves, theirMoves, round, totalRounds, rng }

const ATOMIC = {
  'cooperate': () => 'C',
  'defect':    () => 'D',

  'repeat-last-move': (_, ctx) => {
    const my = ctx.myMoves;
    return my.length === 0 ? 'C' : my[my.length - 1];
  },
  'mirror-opponent': (_, ctx) => {
    const t = ctx.theirMoves;
    return t.length === 0 ? 'C' : t[t.length - 1];
  },
  'flip-last-move': (_, ctx) => {
    const my = ctx.myMoves;
    if (my.length === 0) return 'C';
    return my[my.length - 1] === 'C' ? 'D' : 'C';
  },

  'random': (_, ctx) => (ctx.rng.float() < 0.5 ? 'C' : 'D'),
  'random-weighted': ([p], ctx) => (ctx.rng.float() < +p ? 'C' : 'D'),
};

// Pre-parse an action once at compile time → fast evaluator.
export function parseAction(action) {
  const tokens = String(action).trim().split(/\s+/);
  const name = tokens[0];
  const fn = ATOMIC[name];
  if (!fn) throw new Error(`Unknown action: ${action}`);
  const args = tokens.slice(1);
  return ctx => {
    const move = fn(args, ctx);
    if (move !== 'C' && move !== 'D') {
      throw new Error(`Action ${action} returned invalid move: ${move}`);
    }
    return move;
  };
}

export function executeAction(action, ctx) {
  return parseAction(action)(ctx);
}
