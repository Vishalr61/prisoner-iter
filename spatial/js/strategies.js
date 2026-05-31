// Spatial sim's display wrapper over core/registry.
// Behavior comes from core (rules); display metadata (colors, shorts, descs)
// is spatial-specific and kept here so the sim keeps its visual identity.
//
// The grid stores strategy indices in a Uint8Array, so we keep a positional
// array. The ORDER below is the canonical index assignment — changing it
// breaks any saved grid. SI exports name→index for code that refers to
// specific strategies (scenarios, paintbrush, etc).

import { REGISTRY }        from '../../core/registry.js';
import { compileStrategy } from '../../core/strategy.js';

const DISPLAY = {
  allC:   { short: 'AllC', color: '#4CAF82', desc: 'Always cooperates. Naive but maximises mutual benefit — until exploited.' },
  allD:   { short: 'AllD', color: '#B83535', desc: 'Always defects. Merciless against cooperators, mediocre against everyone else.' },
  tft:    { short: 'TfT',  color: '#3D6FB5', desc: "Axelrod's tournament champion: cooperate first, then mirror the opponent's last move." },
  tf2t:   { short: 'Tf2T', color: '#7B4FA8', desc: 'Only retaliates after two consecutive defections — more forgiving than TfT.' },
  grim:   { short: 'Grim', color: '#C49010', desc: 'Cooperates until the first betrayal, then defects forever. Zero forgiveness.' },
  pavlov: { short: 'Pvlv', color: '#C05528', desc: 'Win-Stay, Lose-Shift: repeats what worked, switches after punishment.' },
  rand:   { short: 'Rand', color: '#5A8095', desc: 'Flips a coin every round. Unpredictable — resists exploitation but never cooperates fully.' },
  gtft:   { short: 'GTfT', color: '#2D9060', desc: 'Like TfT but randomly forgives defections ~10% of the time, escaping retaliation spirals.' },
  stft:   { short: 'STfT', color: '#9A9518', desc: 'Like TfT but defects on the very first move. Distrustful by default.' },
};

// Canonical positional order. The grid's Uint8Array values are indices into this.
const ORDER = ['allC', 'allD', 'tft', 'tf2t', 'grim', 'pavlov', 'rand', 'gtft', 'stft'];

export const STRATEGIES = ORDER.map(id => ({
  id,
  name:  REGISTRY[id].name,
  short: DISPLAY[id].short,
  color: DISPLAY[id].color,
  desc:  DISPLAY[id].desc,
}));

// Pre-compiled strategies for the world engine. world.js looks up by index.
export const COMPILED = ORDER.map(id => compileStrategy(REGISTRY[id]));

// Index lookup for code that refers to specific strategies (scenarios, etc.)
export const SI = Object.fromEntries(ORDER.map((id, i) => [id, i]));
