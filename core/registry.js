// The canonical cast, expressed in the condition-action grammar.
//
// Every other module that needs a built-in strategy reads from here.
// Importing the registry guarantees consistent IDs, colors, and behavior
// across the campaign, tournament, evolution, and spatial views.

export const REGISTRY = {
  allC: {
    id: 'allC',
    name: 'Always Cooperate',
    color: '#f0c674',
    source: 'builtin',
    description: 'Cooperates every round, no matter what.',
    rules: [{ if: 'always', then: 'cooperate' }],
    version: 1,
  },

  allD: {
    id: 'allD',
    name: 'Always Defect',
    color: '#a23b3b',
    source: 'builtin',
    description: 'Defects every round, no matter what.',
    rules: [{ if: 'always', then: 'defect' }],
    version: 1,
  },

  tft: {
    id: 'tft',
    name: 'Tit-for-Tat',
    color: '#5e8ca8',
    source: 'builtin',
    description: 'Cooperates first, then mirrors the opponent.',
    rules: [
      { if: 'first-round', then: 'cooperate' },
      { if: 'always',      then: 'mirror-opponent' },
    ],
    version: 1,
  },

  grim: {
    id: 'grim',
    name: 'Grim Trigger',
    color: '#c87635',
    source: 'builtin',
    description: 'Cooperates until the opponent defects once, then defects forever.',
    rules: [
      { if: 'opponent-ever-defected', then: 'defect' },
      { if: 'always',                 then: 'cooperate' },
    ],
    version: 1,
  },

  tf2t: {
    id: 'tf2t',
    name: 'Tit-for-Two-Tats',
    color: '#a085bd',
    source: 'builtin',
    description: 'Defects only after two opponent defections in a row.',
    rules: [
      { if: 'opponent-defected-count-in-last 2 at-least 2', then: 'defect' },
      { if: 'always',                                       then: 'cooperate' },
    ],
    version: 1,
  },

  pavlov: {
    id: 'pavlov',
    name: 'Win-Stay, Lose-Shift',
    color: '#4c9c6a',
    source: 'builtin',
    description: 'Repeats last move when it scored well; flips when it scored poorly.',
    rules: [
      { if: 'first-round',                then: 'cooperate' },
      { if: 'last-round-payoff-was-good', then: 'repeat-last-move' },
      { if: 'always',                     then: 'flip-last-move' },
    ],
    version: 1,
  },

  gtft: {
    id: 'gtft',
    name: 'Generous Tit-for-Tat',
    color: '#2dd4bf',
    source: 'builtin',
    description: 'Mirrors, but forgives ~10% of defections.',
    rules: [
      { if: 'first-round',         then: 'cooperate' },
      { if: 'opponent-last-was D', then: 'random-weighted 0.1' },
      { if: 'always',              then: 'cooperate' },
    ],
    version: 1,
  },

  stft: {
    id: 'stft',
    name: 'Suspicious Tit-for-Tat',
    color: '#f43f5e',
    source: 'builtin',
    description: 'Opens with defection, then mirrors.',
    rules: [
      { if: 'first-round', then: 'defect' },
      { if: 'always',      then: 'mirror-opponent' },
    ],
    version: 1,
  },

  rand: {
    id: 'rand',
    name: 'Random',
    color: '#94a3b8',
    source: 'builtin',
    description: 'Coin flip every round.',
    rules: [{ if: 'always', then: 'random' }],
    version: 1,
  },
};

export const REGISTRY_LIST = Object.values(REGISTRY);

// The canonical master seed for the trust app's evolution tournament.
// LOAD-BEARING: the INSIGHTS copy in trust/js/views/evolution-view.js was
// written against the specific ranking this seed produces. Don't change
// this without re-running core/__seed_sweep.mjs and re-verifying every
// insight line. The assert at the top of evolution-view.js will trip if
// someone changes this value, so the dependency can't drift silently.
export const CANONICAL_TOURNAMENT_SEED = 1;

export function getStrategy(id) {
  const s = REGISTRY[id];
  if (!s) throw new Error(`Unknown strategy id: ${id}`);
  return s;
}
