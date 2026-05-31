"""End-to-end verification of Phase 0 refactor.

Runs all 3 apps headless, watches for console errors, plays a Sam match
in the trust campaign, and verifies player history persists per the new
schema."""

import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:56559"

errors = []
failed = 0


def ok(name, cond):
    global failed
    if cond:
        print(f"  ok  {name}")
    else:
        failed += 1
        print(f"  FAIL {name}")


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context()
        page = ctx.new_page()

        page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        # Root tournament
        print("→ Root /")
        page.goto(f"{BASE}/")
        page.wait_for_load_state("networkidle")
        page.click("#run-btn")
        page.wait_for_timeout(800)
        ok("root matrix renders", page.query_selector(".m-cell") is not None)

        # Spatial
        print("→ Spatial /spatial/")
        page.goto(f"{BASE}/spatial/")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(600)
        ok("spatial canvas present", page.query_selector("canvas") is not None)

        # Trust campaign
        print("→ Trust /trust/")
        page.goto(f"{BASE}/trust/")
        page.wait_for_load_state("networkidle")
        page.evaluate("localStorage.removeItem('tg_state')")
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(400)

        # Cold open: tap to advance
        page.click("#view-cold-open", force=True)
        page.wait_for_timeout(400)

        # Dilemma: choose Share, then continue
        page.click('#view-dilemma [data-action="share"]')
        page.wait_for_timeout(2400)
        page.click('#view-dilemma [data-action="continue"]')
        page.wait_for_timeout(500)

        # Intro card: Play
        play = page.query_selector('[data-action="begin-match"]')
        ok("intro card play button present", play is not None)
        if play:
            play.click()
        page.wait_for_timeout(500)

        # Sam = AllC, 3 rounds. Play Share each round.
        for r in range(3):
            page.wait_for_selector('#view-match [data-action="share"]:not([disabled])', timeout=3000)
            page.click('#view-match [data-action="share"]')
            page.wait_for_timeout(1500)

        state = page.evaluate("JSON.parse(localStorage.getItem('tg_state'))")
        print("\n  state.campaign:")
        print("    " + json.dumps(state.get("campaign"), indent=2).replace("\n", "\n    "))

        print("\n── Verification ──")
        sam = (state.get("campaign", {}) or {}).get("playerHistory", {}).get("sam")
        ok("campaign.playerHistory.sam exists", sam is not None)
        if sam:
            ok("sam.myMoves length == 3", len(sam.get("myMoves", [])) == 3)
            ok("sam.myMoves all C", all(m == "C" for m in sam.get("myMoves", [])))
            ok("sam.theirMoves all C (Sam is AllC)", all(m == "C" for m in sam.get("theirMoves", [])))
            ok("sam.roundsPlayed == 3", sam.get("roundsPlayed") == 3)
            ok("sam.timestamp present", isinstance(sam.get("timestamp"), (int, float)))
        camp = state.get("campaign", {})
        ok("sequenceOfEncounters includes sam", "sam" in camp.get("sequenceOfEncounters", []))
        ok("completedCharacters includes sam", "sam" in camp.get("completedCharacters", []))
        ok("legacy completed.sam == 'C'", state.get("completed", {}).get("sam") == "C")
        ok("legacy myMoves cleared", state.get("myMoves") is None)

        browser.close()

    print(f"\n{len(errors)} console errors")
    for e in errors:
        print(f"  {e}")

    sys.exit(1 if errors or failed > 0 else 0)


if __name__ == "__main__":
    run()
