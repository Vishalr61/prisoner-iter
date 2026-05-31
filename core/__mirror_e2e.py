"""End-to-end verification of Phase 1 mirror line.

Seeds three different player histories in localStorage (always-share, always-take,
TfT-pattern), navigates to the evolution view via the dev menu, waits for the
animations to complete, and reads the mirror line text from the DOM.

Asserts that each play pattern produces the expected mirror line.
"""

import json
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:56559"

# Build synthetic player histories for three archetypes.
# Each character's bot behavior is deterministic given the player's moves.

CAMPAIGN = [
    ('sam',    'allC',   3),
    ('marcus', 'allD',   3),
    ('maya',   'tft',    8),
    ('theo',   'grim',   5),
    ('naomi',  'tf2t',   5),
    ('ren',    'pavlov', 8),
]


def simulate_bot(strategy_id, player_moves):
    """Returns the bot's moves given player_moves, using the strategy's rule."""
    bot_moves = []
    for r, pm in enumerate(player_moves):
        my = bot_moves[:]
        their = player_moves[:r]
        if strategy_id == 'allC':
            bm = 'C'
        elif strategy_id == 'allD':
            bm = 'D'
        elif strategy_id == 'tft':
            bm = 'C' if not their else their[-1]
        elif strategy_id == 'grim':
            bm = 'D' if 'D' in their else 'C'
        elif strategy_id == 'tf2t':
            if len(their) >= 2 and their[-1] == 'D' and their[-2] == 'D':
                bm = 'D'
            else:
                bm = 'C'
        elif strategy_id == 'pavlov':
            if not my:
                bm = 'C'
            else:
                last_my, last_their = my[-1], their[-1]
                won = (last_my == 'C' and last_their == 'C') or (last_my == 'D' and last_their == 'C')
                bm = last_my if won else ('D' if last_my == 'C' else 'C')
        else:
            raise ValueError(strategy_id)
        bot_moves.append(bm)
    return bot_moves


def build_history(player_fn):
    """player_fn(char_id, bot_moves_so_far) → 'C' or 'D' for next move."""
    history = {}
    for char_id, strat_id, rounds in CAMPAIGN:
        player_moves = []
        bot_moves = []
        for r in range(rounds):
            pm = player_fn(char_id, bot_moves)
            player_moves.append(pm)
            bot_moves = simulate_bot(strat_id, player_moves)
        history[char_id] = {
            'myMoves': player_moves,
            'theirMoves': bot_moves,
            'timestamp': 1700000000000,
            'roundsPlayed': rounds,
        }
    return history


# Three player patterns
HISTORIES = {
    'always-share': build_history(lambda _c, _b: 'C'),
    'always-take':  build_history(lambda _c, _b: 'D'),
    'tft-mirror':   build_history(lambda _c, bot: 'C' if not bot else bot[-1]),
}

EXPECTED_MIRROR = {
    'always-share': 'You played like Sam',
    'always-take':  'You played like Marcus',
    'tft-mirror':   'You played like Maya',
}


def seed_state(page, history):
    """Inject a full progress state with the given playerHistory."""
    state = {
        'campaign': {
            'completedCharacters': list(history.keys()),
            'playerHistory': history,
            'sequenceOfEncounters': list(history.keys()),
        },
        'userStrategies': [],
        'history': {'tournaments': [], 'simulations': []},
        'experiments': [],
        'preferences': {'reducedMotion': False, 'soundEnabled': True},
        'done': True,
        'completed': {c: ('C' if any(m == 'C' for m in h['myMoves']) else 'D')
                     for c, h in history.items()},
    }
    page.evaluate(f"localStorage.setItem('tg_state', {json.dumps(json.dumps(state))})")


failed = 0
errors = []


def ok(name, cond, detail=''):
    global failed
    if cond:
        print(f"  ok  {name}")
    else:
        failed += 1
        print(f"  FAIL {name}  {detail}")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context()
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console error: {m.text}") if m.type == "error" else None)

    for pattern_name, history in HISTORIES.items():
        print(f"\n→ Pattern: {pattern_name}")
        page.goto(f"{BASE}/trust/")
        page.wait_for_load_state("networkidle")
        seed_state(page, history)
        # Mark reveal as already-seen so the choreography shows instantly.
        page.evaluate("localStorage.setItem('tg_reveal_seen', '1')")
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(400)

        # Resume should land on campaign-end (done:true). Click through to reveal.
        page.click('#view-campaign-end [data-action="reveal"]')
        page.wait_for_timeout(400)
        # Reveal → click "Watch them compete"
        page.wait_for_selector('#view-reveal [data-action="to-evolution"]', timeout=5000)
        page.click('#view-reveal [data-action="to-evolution"]')

        # Wait for the mirror line to appear (last insight, ~10s into animation).
        try:
            page.wait_for_selector(".evo-mirror.shown", timeout=20000)
        except Exception as e:
            print(f"    TIMEOUT waiting for mirror — error: {e}")
            failed += 1
            continue

        mirror_text = page.eval_on_selector(".evo-mirror", "el => el.textContent.trim()")
        print(f"  mirror: {mirror_text}")
        expected = EXPECTED_MIRROR[pattern_name]
        ok(f"{pattern_name} → mirror contains '{expected}'", expected in mirror_text, f"got: {mirror_text}")

    browser.close()

if errors:
    print(f"\n{len(errors)} console errors:")
    for e in errors:
        print(f"  {e}")
sys.exit(1 if failed > 0 or errors else 0)
