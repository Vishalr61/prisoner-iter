// Root tournament's display wrapper over core/registry.
// Behavior comes from core (rules); colors, short names, and descriptions
// are root-specific design choices, kept here so root keeps its visual identity.
// runTournament looks up the core spec by id — no .move on the display object.

import { REGISTRY } from '../../core/registry.js';

const DISPLAY = {
  allC:   { short: 'AllC', color: '#4ade80', desc: 'Always cooperates. Naive but maximises mutual benefit — until exploited.' },
  allD:   { short: 'AllD', color: '#f87171', desc: 'Always defects. Merciless against cooperators, mediocre against everyone else.' },
  tft:    { short: 'TfT',  color: '#60a5fa', desc: "Axelrod's tournament champion: cooperate first, then mirror the opponent's last move." },
  tf2t:   { short: 'Tf2T', color: '#a78bfa', desc: 'Only retaliates after two consecutive defections — more forgiving than TfT.' },
  grim:   { short: 'Grim', color: '#fb923c', desc: 'Cooperates until the first betrayal, then defects forever. Zero forgiveness.' },
  pavlov: { short: 'Pvlv', color: '#e879f9', desc: 'Win-Stay, Lose-Shift: repeats what worked, switches after punishment.' },
  rand:   { short: 'Rand', color: '#94a3b8', desc: 'Flips a coin every round. Unpredictable — resists exploitation but never cooperates fully.' },
  gtft:   { short: 'GTfT', color: '#34d399', desc: 'Like TfT but randomly forgives defections ~10% of the time, escaping retaliation spirals.' },
  stft:   { short: 'STfT', color: '#fbbf24', desc: 'Like TfT but defects on the very first move. Distrustful by default.' },
};

const ORDER = ['allC', 'allD', 'tft', 'tf2t', 'grim', 'pavlov', 'rand', 'gtft', 'stft'];

export const STRATEGIES = ORDER.map(id => ({
  id,
  name:  REGISTRY[id].name,
  short: DISPLAY[id].short,
  color: DISPLAY[id].color,
  desc:  DISPLAY[id].desc,
}));
