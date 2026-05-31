// Persistence for the trust campaign.
//
// Schema (Phase 0 — declared in full per architecture plan; some blocks
// are unused until later phases):
//   {
//     // Legacy top-level fields (kept for back-compat with main.js / dev-menu)
//     charIndex?,
//     completed?: { [charId]: 'C' | 'D' },
//     done?: boolean,
//     myMoves?, theirMoves?,        // mid-match scratch (cleared on completion)
//
//     campaign: {
//       completedCharacters: string[],
//       playerHistory: { [charId]: { myMoves, theirMoves, timestamp, roundsPlayed } },
//       sequenceOfEncounters: string[],
//     },
//     userStrategies: [],            // built in Phase 2
//     history: { tournaments: [], simulations: [] },  // populated as features ship
//     experiments: [],               // built in Phase 3
//     preferences: { reducedMotion: false, soundEnabled: true },
//   }

const KEY = 'tg_state';

const EMPTY_CAMPAIGN = () => ({
  completedCharacters: [],
  playerHistory: {},
  sequenceOfEncounters: [],
});

const EMPTY_STATE = () => ({
  campaign:       EMPTY_CAMPAIGN(),
  userStrategies: [],
  history:        { tournaments: [], simulations: [] },
  experiments:    [],
  preferences:    { reducedMotion: false, soundEnabled: true },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return upgrade(parsed);
  } catch {
    return null;
  }
}

// Ensure the loaded state has the full schema (older saves may be missing
// the new top-level blocks). Idempotent.
function upgrade(state) {
  if (!state.campaign) state.campaign = EMPTY_CAMPAIGN();
  state.campaign.completedCharacters  ??= [];
  state.campaign.playerHistory        ??= {};
  state.campaign.sequenceOfEncounters ??= [];
  state.userStrategies ??= [];
  state.history        ??= { tournaments: [], simulations: [] };
  state.experiments    ??= [];
  state.preferences    ??= { reducedMotion: false, soundEnabled: true };
  return state;
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private browsing or storage full — degrade silently
  }
}

// Called after each completed round during a character match.
export function saveProgress(charIndex, history) {
  const state = load() || EMPTY_STATE();
  state.charIndex  = charIndex;
  state.myMoves    = history.map(r => r.humanMove);
  state.theirMoves = history.map(r => r.botMove);
  save(state);
}

// Called when a character match is fully completed.
// Preserves the full move history under campaign.playerHistory[charId] —
// this is the data Phase 1 (player mirror) and beyond depend on.
export function markCompleted(charId, coopRate, history) {
  const state = load() || EMPTY_STATE();
  state.completed = state.completed || {};
  state.completed[charId] = coopRate >= 0.5 ? 'C' : 'D';

  // Persist full move history (NEW — Phase 0).
  if (history && history.length > 0) {
    state.campaign.playerHistory[charId] = {
      myMoves:      history.map(r => r.humanMove),
      theirMoves:   history.map(r => r.botMove),
      timestamp:    Date.now(),
      roundsPlayed: history.length,
    };
    if (!state.campaign.completedCharacters.includes(charId)) {
      state.campaign.completedCharacters.push(charId);
    }
    if (!state.campaign.sequenceOfEncounters.includes(charId)) {
      state.campaign.sequenceOfEncounters.push(charId);
    }
  }

  // Clear mid-match scratch.
  delete state.myMoves;
  delete state.theirMoves;
  save(state);
}

export function markCampaignDone() {
  const state = load() || EMPTY_STATE();
  state.done = true;
  save(state);
}

export function clearProgress() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function getSavedProgress() {
  return load();
}

// ── User-built strategies (Phase 2) ──────────────────────────────────────────

export function getUserStrategies() {
  return load()?.userStrategies ?? [];
}

// Appends a spec. Caller is responsible for assigning a unique id
// (typically `player-<timestamp>-<rand>`).
export function saveUserStrategy(spec) {
  const state = load() || EMPTY_STATE();
  state.userStrategies = state.userStrategies || [];
  state.userStrategies.push(spec);
  save(state);
}

export function deleteUserStrategy(id) {
  const state = load() || EMPTY_STATE();
  state.userStrategies = (state.userStrategies || []).filter(s => s.id !== id);
  save(state);
}
