# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

All three apps are pure ES modules with no build step. They must be served — `file://` won't work.

```bash
npm run serve        # → serve .  (open localhost:3000 by default)
# or:
npx serve .
```

- Root (`/`) — narrative campaign (the trust game). On Vercel, `/` is served from `trust/index.html` via a rewrite in `vercel.json`; the app physically lives in `trust/`.
- `/tournament/` — tournament simulator
- `/spatial/` — spatial grid simulator
- `/trust/` — narrative campaign (same app the root rewrite points at)

Locally, `serve .` does not apply `vercel.json`, so open the folder paths directly (`/trust/`, `/tournament/`, `/spatial/`); root `/` is a directory listing.

## Architecture

### Core — the shared engine (`core/`)

The shared substrate every app consumes. Source of truth for strategy behavior.

- `core/registry.js` — the canonical 9-strategy cast (`allC`, `allD`, `tft`, `grim`, `tf2t`, `pavlov`, `gtft`, `stft`, `rand`) expressed as condition-action rule data. Also exports `CANONICAL_TOURNAMENT_SEED = 1` (load-bearing: the trust evolution view's INSIGHTS copy was written against the ranking this seed produces; an assert at the top of `evolution-view.js` trips if it ever drifts).
- `core/strategy.js` — `compileStrategy(spec)` turns a strategy spec (`{ id, name, color, source, description, rules? | config?, version: 1 }`) into a runnable form. Also `configToRules(simplifiedConfig)` for the builder UI shape (Phase 2), and `encodeStrategy`/`decodeStrategy` for shareable URLs.
- `core/conditions.js` — 19 atomic conditions (`always`, `first-round`, `opponent-last-was D`, `opponent-defected-count-in-last N at-least K`, etc.) plus `and`/`or`/`not` composites. Pre-parsed at compile time so `.move()` is a tight loop.
- `core/actions.js` — 7 actions (`cooperate`, `defect`, `mirror-opponent`, `repeat-last-move`, `flip-last-move`, `random`, `random-weighted P`).
- `core/match.js` — `runMatch(stratA, stratB, environment) → MatchResult`. Single source of truth for two-strategy IPD play. Environment defaults: `{ rounds: 50, noise: 0, payoffs: { R:3, T:5, P:1, S:0 }, masterSeed: 1 }`.
- `core/rng.js` — seeded mulberry32 PRNG. `makeStrategyRng(masterSeed, strategyId)` derives a per-strategy stream via `hash(masterSeed, strategyId)`, so a strategy's probabilistic decisions are consistent across opponents — without this, GTfT's RNG state would depend on who it played first.
- `core/classify.js` — `classify(playerHistory) → { character, confidence, runnerUp, ... }`. Cross-character single-stream classifier behind the Phase 1 player mirror.

#### Strategy runtime contract

```js
// A compiled strategy exposes:
compiled.move(ctx) → 'C' | 'D'

// ctx is built fresh per round by runMatch (or the caller):
ctx = {
  myMoves:     ['C', 'D', ...],   // this strategy's own past moves
  theirMoves:  ['C', 'C', ...],   // opponent's past moves
  round:       0,                  // current round index (0-based)
  totalRounds: 50,
  rng:         { float: () => ... },  // derived per-strategy stream
}
```

Strategies are stateless across rounds. All "memory" comes from `ctx`. Strategies cannot see opponent identity — they see moves only. This is a deliberate game-theoretic choice (preserves IPD model integrity vs signaling games) and what makes a strategy portable across the campaign, tournament, evolution, and spatial views.

### Tournament Simulator (`tournament/index.html`, `tournament/js/`)

Round-robin tournament between selectable strategies. `tournament/js/tournament.js` is a thin wrapper: `runMatch` adapts `core/match.js` output to root's historical `{ scoreA, scoreB, roundLog }` shape (scores averaged per round). `runTournament` and `runEvolution` live here too — `runEvolution` is the replicator-dynamics population sim that Phase 4 will graduate into a presentation-grade view. `main.js` owns DOM state and wires UI; `chart.js` renders the evolution chart on a `<canvas>`.

`tournament/js/strategies.js` is a display wrapper over `core/registry.js` — it contributes tournament-specific colors / short names / descriptions but no behavior. Behavior comes from `compileStrategy(REGISTRY[id])` inside `tournament.js`. No `.move` on the display objects.

### Spatial Simulator (`spatial/`)

160×120 toroidal grid (`world.js`). Each cell holds a strategy index into the `ORDER` array. Per generation: every cell plays `scoreAvsB` against all 8 Moore neighbours (a tight loop over `COMPILED[a].move(ctx)`), then adopts the highest-scoring neighbour's strategy. Uses `Uint8Array`/`Float32Array` and pre-allocated `_mA`/`_mB`/`_ctxA`/`_ctxB` buffers to avoid GC churn at ~153,600 match calls per generation.

`spatial/js/strategies.js` exports `STRATEGIES` (display), `COMPILED` (pre-compiled core strategies, indexed by position), and `SI` (name→index map derived from `ORDER`). The `ORDER` array is the canonical positional assignment — reordering it breaks any saved grid. `SI` is auto-derived from `ORDER`, so adding a strategy is one edit, not two.

### Trust Game — Narrative Campaign (`trust/`)

Linear campaign where the player plays IPD against 6 characters, each a disguised strategy. View flow: `cold-open → dilemma → intro-card → match → summary → campaign-end → reveal → evolution`.

**Routing:** `main.js` owns the `navigate(viewName, params)` function. Views are shown/hidden by toggling the `active` CSS class on `#view-*` elements.

**Characters** (`characters.js`): each entry has `strategyId`, `rounds`, per-outcome `summaryC`/`summaryD` text, and `revealName`. The campaign order is the array order. The `strategyId` refers to a key in `core/registry.js`. There is no `trust/js/strategies.js` — all behavior is sourced from `core/registry.js`.

**Match engine** (`trust/js/match.js`): stateful closure exposing `step(humanMove)` and `getHistory()`. Fixed payoffs `{R:3, T:5, P:1, S:0}` from `core/match.js`'s `DEFAULT_PAYOFFS`. The bot's perspective is preserved by swapping `myMoves`/`theirMoves` in the ctx fields it passes to `strategy.move`:

```js
const ctx = {
  myMoves:    theirMoves,   // bot's own history
  theirMoves: myMoves,      // bot sees human's history
  ...
};
```

The contract is `move(ctx)` — same as everywhere else. The swap is local to `trust/js/match.js`; the strategy itself is unchanged. Don't rewrite this unless you understand why.

**Progress** (`progress.js`): persisted in `localStorage` under key `tg_state`. Schema declared in full per the Phase 0 architecture plan; the campaign block populates as the player progresses:

```js
{
  campaign: {
    completedCharacters: [],
    playerHistory: { [charId]: { myMoves, theirMoves, timestamp, roundsPlayed } },
    sequenceOfEncounters: [],
  },
  userStrategies: [],                              // built in Phase 2
  history: { tournaments: [], simulations: [] },   // populated as features ship
  experiments: [],                                 // built in Phase 3
  preferences: { reducedMotion, soundEnabled },
  // legacy top-level fields kept for back-compat with main.js / dev-menu
  charIndex?, completed?, done?, myMoves?, theirMoves?,
}
```

`campaign.playerHistory` is the data dependency for Phase 1's player mirror and any future "you played like X" surface — it is *not* cleared on character completion (unlike the legacy `myMoves`/`theirMoves` mid-match scratch).

**Evolution view** (`trust/js/views/evolution-view.js`): runs a 9-strategy round-robin at `CANONICAL_TOURNAMENT_SEED`, animates the racing bars, then sort + insight lines + the Phase 1 mirror as a 5th insight with a divider. The classifier is `core/classify.js`.

## Per-strategy RNG (load-bearing for determinism)

`core/match.js` calls `makeStrategyRng(masterSeed, strategyId)` for each side, so:

- **Same `(masterSeed, strategyId)` → identical RNG stream**, every time. A strategy's "personality" is consistent across opponents — GTfT's forgiveness coin-flips at round 7 are the same whether it's playing Marcus or Maya.
- **Cross-strategy comparison is honest** under a shared master seed. "Sam beat Marcus by 13 more points than GTfT did" is meaningful because both Sam-vs-Marcus and GTfT-vs-Marcus use the same Marcus RNG state.
- **Environment noise** uses its own derived stream (`'__env__'`) so it doesn't drain from strategy RNGs.

Anything that needs reproducible tournament results passes a fixed `masterSeed` to `runMatch`. The `MASTER_SEED = 1` in `tournament/js/tournament.js` and `CANONICAL_TOURNAMENT_SEED = 1` in `core/registry.js` are both this.

## Testing & verification

```bash
npm test                          # runs every core/__*.mjs node smoke test in sequence; fails if any fail
python3 core/__mirror_e2e.py      # campaign mirror E2E (Playwright; requires the server to be running)
npm run serve                     # smoke-test UI changes in a browser
```

What's covered:
- `core/__smoke_test.mjs` — strategy cast behavior, encode/decode round-trip, RNG determinism and per-strategy independence (Phase 0 verification tests 2, 4, 5)
- `core/__classify_test.mjs` — self-classification per archetype, edge cases, the documented Grim→TfT tie default
- `core/__seed_sweep.mjs` — diagnostic: tournament ranking stability across 6 seeds (no assertions; informational)
- `core/__tournament_check.mjs` — diagnostic: prints the current canonical-seed ranking
- `core/__mirror_e2e.py` — campaign mirror end-to-end via Playwright; seeds three play patterns and asserts each fires the expected mirror line. Run separately because it needs Python + a running server.

Conventions:
- When changing a `core/` module (rng, conditions, actions, strategy, match, registry, classify), run `npm test` and paste the output before reporting done. Never report done on red.
- The smoke suite is pure logic — no DOM, no canvas, no animation. UI changes get smoke-tested in a browser via `npm run serve`.
- If a smoke test disagrees with the source, the test is wrong until proven otherwise. Don't edit `core/` to make a check pass — find the real bug or fix the test.

## Copy source of truth

All narrative text for the trust game lives in `trust/copy.md`. When editing character text, update both `copy.md` and the corresponding entry in `trust/js/characters.js`. The `INSIGHTS` array in `trust/js/views/evolution-view.js` is coupled to `CANONICAL_TOURNAMENT_SEED` — an assert at the top of that file trips if the seed changes, so the dependency can't drift silently.
