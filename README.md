# Iterated Prisoner's Dilemma — Three Ways to Play

A suite of interactive tools for exploring the Iterated Prisoner's Dilemma: a classic game theory problem about what happens when self-interest and mutual benefit collide, over and over again.

## What's here

Three standalone apps, all pure ES modules, no build step.

```
/          → Tournament simulator
/spatial/  → Territorial arena
/trust/    → The Trust Game (narrative campaign)
```

### Run locally

```bash
npx serve .
```

Open `http://localhost:3000`. That's it.

---

## The Tournament Simulator (`/`)

Round-robin tournament between strategies. Pick which strategies compete, set how many rounds per match, and watch scores accumulate. Optional evolutionary mode: after each generation, strategies with higher scores spread; weaker ones shrink. Mutation adds noise to prevent convergence.

**Strategies included:**

| Strategy | Behaviour |
|---|---|
| Always Cooperate | Shares every round. Generous, easily exploited. |
| Always Defect | Takes every round. Wins against naive cooperators; loses to everything else long-term. |
| Tit for Tat | Cooperates first, then mirrors. Axelrod's original tournament winner. |
| Tit for Two Tats | Forgives a single defection; retaliates after two in a row. Robust to noise. |
| Grim Trigger | Cooperates until first betrayal, then defects forever. |
| Pavlov | Win-Stay, Lose-Shift. Repeats what worked. Switches after punishment. |
| Random | 50/50 coin flip. Unpredictable; never fully exploited, never fully trusted. |
| Generous TfT | Like TfT but randomly forgives ~10% of defections, escaping retaliation spirals. |
| Suspicious TfT | Like TfT but defects first. Distrustful by default. |

Evolution uses replicator dynamics: each generation, proportions update as `p_i' ∝ p_i × fitness_i`, normalised, with optional uniform-blend mutation.

---

## The Territorial Arena (`/spatial/`)

160×120 toroidal grid. Every cell holds a strategy. Each generation, cells score against all eight Moore neighbours, then adopt the highest-scoring neighbour's strategy. Watch territories form, collapse, and invade.

Visually: a bioluminescent petri-dish aesthetic. Strategies as living colonies.

The interesting part: spatial structure changes which strategies survive. A Grim Trigger cluster can hold territory against Always Defect. A Tit-for-Tat blob can absorb and convert Random. Outcomes diverge from what the tournament predicts.

---

## The Trust Game (`/trust/`)

A narrative campaign. You meet six people — a friend, a roommate, a business partner, a cousin, a sister, someone unpredictable. You play rounds of the prisoner's dilemma against each one. At the end, you find out who they really were.

**The payoffs:**

| | They share | They take |
|---|---|---|
| **You share** | 3 · 3 (mutual gain) | 0 · 5 (they exploit) |
| **You take** | 5 · 0 (you exploit) | 1 · 1 (mutual loss) |

**The six characters:**

| Character | Relation | Strategy | Rounds |
|---|---|---|---|
| Sam | The friend who covered your rent | Always Cooperate | 3 |
| Marcus | Your old roommate | Always Defect | 3 |
| Maya | Your business partner | Tit-for-Tat | 8 |
| Theo | Your cousin | Grim Trigger | 5 |
| Naomi | Your sister | Tit-for-Two-Tats | 5 |
| Ren | The friend who thinks in patterns | Win-Stay, Lose-Shift | 8 |

The reveal at the end names the strategy behind each character and explains what made it tick.

Progress is saved to `localStorage`. Reload mid-game and you pick up where you left off.

---

## Architecture

All three apps share the same strategy contract:

```js
{ move(myMoves, theirMoves) }  // returns 'C' or 'D'
```

The trust game uses a subset: only the six classical strategies, no Random or variants.

**Trust game view flow:**

```
cold-open → dilemma → intro-card → match → summary → [repeat] → campaign-end → reveal
```

Routing is a single `navigate(viewName, params)` function in `trust/js/main.js`. Views are shown/hidden by toggling `.active` on `#view-*` elements.

**Spatial arena internals:**

Grid state is a `Uint8Array`. Scores are a `Float32Array`. Move buffers are pre-allocated to avoid GC pressure. The renderer writes directly to `ImageData` on a `<canvas>`.

---

## The underlying game

The prisoner's dilemma: two players each choose to cooperate or defect, simultaneously, without knowing the other's choice. Defecting beats cooperating regardless of what the other player does — but if both defect, both lose. If both cooperate, both win more than if both defect.

Iterate it. Add memory, reputation, the possibility of punishment. Now cooperation can emerge and sustain itself. That's the discovery Axelrod made running tournaments in the early 1980s: simple reciprocity — cooperate, then mirror — outperformed every more complex strategy.

That result is the backbone of this project.
