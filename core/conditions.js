// Condition evaluation.
//
// A condition is either:
//   - a string: 'always', 'first-round', 'opponent-last-was D', 'probability 0.1'
//   - a composite object: { and: [...] } | { or: [...] } | { not: cond }
//
// Evaluation context: { myMoves, theirMoves, round, totalRounds, rng }

const ATOMIC = {
  'always':      () => true,
  'first-round': (_, ctx) => ctx.round === 0,
  'last-round':  (_, ctx) => ctx.round === ctx.totalRounds - 1,

  'round-equals':         ([n], ctx) => ctx.round === +n,
  'round-less-than':      ([n], ctx) => ctx.round < +n,
  'round-greater-than':   ([n], ctx) => ctx.round > +n,

  'opponent-last-was': ([m], ctx) => {
    const t = ctx.theirMoves;
    return t.length > 0 && t[t.length - 1] === m;
  },

  'opponent-defected-in-last':   ([n], ctx) => ctx.theirMoves.slice(-(+n)).includes('D'),
  'opponent-cooperated-in-last': ([n], ctx) => ctx.theirMoves.slice(-(+n)).includes('C'),

  // Format: 'opponent-defected-count-in-last N at-least K' → args = [N, 'at-least', K]
  'opponent-defected-count-in-last': (args, ctx) => {
    const n = +args[0];
    const k = +args[args.length - 1];
    const count = ctx.theirMoves.slice(-n).filter(m => m === 'D').length;
    return count >= k;
  },

  'opponent-defection-rate-above': ([p], ctx) => {
    if (ctx.theirMoves.length === 0) return false;
    return defectionRate(ctx.theirMoves) > +p;
  },
  'opponent-defection-rate-below': ([p], ctx) => {
    if (ctx.theirMoves.length === 0) return false;
    return defectionRate(ctx.theirMoves) < +p;
  },

  'opponent-ever-defected':     (_, ctx) => ctx.theirMoves.includes('D'),
  'opponent-ever-cooperated':   (_, ctx) => ctx.theirMoves.includes('C'),
  'opponent-always-defected':   (_, ctx) => ctx.theirMoves.length > 0 && ctx.theirMoves.every(m => m === 'D'),
  'opponent-always-cooperated': (_, ctx) => ctx.theirMoves.length > 0 && ctx.theirMoves.every(m => m === 'C'),

  'i-last-played': ([m], ctx) => {
    const my = ctx.myMoves;
    return my.length > 0 && my[my.length - 1] === m;
  },

  'last-round-was': ([pair], ctx) => lastPair(ctx) === pair,
  'last-round-payoff-was-good': (_, ctx) => {
    const p = lastPair(ctx);
    return p === 'CC' || p === 'DC';
  },
  'last-round-payoff-was-bad': (_, ctx) => {
    const p = lastPair(ctx);
    return p === 'CD' || p === 'DD';
  },

  'probability': ([p], ctx) => ctx.rng.float() < +p,
};

function defectionRate(moves) {
  return moves.filter(m => m === 'D').length / moves.length;
}

function lastPair(ctx) {
  if (ctx.myMoves.length === 0) return null;
  return ctx.myMoves[ctx.myMoves.length - 1] + ctx.theirMoves[ctx.theirMoves.length - 1];
}

// Parse a condition once (at compile time) into a fast-path evaluator.
// The returned function takes only ctx and returns boolean.
export function parseCondition(cond) {
  if (cond && typeof cond === 'object') {
    if (cond.and) {
      const ps = cond.and.map(parseCondition);
      return ctx => ps.every(p => p(ctx));
    }
    if (cond.or) {
      const ps = cond.or.map(parseCondition);
      return ctx => ps.some(p => p(ctx));
    }
    if ('not' in cond) {
      const p = parseCondition(cond.not);
      return ctx => !p(ctx);
    }
    throw new Error(`Unknown composite condition: ${JSON.stringify(cond)}`);
  }
  const tokens = String(cond).trim().split(/\s+/);
  const name = tokens[0];
  const fn = ATOMIC[name];
  if (!fn) throw new Error(`Unknown condition: ${cond}`);
  const args = tokens.slice(1);
  return ctx => fn(args, ctx);
}

// Kept for any caller that doesn't want to pre-parse (tests, ad-hoc tools).
export function evaluateCondition(cond, ctx) {
  return parseCondition(cond)(ctx);
}
