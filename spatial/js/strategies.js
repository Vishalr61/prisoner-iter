export const STRATEGIES = [
  {
    id: 'allC',
    name: 'Always Cooperate',
    short: 'AllC',
    color: '#4ade80',
    desc: 'Always cooperates. Naive but maximises mutual benefit — until exploited.',
    move: (_m, _t) => 'C',
  },
  {
    id: 'allD',
    name: 'Always Defect',
    short: 'AllD',
    color: '#f87171',
    desc: 'Always defects. Merciless against cooperators, mediocre against everyone else.',
    move: (_m, _t) => 'D',
  },
  {
    id: 'tft',
    name: 'Tit for Tat',
    short: 'TfT',
    color: '#60a5fa',
    desc: "Axelrod's tournament champion: cooperate first, then mirror the opponent's last move.",
    move: (_m, t) => t.length === 0 ? 'C' : t[t.length - 1],
  },
  {
    id: 'tf2t',
    name: 'Tit for Two Tats',
    short: 'Tf2T',
    color: '#a78bfa',
    desc: 'Only retaliates after two consecutive defections — more forgiving than TfT.',
    move: (_m, t) =>
      (t.length >= 2 && t[t.length - 1] === 'D' && t[t.length - 2] === 'D') ? 'D' : 'C',
  },
  {
    id: 'grim',
    name: 'Grim Trigger',
    short: 'Grim',
    color: '#fb923c',
    desc: 'Cooperates until the first betrayal, then defects forever. Zero forgiveness.',
    move: (_m, t) => t.includes('D') ? 'D' : 'C',
  },
  {
    id: 'pavlov',
    name: 'Pavlov',
    short: 'Pvlv',
    color: '#e879f9',
    desc: 'Win-Stay, Lose-Shift: repeats what worked, switches after punishment.',
    move: (m, t) => {
      if (m.length === 0) return 'C';
      const lm = m[m.length - 1], lt = t[t.length - 1];
      const won = (lm === 'C' && lt === 'C') || (lm === 'D' && lt === 'C');
      return won ? lm : (lm === 'C' ? 'D' : 'C');
    },
  },
  {
    id: 'rand',
    name: 'Random',
    short: 'Rand',
    color: '#94a3b8',
    desc: 'Flips a coin every round. Unpredictable — resists exploitation but never cooperates fully.',
    move: () => Math.random() < 0.5 ? 'C' : 'D',
  },
  {
    id: 'gtft',
    name: 'Generous TfT',
    short: 'GTfT',
    color: '#34d399',
    desc: 'Like TfT but randomly forgives defections ~10% of the time, escaping retaliation spirals.',
    move: (_m, t) => {
      if (t.length === 0) return 'C';
      if (t[t.length - 1] === 'D') return Math.random() < 0.1 ? 'C' : 'D';
      return 'C';
    },
  },
  {
    id: 'stft',
    name: 'Suspicious TfT',
    short: 'STfT',
    color: '#fbbf24',
    desc: 'Like TfT but defects on the very first move. Distrustful by default.',
    move: (_m, t) => t.length === 0 ? 'D' : t[t.length - 1],
  },
];
